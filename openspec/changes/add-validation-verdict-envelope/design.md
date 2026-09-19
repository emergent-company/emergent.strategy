# Design: Validation Verdict Envelope

## Context

Five MCP tools render a validation verdict, each with its own ad-hoc JSON
shape and no `outputSchema`. Consumers that need to act must hand-roll parsing
per tool. Issue #53 proposes one envelope across all of them.

The governing separation, taken from the issue and worth restating because
every decision below follows from it:

> The server owns the **shape** of a verdict. The consumer owns the
> **threshold** for acting on it.

## Decision 1: The envelope

```go
type Verdict struct {
    OK       bool              `json:"ok"`
    Summary  string            `json:"summary"`
    Counts   VerdictCounts     `json:"counts"`
    Findings []Finding         `json:"findings"`
}

type VerdictCounts struct {
    Error   int `json:"error"`
    Warning int `json:"warning"`
    Info    int `json:"info"`
    Checked int `json:"checked"`
}

type Finding struct {
    Severity string `json:"severity"`          // error | warning | info
    Key      string `json:"key,omitempty"`     // artifact key, e.g. "fd-001"
    Rule     string `json:"rule"`              // stable rule id, e.g. "schema.required"
    Path     string `json:"path,omitempty"`    // JSON pointer within the artifact
    Message  string `json:"message"`           // human-readable
}
```

`Counts.Checked` is deliberately included: "0 errors" means something very
different when 185 artifacts were checked versus when 0 were. Without it a
consumer cannot distinguish "clean" from "nothing ran".

### `ok` semantics

`ok == (Counts.Error == 0)`. Warnings and info do not affect it.

This is the narrowest defensible definition and the only one that does not
embed a policy. Considered and rejected:

- **`ok` = no findings at all.** Makes warnings block, which no consumer
  asked for and which would make `ok` even less useful than it already is on
  a real instance.
- **`ok` = configurable severity floor.** Moves the threshold to the server,
  which is exactly backwards. A consumer that wants a different floor has
  `findings` and can compute it.

Accepted consequence, stated plainly in the tool descriptions: on an instance
with a tolerated backlog — `f0c81e00` is 132/185 invalid today — `ok` is
permanently `false` and carries no signal. Consumers that need to act there
must baseline `findings` and compare. `ok` is for the simple case, not the
real one, and the description must not pretend otherwise.

## Decision 2: Structured findings come from the validator, not the MCP layer

Reformatting `Errors []string` into `Finding` at the MCP boundary would be
faster and is the obvious shortcut. Rejected.

`validator.go:201-212` currently does:

```go
if ve, ok := err.(*jsonschema.ValidationError); ok {
    for _, e := range ve.Causes {
        result.Errors = append(result.Errors, e.Error())   // structure discarded here
    }
}
```

`jsonschema.ValidationError` carries `InstanceLocation` (→ `Path`),
`KeywordLocation` and `ErrorKind` (→ `Rule`). Recovering `Rule` by
regex-matching the rendered English is fragile and would silently degrade on
a library upgrade.

It also defeats the issue's primary use case. Baselining findings and failing
only on new ones needs findings to have **stable identity across runs**.
`(key, rule, path)` is stable. A prose message is not — it changes whenever
the library rewords, which would present as a wave of phantom "new" findings.

So: add `Findings []Finding` to `embedded.ValidationResult`, populated from
the structured error. Keep `Errors []string` exactly as it is, derived the
same way, so every existing reader — including `validate_with_plan`'s
chunking and the web UI — keeps working untouched.

### Correction after first contact with real data

This decision originally also said Findings would mirror Errors index-for-
index, taking only the library's top-level causes, on the grounds that
divergence would be surprising. That was decided before running it against a
real instance, and it was wrong.

The library groups under applicator keywords. On the live instance, a single
definition artifact with 18 distinct field-level violations produced exactly
one top-level cause: rule `schema.allOf`, no path, and all 18 problems
concatenated into one newline-delimited message. That fails both things
findings exist for — a consumer cannot act on it (nothing names a field) and
cannot baseline it (fixing 17 of the 18 leaves an identical
`(key, rule, path)` triple).

Findings are therefore flattened to the **leaves** of the error tree, and no
longer align with Errors by index. Errors keeps the library's grouping
unchanged for its existing readers. Measured effect on the live instance: 65
opaque `schema.allOf` findings became 280 findings naming a rule and a JSON
pointer each.

## Decision 3: One `outputSchema`, registered per tool

