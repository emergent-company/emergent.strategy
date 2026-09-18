# Change: Validation Tools Return a Machine-Readable Verdict

Source: GitHub issue #53 (`emergent-company/emergent.strategy`), raised from
`opencode-harness`, which needs this to gate strategy-as-code changes. The
envelope proposed there is deliberately not harness-specific and this change
keeps it that way.

## Why

Validation tools return their verdict as prose in `content`. A caller that
wants to *act* on the result — fail a build, gate a commit, alert a dashboard
— has to parse text or reach into tool-specific JSON field names.

`validate_instance` today returns a `mustJSON` blob
(`internal/mcpserver/server.go:1832-1838`):

```json
{"instance_id":"…","artifact_count":185,"valid_count":53,"invalid_count":132,"results":[…]}
```

To answer "is this acceptable", every consumer must know the field is called
`invalid_count` and that `> 0` means trouble. Each of the five validation
tools has a different shape, so that knowledge is per-tool, and it breaks
silently on a rename. There is no `outputSchema`, so nothing is discoverable;
the shape is folklore.

**`isError` is not the answer.** `validate_instance` is a query — "what is the
validation state of this instance?" — and a dashboard, coverage report, or
surveying agent all legitimately want that answer. In MCP, `isError` means the
*call* failed, not that the *subject* is bad. Returning `isError: true` for an
invalid instance would remove a caller's ability to ask the question at all.

MCP's `structuredContent` + `outputSchema` (spec 2025-06-18) exists for exactly
this, and `mark3labs/mcp-go` v0.54.1 already supports both
(`mcp.Tool.OutputSchema`, `WithOutputSchema[T]`, `CallToolResult.StructuredContent`).
We are not using it anywhere.

### Two things the issue did not account for

**1. The current validator throws away the structure findings need.**
`embedded.ValidationResult.Errors` is `[]string`
(`internal/embedded/validator.go:131-137`), built by calling `e.Error()` on
each `jsonschema.ValidationError` cause (`validator.go:205`). The underlying
library carries `InstanceLocation`, `KeywordLocation` and `ErrorKind`; we
flatten all of it to prose.

This matters more than it looks. The issue's own headline use case —
"baseline current findings and fail only on new ones" — requires findings to
have **stable identity across runs**. A prose string is not a stable
identifier: it changes when the library reword its messages, and it cannot be
grouped by rule. So populating `findings[].rule` and `findings[].key`
honestly means preserving the structure at source, not reformatting strings
at the MCP boundary.

**2. `ok` will be permanently `false` on the flagship instance.**
The issue records 132 of 185 artifacts invalid on `f0c81e00`, and notes this
is evidently tolerated. So `ok` — the one field simple consumers are told
they can rely on — carries no signal for the main instance. That is not a
reason to drop it, but it is a reason to be precise about what it means and
to say plainly in the tool description that `findings` is the field with the
information in it.

## What Changes

- **A shared verdict envelope** returned as `structuredContent` by the five
  validation tools, with a matching `outputSchema` so it is discoverable:
  `ok`, `summary`, `findings[]`, and a `counts` roll-up.
- **Structured findings at source.** `embedded.ValidationResult` gains a
  structured `Findings []Finding` field carrying severity, instance location,
  failing keyword and message, derived from `jsonschema.ValidationError`
  rather than from its rendered string. The existing `Errors []string` stays,
  populated as before, so nothing that reads it breaks.
- **Human-readable `content` is preserved** on every tool, as the MCP spec
  says a tool SHOULD.
- **`isError` keeps its real meaning** — the call could not be performed.
  Finding problems is a successful call.

### Tools in scope

`validate_artifact`, `validate_instance`, `validate_relationships`,
`validate_with_plan`, `check_content_readiness`.

### Explicitly out of scope: `health_check`

Issue #53 lists it, and it should not be. `health_check` is a completeness and
health *report* — artifact coverage, standard-pack version, sync status. There
is no natural `ok` for it, and inventing one means the server picks a
threshold for "healthy", which is precisely the policy call this change argues
belongs to the consumer. Adding a verdict envelope to a non-verdict tool would
undermine the envelope's meaning everywhere else. Left as-is; revisit
separately if a real consumer wants it.

## Impact

- Affected spec: `strategy-mcp` (ADDED: Validation Verdict Envelope,
  Structured Validation Findings).
- Affected code:
  - `internal/embedded/validator.go` — structured findings alongside the
    existing string errors. Safe to edit: `sync-embedded.sh` only overwrites
    the `schemas/`, `templates/`, `agents/`, `skills/` and `outputs/`
    subdirectories, not hand-written Go at the package root.
  - `internal/mcpserver/server.go` — `registerArtifactValidationTools`,
    `registerRelationshipValidationTools`.
  - `internal/mcpserver/register_phase2c_tools.go` — `validate_with_plan`,
    `check_content_readiness`.
  - A new shared envelope type and its `outputSchema`, used by all five.
- `self-model.json` regenerates: tool entries gain `outputSchema`. The
  self-model generator reads the live registration, so this is automatic, but
  `task selfmodel:generate` must run and the drift check will catch it if not.
- No migration. No database change.
- **Wire-format note, carried over from the tool-filter work:** these tools
  currently return plain JSON bodies. Anything that parses MCP responses by
  hand rather than through a client library should be checked — three of our
  own test helpers assumed `application/json` and broke when SSE framing was
  introduced. `structuredContent` is an additive field and should not break a
  conformant client, but a client that validates `structuredContent` against
  a published `outputSchema` will now do so, and a mismatch becomes a hard
  client-side error rather than a silently ignored field.
- No dependency on any in-flight change.
