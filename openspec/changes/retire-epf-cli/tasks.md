# Tasks: Retire epf-cli — Full Capability Parity

## 0. Parity baseline

- [ ] 0.1 Produce the epf-cli → strategy-server parity matrix: every epf-cli MCP
      tool (94) and CLI command (41) mapped to a strategy-server equivalent
      (tool / CLI / web / explicit N/A + rationale). Commit it under the change.
- [ ] 0.2 Classify each row: already covered, covered-by-this-change, or
      out-of-scope (with rationale). Confirm Tracks A–C cover all "covered-by"
      rows.

## 1. Track A — Local-first runtime

### 1.1 Dialect-selectable datastore
- [ ] 1.1.1 Add `modernc.org/sqlite` (pure-Go, no cgo) and wire bun dialect
      selection in `internal/database/db.go` by config.
- [ ] 1.1.2 Audit raw SQL across `domain/*` (esp. `domain/strategy/service.go`
      `deriveIndex` upsert) for Postgres-only constructs; add a dialect shim or
      bun-expression equivalents where needed.
- [ ] 1.1.3 Make migrations dialect-safe (JSONB→TEXT/JSON, `gen_random_uuid()`,
      partial indexes): conditional statements or a parallel SQLite set, run via
      goose on both backends.
- [ ] 1.1.4 Add a SQLite variant of `internal/database/TestDB(t)`; run the full
      suite against both dialects. Both green = exit gate for Track A.

### 1.2 Local mode profile
- [ ] 1.2.1 Add `STRATEGY_MODE` (`hosted`|`local`) + `--local` to `config/config.go`.
- [ ] 1.2.2 In `cmd_serve.go`/`main.go`, wire `local` defaults: embedded SQLite at
      a repo-local path, auto-migrate on first launch, auth disabled (synthetic
      user), heartbeat + GitHub-App jobs off, Memory optional.
- [ ] 1.2.3 Verify hosted mode behavior is byte-for-byte unchanged (regression
      pass on existing suite).

### 1.3 Local repo as source of truth
- [ ] 1.3.1 Import instance directory on start via `internal/epfimport/`.
- [ ] 1.3.2 Export affected artifacts to YAML after `commit_batch` (reuse
      `export_*_yaml`) so git stays the system of record.
- [ ] 1.3.3 Reconciliation path: file-watch and/or explicit `reconcile` command;
      repo-wins policy; surface conflicting staged batches.
- [ ] 1.3.4 Prove rebuild: delete derived datastore, restart, derived state
      reconstructs from repo with no authored-content loss.

### 1.4 Local models end-to-end
- [ ] 1.4.1 Verify + document the Ollama/OpenAI-compatible local path for READY
      drafting, the AIM cycle, adapt-strategy, and analysis skills (no key, no
      external network).
- [ ] 1.4.2 Add a local-model smoke test (or documented manual run) covering at
      least one LLM-backed draft and one cycle step.

## 2. Track B — CLI + LSP parity

### 2.1 CLI subcommands
- [ ] 2.1.1 Add subcommands to `main.go` dispatch: `validate`, `health`,
      `locate`, `fix`, `diff`, `coverage`, `explain`, `context`, `ask`,
      `report`, `export`. Thin wrappers over `domain/*` services; no business
      logic in handlers.
- [ ] 2.1.2 Human-readable default output + `--json`; non-zero exit on failure
      for CI gating.
- [ ] 2.1.3 Tests per subcommand (golden output + exit code).

### 2.2 LSP server
- [ ] 2.2.1 Add `strategy-server lsp` (stdio) implementing diagnostics,
      completion, hover, go-to-definition, code actions over EPF YAML.
- [ ] 2.2.2 Reuse schema registry + validation services; operate on open buffer +
      embedded schemas with no DB/server dependency.
- [ ] 2.2.3 Editor smoke test (diagnostic appears on a schema violation;
      completion from embedded schemas in a bare checkout).

## 3. Track C — Framework/output authoring tooling

- [ ] 3.1 Decide generator strategy (dedicated generator tools vs. skill-system
      extension) from the parity matrix; implement list/get/scaffold/validate/run
      with category support; keep existing generator content available.
- [ ] 3.2 Make `value-model-preview` invokable (remove `run_skill` rejection or
      add `render_value_model`); surface HTML in web UI + export.
- [ ] 3.3 Implement the report renderer (md/html/json) behind `export_report`
      (MCP) and the `report` CLI subcommand.
- [ ] 3.4 Add `scaffold_agent` and `scaffold_generator` (or documented
      skill-system equivalents).
- [ ] 3.5 Provide user-facing equivalents/guidance for epf-cli maintenance
      commands still relevant (`migrate definitions`, `sync-canonical`, migration
      guide).
- [ ] 3.6 Ensure all schemas/templates/generators/agents needed for offline
      authoring are embedded (sync from canonical-EPF; run
      `TestDecomposerFieldsMatchSchemas`).

## 4. Track D — Cutover

- [ ] 4.1 Re-verify the parity matrix is fully green (no unresolved gaps).
- [ ] 4.2 Add an epf-cli deprecation notice (startup/CLI banner) pointing to
      strategy-server local mode.
- [ ] 4.3 Observe the deprecation window (team-decided duration).
- [ ] 4.4 Remove `apps/epf-cli/`; update `openspec/project.md`, root + app
      `AGENTS.md`, and `openspec/config.yaml` to drop epf-cli-as-active language.
- [ ] 4.5 Final full suite + lint green on both DB dialects.

## 5. Verification (cross-cutting)

- [ ] 5.1 A user who runs EPF fully locally on epf-cli today reproduces the same
      workflow on strategy-server local mode (single binary, local repo, local
      model, no Postgres/auth/network) — documented walkthrough.
- [ ] 5.2 Full `go test ./...` green against PostgreSQL and SQLite.
- [ ] 5.3 `task lint` clean.
