# Design: Retire epf-cli — Local-First Parity

## Context

strategy-server is a Postgres-backed, server-deployed, multi-tenant platform.
epf-cli is a single Go binary that operates on a local git repo of YAML, with no
database and no network dependency. To retire epf-cli we must let strategy-server
run in that local-first mode while keeping the hosted mode unchanged.

This document records the technical decisions for the four tracks in
`proposal.md`. Tracks A and B carry the architectural risk; C and D are mostly
additive surface and process.

## Decision 1: Embedded datastore via bun dialect selection

**Decision.** Keep the existing `uptrace/bun` abstraction and make the dialect
config-selected. Local mode uses pure-Go SQLite (`modernc.org/sqlite`, no cgo);
hosted mode keeps `pgdialect` + pgx. `domain/*` services already take `*bun.DB`
and must remain dialect-agnostic.

**Why not embedded Postgres.** An embedded Postgres (e.g. `embedded-postgres`
that downloads/extracts a real `postgres` binary) gives perfect SQL parity but
breaks the "single self-contained binary, works offline" promise (it fetches a
platform binary and spawns a process). Pure-Go SQLite keeps one binary, no cgo,
no external process — the right fit for the local user.

**Risks / mitigations.**
- *SQL dialect drift.* Audit raw SQL in `domain/strategy/service.go` (the
  `deriveIndex` upsert uses `ON CONFLICT ... DO UPDATE`, which SQLite supports)
  and the migrations (`internal/database/migrations/`, goose). JSONB is the main
  exposure: SQLite has no `jsonb` type or `?`/`->'x'` operators. Mitigation:
  store JSON as `TEXT`, and route JSON predicates through bun expressions or a
  small dialect shim; the journal/query work already reads `payload` as JSON in
  Go, so most access is application-side.
- *Migration parity.* goose runs the same migration set; any
  Postgres-specific DDL (e.g. `jsonb`, partial indexes, `gen_random_uuid()`)
  needs a SQLite-compatible variant. Decision: maintain dialect-conditional
  migration statements or a parallel SQLite migration set generated from the
  canonical one, validated by running the full suite against both backends in CI.
- *Test matrix.* `internal/database/TestDB(t)` gains a SQLite variant; the suite
  runs against both dialects so regressions surface immediately.

**Alternative considered.** A storage-interface abstraction above bun (repository
pattern) was rejected as a much larger blast radius than dialect selection; bun
already is the abstraction.

## Decision 2: Local mode profile

**Decision.** Add `STRATEGY_MODE` (`hosted` default, `local`). `local` implies:
- embedded SQLite datastore at a repo-local path (e.g. `.epf/strategy.db`),
- auto-migrate on first launch,
- `AUTH_ENABLED=false` synthetic single user (already supported),
- heartbeat ticker and GitHub-App background jobs **off** by default,
- Memory optional (semantic features degrade, as they already do),
- LLM via local provider URL (Ollama) or any OpenAI-compatible endpoint.

Config precedence stays env/flag-driven (`alexflint/go-arg`). Mode only changes
**defaults and wiring**, never the domain logic.

## Decision 3: Local repo as source of truth

**Decision.** Treat a git-tracked instance directory as canonical in local mode,
with the embedded DB as a derived cache (index, ripple signals, run ledger,
versions).

- **On start:** import the instance directory via the existing
  `internal/epfimport/` parser into the DB.
- **On write/commit:** after a batch commits, export the affected artifacts back
  to YAML in the repo (reuse `export_*_yaml`), so git stays the system of record.
- **Reconciliation:** optional file-watch (or an explicit `reconcile` command)
  re-imports when the user edits YAML by hand or pulls from git.

**Why DB-derived, not DB-primary, in local mode.** The local user's mental model
is "my repo is the truth, git is my history." Versioning/ripple still need a DB,
but it must be reconstructable from the repo so a user can `rm -rf .epf` and
rebuild. This mirrors epf-cli's stateless-over-files philosophy while keeping the
richer engine.

**Open question (resolve during implementation).** Conflict policy when both the
YAML and the DB changed (hand-edit during a running cycle). Initial policy:
repo wins on reconcile; the DB re-derives; staged-but-uncommitted batches that
conflict are surfaced, not silently dropped.

## Decision 4: CLI subcommands as thin service wrappers

**Decision.** Add subcommands to the existing `main.go` go-arg dispatch
(`validate`, `health`, `locate`, `fix`, `diff`, `coverage`, `explain`,
`context`, `ask`, `report`, `export`). Each parses args and calls the same
`domain/*` service the MCP tool uses. No business logic in command handlers
(constitution rule). Output: human-readable by default, `--json` for scripting.

This gives CI/terminal users parity without a second codebase: one binary,
three faces (CLI, MCP `serve`, web UI), one service layer.

## Decision 5: LSP server reuses validation + schema registry

**Decision.** `strategy-server lsp` (stdio) implements diagnostics, completion,
hover, go-to-definition, and code actions by calling the schema registry
(`domain/schema/`) and validation services. It does **not** require the DB or a
running server — it operates on the open YAML buffer + embedded schemas, so it
works in a bare checkout. (epf-cli's LSP is the reference for behavior; the
implementation is native to strategy-server's services.)

## Decision 6: Generators — parity surface, shared content

**Decision.** The generator *content* already lives as embedded skills
(investor-memo, skattefunn, context-sheet, development-brief, value-model-preview).
Close the *authoring* gap by either (a) adding `list/get/scaffold/validate/run`
for generators as a thin compatibility layer over the skill system, or (b)
extending the skill scaffold to cover the generator categories and documenting
the mapping. Prefer (b) (one system) unless users depend on the generator
category taxonomy, in which case (a). Decide during implementation based on the
parity matrix.

Make `value-model-preview` invokable (remove the `run_skill` rejection for inline
preview, or add a dedicated `render_value_model` tool) and surface the HTML in the
web UI + export.

## Decision 7: Report generation

**Decision.** Implement a report renderer (`html/template` + markdown + json)
behind `export_report` (MCP) and the `report` CLI command, sourcing from the same
health/coherence/coverage data the web dashboard uses. No new data, new
presentation.

## Cutover sequencing

1. Track A (local runtime) and Track B (CLI+LSP) make strategy-server usable as a
   local tool — the hard part, do first.
2. Track C closes the framework-authoring tail.
3. Track D: with the parity matrix green, ship an epf-cli deprecation notice,
   observe a window, then delete `apps/epf-cli/` and update project docs.

Each track is independently shippable and testable; nothing here breaks hosted
mode. The full Go test suite must pass against **both** DB dialects before Track A
is considered done.