All five tools declare the same envelope via
`mcp.WithOutputSchema[Verdict]()`. Tools that have extra, tool-specific data
(`validate_with_plan`'s chunked fix plan, `validate_instance`'s per-artifact
breakdown) keep returning it in `content` as they do today, and do not extend
the envelope.

Rationale: the envelope's value is that it is identical everywhere. A consumer
should be able to call any validation tool and read `ok` and `findings`
without knowing which tool it called. The moment tools add fields to it, that
property is gone and we are back to per-tool knowledge.

`mcp-go` offers `WithCachedOutputSchema[T]` to avoid re-reflecting the same
type five times. Use it, with a package-level cache.

## Decision 4: `content` stays, unchanged in shape

Every tool keeps emitting its current `mustJSON` body as the text content.
The spec says a tool SHOULD do this for backward compatibility, and it means
this change cannot break a consumer that is reading text today. The envelope
is purely additive.

## Decision 5: `health_check` is out of scope

Covered in the proposal. Summarised here because it is the one deviation from
issue #53's stated tool list: `health_check` reports completeness, not a
verdict, and giving it an `ok` requires the server to define "healthy", which
contradicts Decision 1's whole basis.

## Decision 6: The field names are already fixed by an existing consumer

Found while resolving the open questions: `opencode-harness` has **already
built the consumer side**, in `internal/provider/verdict.go`, and its own doc
comment names the convention as estate-wide (`emergent.strategy#53`,
`emergent.memory#586`). Its envelope is:

```go
type Finding struct {
    Severity Severity `json:"severity,omitempty"`
    Key      string   `json:"key,omitempty"`
    Rule     string   `json:"rule,omitempty"`
    Message  string   `json:"message,omitempty"`
}
type Verdict struct {
    OK       bool      `json:"ok"`
    Summary  string    `json:"summary,omitempty"`
    Findings []Finding `json:"findings,omitempty"`
}
```

So the names in Decision 1 are not ours to choose — `ok`, `summary`,
`findings[].{severity,key,rule,message}` must match exactly. Three
consequences:

- **`counts` and `path` stay, as additive extras.** The harness unmarshals
  into a struct and ignores unknown fields, so they cost it nothing, and
  `counts.checked` answers a question `findings` cannot ("did anything
  actually run?").
- **Severity must always be set explicitly.** The harness's `Blocking()`
  treats `severity == ""` as blocking. A warning emitted without a severity
  would silently become a build-breaker. `verdict.New` normalises a missing
  severity to `error` rather than letting it default to the zero value, so
  the conservative reading is at least deliberate.
- **`Message` must stand alone.** `verdictDetail` renders `key + ": " +
  message` for the first 8 blocking findings and nothing else. A message that
  only makes sense next to `path` will read as noise in a gate failure.

## Resolved: former open questions

**1. `check_content_readiness` → one finding per missing field, severity
`warning`.** `ReadinessReport.Missing []string` already enumerates the missing
field names, so per-criterion findings cost nothing and give baselining real
identity: `rule: "readiness.missing_field"`, `path: "/<field>"`.

Severity is `warning`, never `error`, which means **readiness always returns
`ok: true`**. That is correct, not a bug: readiness is a score, and deciding
which score is "failing" is exactly the threshold Decision 1 says belongs to
the consumer. The one exception is an unparseable payload, which is a genuine
`error` — the check could not be performed on it.

**2. `validate_relationships` → `key` is the source, the edge goes in
`path`.** A broken reference is `key: <source_key>`, `rule:
"relationship.broken_target"`, `path: "/<relationship>/<target_key>"`. That
keeps `(key, rule, path)` unique and stable per broken edge without adding a
`related_key` field that only one tool would populate — which would break the
uniformity Decision 3 exists to protect. The message names both endpoints so
it stands alone, per Decision 6. Severity is `error`: a dangling reference is
disqualifying.

**3. Existing consumers: only the harness, and it is ready.** Nothing in
`internal/handler` or the web UI reads `structuredContent`; the only consumer
in the estate is the harness code above, which treats a missing verdict as
"the tool did not answer" rather than as consent. Rollout order does not
matter — every tool that gains an envelope is an improvement for it, and the
ones that do not keep working unchanged.

**4. Rule ids are a stable public contract.** Consumers baseline on
`(key, rule, path)`, so churn there is a breaking change for them. Committing
to stability is cheap because the ids are derived from things that are
themselves stable: JSON Schema keywords (`required`, `type`, `enum`) via
`ErrorKind.KeywordPath()`, under a namespace prefix we own (`schema.`,
`relationship.`, `readiness.`). Documented in `AGENTS.md` as a contract, not
an implementation detail.
