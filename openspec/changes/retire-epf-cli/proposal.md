# Change: Retire epf-cli — Achieve Full Capability Parity in strategy-server

## Why

epf-cli is frozen (bug fixes only) and the intent is to retire it completely once
strategy-server can serve every use case it does. Today strategy-server is a
**superset for hosted, multi-tenant authoring** (versioning, ripple coherence,
the orchestrated AIM cycle, GitHub sync, orgs, web UI, autonomous skill
execution), but it is **not yet a drop-in replacement** for the developer who
runs EPF the epf-cli way: fully local, in a git repo, with local models, and no
external services.

A source-verified capability diff (epf-cli: 94 MCP tools / 41 CLI commands;
strategy-server: 153 MCP tools + web UI) shows the remaining gaps fall into three
buckets:

1. **Local-first runtime.** strategy-server hard-depends on PostgreSQL
   (`pgdialect` is wired directly in `internal/database/db.go`) and assumes a
   server deployment. There is no single-binary, zero-dependency local mode and
   no local-filesystem (git repo) source of truth. epf-cli's "Git is God,
   no database" workflow has no equivalent.
2. **Editor-time and CLI ergonomics.** No LSP (real-time YAML diagnostics,
   completion, hover, go-to-definition), no local `validate <file>` /
   `health <path>` / `locate` / `fix` operating on a checkout, no shell-friendly
   one-shot commands for CI.
3. **Framework/output authoring tooling.** No generator tooling
   (`list/get/scaffold/validate generators`), no exposed value-model HTML preview
   path, no rich multi-format report generation, no agent/wizard scaffolding,
   and no migration/canonical-sync tools surfaced to users.

Local models are **already supported** (`LLM_PROVIDER_URL=http://localhost:11434`
for Ollama, empty key), so the LLM story does not block local use — the database,
the runtime assumptions, and the missing CLI/LSP/generator surface do.

This change defines the complete set of capabilities strategy-server must gain
to make epf-cli redundant, so the switch loses nothing for any user — including
the "fully local, full control, local repo" user.

## Goals

- A user who runs EPF entirely locally today on epf-cli can do the same on
  strategy-server: single binary, local repo as source of truth, local models,
  no Postgres, no auth, no network.
- Every epf-cli MCP tool and CLI command has a strategy-server equivalent (a
  tool, a CLI subcommand, the web UI, or an explicit, documented replacement).
- The hosted multi-tenant experience is unaffected — local mode is an additional
  runtime profile, not a fork.

## Non-Goals

- Rewriting epf-cli. epf-cli stays frozen and is deleted only after parity is
  proven and a deprecation window has elapsed.
- Porting epf-cli internals. strategy-server cannot import epf-cli's `internal/`
  packages; equivalents are implemented natively or share canonical-EPF content.
- Changing canonical EPF schemas (this is a parity/runtime change, not a
  framework change), beyond any sync already required.

## What Changes

### Track A — Local-first runtime (the "fully local" user)

- **Embedded datastore.** Add a zero-dependency local persistence backend so the
  server runs from a single binary with no Postgres. Options evaluated in
  `design.md`: pure-Go SQLite (`modernc.org/sqlite`) behind the existing `bun`
  abstraction, or an embedded Postgres. The bun dialect is selected by config;
  all `domain/*` services stay dialect-agnostic.
- **Local mode profile.** A `--local` / `STRATEGY_MODE=local` runtime profile
  that: uses the embedded datastore, runs migrations on first launch, disables
  Zitadel auth (synthetic single user), disables heartbeat/GitHub-App background
  work by default, and degrades semantic features gracefully when Memory is
  absent.
- **Local repo as source of truth.** A local working mode where a git-tracked
  EPF instance directory (READY/FIRE/AIM YAML) is the canonical store: import on
  start, export on write, optional file-watch reconciliation. This preserves the
  epf-cli "edit YAML in the repo, commit to git" loop while still giving the DB
  the derived index, ripple, and run ledger.
