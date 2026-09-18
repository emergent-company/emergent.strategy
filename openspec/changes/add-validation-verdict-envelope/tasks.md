# Tasks: Validation verdict envelope

Record the test baseline before starting: `go test ./...` from
`apps/strategy-server` with Postgres up. As of 2026-09-18: 40 packages, 0
failures. Lint clean.

No dependency on any other in-flight change.

Resolve design open questions 1, 2 and 4 before starting section 3 — they
change the shape of `Finding`, and changing it after five tools are wired is
five times the work.

## 1. Structured findings in the validator

- [ ] 1.1 Add `Finding` and `Findings []Finding` to
      `embedded.ValidationResult` (`internal/embedded/validator.go:131`).
- [ ] 1.2 Populate `Findings` from `jsonschema.ValidationError` — map
      `InstanceLocation` → `Path`, `KeywordLocation`/`ErrorKind` → `Rule`.
      Do not derive these by parsing `e.Error()` (design Decision 2).
- [ ] 1.3 Leave `Errors []string` populated exactly as today. Every existing
      reader must keep working with no change.
- [ ] 1.4 Handle the four early-return paths (`validator.go:167-198`: schema
      parse, register, compile, bad JSON). These are tool/input failures with
      no instance location — decide whether they are findings with
      `rule: "schema.unavailable"` or a genuine `isError`. They are arguably
      the latter: the call could not be performed.
- [ ] 1.5 Test: a payload with two distinct schema violations yields two
      findings with distinct `(rule, path)` pairs, and the same `Errors`
      strings as before the change.
- [ ] 1.6 Test: finding identity is stable across two runs on identical input
      — this is the property the issue's baselining use case depends on.

## 2. The envelope

- [ ] 2.1 Define `Verdict`, `VerdictCounts` and the shared `Finding` shape in
      a single place under `internal/mcpserver/` (or a small shared package
      if the validator needs the same type — avoid duplicating it).
- [ ] 2.2 Helper that builds a `Verdict` from a set of findings: computes
      `Counts`, sets `OK = (Counts.Error == 0)`, renders `Summary`.
- [ ] 2.3 Package-level schema cache + `mcp.WithCachedOutputSchema[Verdict]`
      so the type is reflected once, not five times (design Decision 3).
- [ ] 2.4 Test the helper directly: counts roll up correctly; `OK` ignores
      warnings and info; `Checked` distinguishes "clean" from "nothing ran".

## 3. Wire the five tools

Each: attach `outputSchema`, return `structuredContent`, keep the existing
`content` byte-for-byte unchanged (design Decision 4).

- [ ] 3.1 `validate_artifact` (`server.go:1765`)
- [ ] 3.2 `validate_instance` (`server.go:1788`) — `Checked` is
      `artifact_count`; findings carry `key` = artifact key
- [ ] 3.3 `validate_relationships` (`server.go:1846`) — resolve open
      question 2 first
- [ ] 3.4 `check_content_readiness` — resolve open question 1 first
- [ ] 3.5 `validate_with_plan` (`register_phase2c_tools.go:172`) — the
      chunked fix plan stays in `content`, not in the envelope
- [ ] 3.6 Update all five tool descriptions to say what `ok` means and to
      point at `findings` for anything beyond the trivial case. Do not let a
      description imply `ok` is meaningful on an instance with a tolerated
      backlog (design Decision 1).

## 4. Contract verification

- [ ] 4.1 Test per tool: `structuredContent` validates against the tool's own
      published `outputSchema`. Assert against the schema the server actually
      advertises, not a copy — a hand-copied expectation cannot catch drift.
- [ ] 4.2 Test: a tool that finds problems returns `isError: false`. This is
      the invariant the issue is most concerned with; it deserves an explicit
      test that fails loudly if someone "fixes" it later.
- [ ] 4.3 Test: `content` is unchanged from the pre-change output for a fixed
      input, proving the addition is non-breaking.
- [ ] 4.4 Resolve open question 3 — check `internal/handler` and the harness's
      `internal/strategy/client` for anything that would start validating
      against `outputSchema` on upgrade.

## 5. Publication and docs

- [ ] 5.1 `task selfmodel:generate`; confirm `outputSchema` appears on all
      five tools and the drift check passes.
- [ ] 5.2 Document the envelope in `apps/strategy-server/AGENTS.md` — what
      `ok` means, why `isError` stays reserved for call failure, and that
      `health_check` deliberately has no verdict.
- [ ] 5.3 Comment on issue #53 with the deviations: `health_check` out of
      scope, and `ok` is advisory on backlogged instances.
- [ ] 5.4 Full suite + `task lint`; compare to the baseline recorded above.
