# Change: Instance content integrity

Tell an instance's own strategy apart from framework content, in the health and
validation checks of both `epf-cli` and `strategy-server`, and keep framework
content out of the answers clients give about the company's strategy.

Related: `fence-memory-graph-per-instance` (scoping, provenance and the content
contract for search). This change depends on its scoped read helper for the
search part (see design Decision 4).

## Why

A pilot instance was authored almost zero-shot: `epf-cli init`, then
an AI agent filling the READY files from source documents. The result, verified
in the repository and through the server:

- 6 files are authored. About 140 are untouched framework content: 131
  canonical definitions (`sd-*`, `pd-*`, `cd-*`, byte-identical to canonical),
  the placeholder product value model, three packaged-default value models, and
  two AIM templates. They arrived in one scaffold commit and were never touched
  again.
- The AIM templates reuse real roadmap IDs (`kr-p-001`, `okr-p-001`) with
  invented outcomes (`met`, `partially_met`), and the server imported them as
  real data.
- No check notices. `validate_instance` reports "2 of 143 artifacts invalid"
  (the two templates, as schema errors) and passes the 131 definitions.
  `check_content_readiness` returns `ok: true` with "average readiness 0/100
  across 0 features". `epf-cli health` excludes canonical definitions from
  scoring by design and exits 0 on warnings.
- Clients then present framework content as the company's own. In a controlled
  comparison (isolated copies, Opus 5.5, three runs each) the question "How does
  the company recruit and hire people?" was answered "no hiring process is
  written down" in 3 of 3 runs on the cleaned copy (2 of 3 also named the one real
  hiring item), and in 0 of 3 runs on the full copy, where every answer described
  the framework's recruiting template, one of them as the company's own process.

Authors cannot be relied on to prune. The check has to live in the tools that
every authoring path and every consumer already runs.

Existing design intent is kept: `epf-cli-mcp` says canonical definitions in an
instance are expected and must not dominate health output. The failure is not
that they are present. It is that nothing distinguishes them when they are
served as strategy, and that unmodified templates and placeholders pass as
content.

## What Changes

- **Classification of framework content** with four classes: canonical reference
  (an unmodified canonical definition), unmodified template (READY, AIM or
  product value-model template), packaged default (value model with
  `packaged_default` or `status: placeholder`) and template values (known
  placeholder strings inside an authored artifact). Matching uses normalised
  parsed content against a manifest of hashes per canonical release, with a
  near-match tier for older releases.
- **Health and validation extended, not replaced.** `check_content_readiness`
  (server) and the content-readiness check (`epf-cli`) gain an `integrity.*`
  finding family, advisory like the existing readiness findings. The server's
  `health_check` and `epf-cli health` report integrity counts. `epf-cli` gets an
  opt-in strict mode for the exit code.
- **strategy-server stores the class** on `strategy_artifacts` at index
  derivation, so every import path is covered, and keeps canonical reference and
  unmodified template content out of answer-facing reads: structured lists,
  single-artifact reads and semantic search (via the scoped read helper from the
  fence change).
- **Server framing.** The MCP `instructions` and the descriptions of
  `search_strategy`, `get_definition`, `list_definitions` and `get_template` say
  what is authoritative, that search is discovery, and that definitions and
  templates are framework content.
- **Authoring prevention.** `epf init` and `epf_init_instance` gain an opt-out
  for copying definitions (default unchanged this release). A new anchor field
  records that definitions were deliberately omitted, so `sync-canonical` and the
  canonical-incomplete diagnostics stop nagging. Detection pattern bugs are
  fixed in `epf-cli`.
- **Canonical EPF companion** (separate repository): an integrity manifest per
  release, the anchor field, sample values replaced by `not_defined` in shipped
  templates, and authoring rules in the distributed `AGENTS.md`.

Not in this change: the read-side fence (own change), cleaning the pilot
repository, the client skill for the management team, and the evaluation
harness.

**Exception to maintenance mode.** `epf-cli` is in maintenance mode (bug fixes
only). The pattern and canonical-detection fixes are bug fixes. The integrity
check, the strict flag and the `init` opt-out are additive features, accepted
here because `epf-cli` is the mature authoring tool during the long overlap with
strategy-server. They are small, additive and default to existing behaviour.

## Impact

- Affected specs: `strategy-mcp` (integrity findings, health block, server
  framing, answer-facing reads), `epf-cli-mcp` (integrity in health checks,
  init option, sync-canonical behaviour), `strategy-authoring` (scaffold and
  installer do not seed framework content as strategy).
- Affected code, strategy-server: `internal/embedded` (classifier, manifest),
  `domain/strategy` (`deriveIndex`, list filters), `domain/instance`,
  `internal/mcpserver` (readiness tool, `health_check`, descriptions, scaffold),
  `internal/agent/knowledge.go` (instructions), `domain/ingest` and
  `domain/semantic` (label, exclusion), one migration (next free number at merge;
  045 is used by the fence change).
- Affected code, epf-cli: `internal/checks`, `internal/template/canonical.go`,
  `internal/validation/patterns.go`, `cmd/health.go`, `cmd/report.go`,
  `cmd/init.go`, `internal/mcp` (health, suggestions, init).
- Affected, canonical-epf (separate repository, per the constitution schema and
  template changes go there): manifest generator, anchor schema, templates,
  `AGENTS.md`.
- **Behaviour changes for consumers:** `check_content_readiness` no longer
  reports a score for an instance with no features, and returns warnings for an
  instance carrying unmodified templates. New rule ids are additive.
  `ok` is unchanged because findings are advisory.