- **Local models end-to-end.** Document and test the Ollama/OpenAI-compatible
  local path for every LLM-backed feature (drafting, AIM cycle, adapt-strategy).

### Track B — CLI + LSP parity (editor/terminal users)

- **Native CLI subcommands** on the strategy-server binary covering the epf-cli
  developer commands that have no MCP/web equivalent: `validate`, `health`,
  `locate`, `fix`, `diff`, `coverage`, `explain`, `context`, `ask`, `report`,
  `export`. These are thin wrappers over the same `domain/*` services the MCP
  tools call (no business logic in command handlers).
- **LSP server** (`strategy-server lsp`) providing real-time diagnostics,
  completion, hover, go-to-definition, and code actions over EPF YAML, reusing
  the schema registry and validation services. This is the single biggest
  editor-time loss and must be closed for IDE users.

### Track C — Framework/output authoring tooling parity

- **Generator tooling parity.** Expose generator authoring as
  first-class capabilities (list / get / scaffold / validate / run custom
  generators and their categories: compliance, marketing, investor, internal,
  development, custom), or formally fold them into the skill system with an
  equivalent scaffold + validate path. The generator *content* (investor-memo,
  skattefunn, context-sheet, development-brief) already ships as skills; the
  *authoring surface* does not.
- **Value-model HTML preview path.** Make the `value-model-preview` inline skill
  invokable (it is currently rejected by `run_skill`) and surface a rendered,
  shareable HTML value model in the web UI and via export.
- **Report generation.** Wire `export_report` into a rich multi-format
  (md / html / json) health/strategy report, matching epf-cli `report`.
- **Scaffolding parity.** Add `scaffold_agent` and `scaffold_generator` (or the
  skill-system equivalents) to match epf-cli's authoring scaffolds; today only
  `scaffold_skill` and `scaffold_instance` exist.
- **Migration/maintenance tools.** Provide user-facing equivalents (CLI and/or
  MCP) for the epf-cli maintenance commands where still relevant
  (`migrate definitions`, `sync-canonical`, migration guidance), or document the
  hosted replacement.

### Track D — Cutover

- **Parity matrix** kept in the spec: every epf-cli tool/command mapped to its
  strategy-server equivalent (tool, CLI, web, or explicit N/A with rationale).
- **Deprecation + removal plan.** epf-cli emits a deprecation notice; a window is
  observed; `apps/epf-cli/` is deleted and `project.md` / `AGENTS.md` /
  `config.yaml` are updated to remove the "epf-cli is frozen / reference
  validator" language only after the parity matrix is fully green.

## Impact

- **Affected specs:**
  - `strategy-local` (new) — local-first runtime profile, embedded datastore,
    local repo source of truth, local models.
  - `strategy-mcp` (modified) — generator tooling, value-model preview,
    report, scaffold parity; the epf-cli→strategy-server parity matrix.
  - `strategy-authoring` (modified) — local-repo authoring loop and
    file/DB reconciliation.
- **Affected code (strategy-server):**
  - `internal/database/` — dialect-selectable bun backend (embedded SQLite or
    embedded Postgres), local migration bootstrap.
  - `config/config.go`, `cmd_serve.go`, `main.go` — `local` mode profile + new
    CLI subcommands; new `cmd_lsp.go`, `cmd_validate.go`, etc.
  - New packages: local repo sync/watch; LSP server; generator tooling (or skill
    extensions); report renderer.
  - `internal/mcpserver/` — new tools (generators, preview, report, scaffolds).
  - `internal/embedded/` — ensure all schemas/templates/generators/agents needed
    for offline authoring are embedded (sync from canonical-EPF).
- **Affected docs:** `openspec/project.md`, root + app `AGENTS.md`,
  `openspec/config.yaml` (remove epf-cli-as-active language at cutover).
- **No breaking changes** to existing hosted MCP tools, web UI, or APIs. Local
  mode is additive; tracks A–C are independently deliverable; Track D is gated on
  the parity matrix being complete.
