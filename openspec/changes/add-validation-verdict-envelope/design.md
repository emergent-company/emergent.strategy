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

## Open questions

1. **`check_content_readiness` severity mapping.** Readiness is currently
   scored, not error/warning/info. Does a low readiness score become one
   `warning` finding, or one finding per unmet criterion? Per-criterion is
   more useful for baselining but needs the underlying check to enumerate
   criteria — verify it does before committing to it.

2. **`validate_relationships` finding keys.** A broken relationship has two
   endpoints. Is `key` the source artifact, or do we need `key` plus a
   `related_key`? Adding a field to `Finding` for one tool's benefit weakens
   Decision 3; encoding both into `path` is uglier but keeps the envelope
   uniform. Decide before implementing, not during.

3. **Does any current consumer read `structuredContent` already?** If the web
   UI or an internal caller passes these responses through a client library
   that validates against `outputSchema`, the rollout order matters. Check
   `internal/handler` and the harness's `internal/strategy/client` before
   merging.

4. **Should `Rule` ids be frozen as a public contract?** If consumers baseline
   on `(key, rule, path)`, then renaming a rule id is a breaking change for
   them. Either commit to stability now and document it, or state explicitly
   that rule ids are advisory and only `key` + `path` are stable.
