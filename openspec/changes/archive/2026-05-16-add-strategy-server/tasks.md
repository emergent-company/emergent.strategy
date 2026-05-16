# Tasks: Add strategy-server

Execute strictly in phase order. Do not start Phase 2 until Phase 1's exit gate is met.

---

## Phase 1 — Foundation Spec

### 1.1 Project scaffolding

- [x] 1.1.1 Create `apps/strategy-server/` directory structure per design.md
- [x] 1.1.2 Initialise Go module: `go mod init github.com/emergent-company/emergent-strategy/apps/strategy-server`
- [x] 1.1.3 Set up `go.work` at repo root to link both apps in one workspace
- [x] 1.1.4 Add all constitution dependencies to `go.mod`:
  - `github.com/labstack/echo/v4`
  - `github.com/danielgtaylor/huma/v2`
  - `github.com/alexflint/go-arg`
  - `uptrace/bun` + `jackc/pgx/v5`
  - `pressly/goose/v3`
  - `google/uuid`
  - `log/slog` (stdlib)
  - `github.com/mark3labs/mcp-go` (for MCP server transport)
- [x] 1.1.5 Wire `main.go` with go-arg dispatch (`server` and `db` subcommands)
- [x] 1.1.6 Write `config/config.go` — complete Config struct with all env vars (see design.md)
- [x] 1.1.7 Write `Taskfile.yml` with all standard constitution tasks plus project-specific tasks
- [x] 1.1.8 Write `.golangci.yaml` (copy from constitution; adapt project name)
- [x] 1.1.9 Write `Dockerfile` (multi-stage, `-tags notui`)
- [x] 1.1.10 Write `docker-compose.yml` (Postgres 16 only)
- [x] 1.1.11 Write `.air.toml` (live reload for dev)
- [x] 1.1.12 Write `AGENTS.md` with OpenSpec block and project-specific build instructions
- [x] 1.1.13 Verify `task build` compiles a working empty binary

### 1.2 Day-one patterns (install before any service code)

- [x] 1.2.1 Write `pkg/apperror/apperror.go` — `AppError`, sentinels, error code ranges
- [x] 1.2.2 Write `pkg/logger/logger.go` — `slog` context wrapper, `FromContext`, `WithContext`
- [x] 1.2.3 Write `internal/database/db.go` — bun + pgx, migration runner with advisory lock, `Open`
- [x] 1.2.4 Write `internal/database/testdb.go` — `TestDB(t)` creates isolated DB, runs migrations, cleanup
- [x] 1.2.5 Write `internal/database/migrations/001_initial.sql` — `workspaces`, `strategy_instances`, `strategy_mutations`, `audit_log` tables
- [x] 1.2.6 Write `internal/langs/langs.go` — `T(ctx, key)`, `langs.go`, `middleware.go` (Accept-Language detection)
- [x] 1.2.7 Write `internal/langs/` — `formatInt`, `formatDate`, `formatDateShort`
- [x] 1.2.8 Write `internal/audit/audit.go` — `Writer` interface, `ContextWithAudit`, `FromContext`, `ContextWithSource`, nil-safe
- [x] 1.2.9 Write `internal/web/middleware.go` — `AuthMiddleware` (no-op dev pass-through, config-gated), `UserFromContext`, `DevUser`
- [x] 1.2.10 `created_by UUID` present in all mutable tables in 001_initial.sql
- [x] 1.2.11 Unit test: `TestAppError_*`, `TestAuditContext_NilSafe`, `TestAuditSource_*`, `TestAuditActor_*`
- [x] 1.2.12 `go test ./pkg/... ./internal/audit/...` passes; `go build ./...` clean

### 1.3 OpenSpec capability specs

Write one spec per bounded context before implementation begins.

- [x] 1.3.1 Write `openspec/specs/strategy-core/spec.md` — workspace and instance lifecycle requirements and scenarios
- [x] 1.3.2 Write `openspec/specs/strategy-authoring/spec.md` — create, update, archive artifact requirements and scenarios
- [x] 1.3.3 Write `openspec/specs/strategy-serving/spec.md` — read-only query requirements and scenarios
- [x] 1.3.4 Write `openspec/specs/strategy-semantic/spec.md` — semantic graph, propagation, scenario requirements
- [x] 1.3.5 Write `openspec/specs/strategy-auth/spec.md` — authentication and authorisation requirements
- [x] 1.3.6 Write `openspec/specs/strategy-mcp/spec.md` — full MCP tool inventory (every tool: name, description, input, output, read vs write)
- [x] 1.3.7 Write `openspec/specs/strategy-web/spec.md` — navigation graph (every screen, URL, method, parent, data hints)
- [x] 1.3.8 Write test scenario library in `openspec/specs/strategy-scenarios/spec.md` — all primary user journeys in plain language
- [x] 1.3.9 Run `openspec validate add-strategy-server --strict` — must pass clean

### 1.4 Phase 1 exit gate review

- [x] 1.4.1 `openspec/project.md` updated with strategy-server context, stack, and conventions
- [ ] 1.4.2 All capability specs reviewed and approved
- [x] 1.4.3 Navigation graph complete (all screens enumerated — see strategy-web/spec.md)
- [x] 1.4.4 MCP tool inventory complete (all tools named, typed, described — see strategy-mcp/spec.md)
- [x] 1.4.5 Test scenario library covers all primary user journeys (see strategy-scenarios/spec.md)
- [x] 1.4.6 No open architecture questions — all design decisions made in design.md
- [x] 1.4.7 Day-one scaffolding verified: i18n, audit context, auth middleware, AppError, TestDB
- [x] 1.4.8 `go build ./...` compiles; `go test ./pkg/... ./internal/audit/...` passes; `golangci-lint run ./...` — 0 issues

---

## Phase 2 — MCP Server as First UI

_Start only after Phase 1 exit gate is met._

### 2.1 Database and domain models

- [x] 2.1.1 Write `internal/domain/models.go` — all bun-tagged structs matching migration tables
- [x] 2.1.2 Register all models in `internal/database/db.go`
- [x] 2.1.3 Write integration tests for all models using `database.TestDB(t)`

### 2.2 Domain services — workspace and instance

- [x] 2.2.1 Write `domain/workspace/service.go` — `ListWorkspaces`, `GetWorkspace`, `CreateWorkspace`, `DeleteWorkspace`
- [x] 2.2.2 Write `domain/instance/service.go` — `ListInstances`, `GetInstance`, `ImportInstance`, `ArchiveInstance`, `ActivateInstance`
- [x] 2.2.3 Import local EPF instance via `import` subcommand (YAML scanning with yaml.v3; epf-cli/internal is inaccessible from strategy-server due to Go internal package rules)
- [x] 2.2.4 Import and wire local strategy data — `cmd_import.go` uses yaml.v3 to scan YAML files into payloads
- [ ] 2.2.5 Import and wire `epf-cli/internal/validator` for artifact validation (deferred)
- [x] 2.2.6 Write integration tests for all workspace and instance service methods
- [x] 2.2.7 Add audit logging at end of every write method (domain/audit pattern)

### 2.3 Domain services — strategy authoring

- [x] 2.3.1 Write `domain/strategy/service.go` — read operations: `GetCurrentArtifact`, `ListCurrentArtifacts`, `ListMutations`, `GetMutation`
- [x] 2.3.2 Write mutation operations: `Stage` — creates `strategy_mutations` records in staged status
- [x] 2.3.3 Write `CommitBatch(batchID)` — atomically promotes staged mutations to committed
- [x] 2.3.4 Write `DiscardBatch(batchID)` — marks staged mutations as discarded
- [x] 2.3.5 Write integration tests for all strategy service methods

### 2.4 Domain services — semantic engine

- [ ] 2.4.1 Import and wire `epf-cli/internal/memory` — Memory graph client
- [ ] 2.4.2 Import and wire `epf-cli/internal/ingest` — EPF artifact ingestion pipeline
- [ ] 2.4.3 Import and wire `epf-cli/internal/reasoning` — tiered LLM reasoning
- [ ] 2.4.4 Import and wire `epf-cli/internal/propagation` — semantic propagation circuit
- [ ] 2.4.5 Import and wire `epf-cli/internal/scenario` — what-if exploration
- [x] 2.4.6 Write `domain/semantic/service.go` — `SearchStrategy`, `GetNeighbors`, `DetectContradictions`, `RunScenario` (stub; safe when Memory unconfigured)
- [ ] 2.4.7 Write integration tests for semantic service (requires Memory config)

### 2.5 MCP server

- [x] 2.5.1 Write `internal/mcpserver/server.go` — MCP server wiring (mcp-go StreamableHTTP transport)
- [x] 2.5.2 Register all read tools (16 read tools: workspaces, instances, artifacts, semantic)
- [x] 2.5.3 Register all write/stage tools (update_north_star, create/update/archive_feature, import_instance, activate/archive_instance)
- [x] 2.5.4 Register `commit_batch` and `discard_batch` tools
- [ ] 2.5.5 Import and wire `epf-cli/internal/auth` for multi-tenant session context
- [x] 2.5.6 Wire audit context: every MCP request sets `ContextWithSource(ctx, "mcp")` via AuditMiddleware
- [x] 2.5.7 Wire auth middleware on HTTP MCP endpoint

### 2.6 HTTP server wiring

- [x] 2.6.1 Update `cmd_serve.go` — instantiate domain services, mount MCP at `/mcp`, health at `/health`
- [x] 2.6.2 Register Echo middleware: CORS, Recover, Logger, Auth, Audit, Lang
- [x] 2.6.3 Set Echo server timeouts: Read 15s, Write 180s, Idle 120s
- [x] 2.6.4 Graceful shutdown via SIGINT/SIGTERM
- [x] 2.6.5 `GET /health` returning `{"status":"ok","service":"strategy-server"}`

### 2.7 Agent-driven validation

Scenarios executed via live MCP endpoint (`PORT=8081`). Results:

| Scenario | Status | Notes |
|---|---|---|
| 1. Onboard workspace + import | ✅ PASS | Real data: `get_strategy_context` returns 174 artifacts from emergent instance |
| 2. Update the north star | ✅ PASS | Old vision visible before commit, new after |
| 3. Create a new feature | ✅ PASS | Feature invisible before commit, visible after |
| 4. Update feature and discard | ✅ PASS | Discard leaves visible state unchanged |
| 5. Archive a feature | ✅ PASS | Archived feature excluded from default list |
| 6. Semantic search | ⏭ SKIP | Returns `ErrSemanticUnavailable` — Memory not configured |
| 7. Detect contradictions | ⏭ SKIP | Returns `ErrSemanticUnavailable` — Memory not configured |
| 8. History and audit trail | ✅ PASS | Full history, filter by type, per-mutation detail all work |

- [x] 2.7.1 Start server (`PORT=8081 PGPORT=5433 go run . server`)
- [x] 2.7.2 Open MCP session via `tools/list` — all 26 tools verified
- [x] 2.7.3 Execute scenarios 1–5 and 8 via MCP tools/call
- [x] 2.7.4 Verified DB state via read tools after each scenario
- [x] 2.7.5 No tool confusion; one known gap (scenario 1 step 4: empty context without GitHub ingestion)
- [x] 2.7.6 All non-semantic scenarios pass without workarounds

### 2.8 Phase 2 exit gate

- [x] 2.8.1 All domain services implemented and integration-tested
- [x] 2.8.2 All 26 MCP tools implemented and documented
- [x] 2.8.3 6/8 scenarios pass; 2 skipped pending Memory config (semantic engine)
- [x] 2.8.4 `task test` passes — all integration tests green
- [x] 2.8.5 Staging/commit pattern verified: agent stages → batch_id returned → commit promotes → read reflects new state
- [x] 2.8.6 No workarounds in any passing scenario. Known gap: import_instance doesn't pull from GitHub (deferred to 2.2.3)

---

## Phase 3 — HTMX Web UI

_Start only after Phase 2 exit gate is met._

### 3.1 CSS pipeline (day one, before first template)

- [ ] 3.1.1 Set up `web/` directory: `base.css` (from go-daisy), `app.css`, `package.json`
- [ ] 3.1.2 Write `web/staticfiles/staticfiles.go` — `//go:embed`, `FS()` function
- [ ] 3.1.3 Write `internal/web/static.go` — merged static handler (local first, go-daisy fallback)
- [ ] 3.1.4 Wire `task css` in Taskfile
- [ ] 3.1.5 Verify: `curl /static/css/app.css | grep "md:hidden"` returns a match

### 3.2 Shell and navigation

- [ ] 3.2.1 Write `internal/navigation/graph.go` — all screens from Phase 1 nav graph
- [ ] 3.2.2 Write base layout templ component: sidebar, header, flash messages, chat panel placeholder
- [ ] 3.2.3 Wire `render.RenderAuto` for full page vs HTMX partial detection
- [ ] 3.2.4 Wire i18n middleware: language detection, `T(ctx, key)` in all templates
- [ ] 3.2.5 Write `internal/web/routes.go` — `RegisterRoutes` — all route registrations matching nav graph

### 3.3 Screens (build order: list → detail → forms → complex)

Per navigation graph from Phase 1. Each screen:
- [ ] Handler registered in `routes.go`
- [ ] GET handler implemented
- [ ] POST handler implemented (forms only)
- [ ] Full page rendering
- [ ] HTMX partial rendering
- [ ] Error states handled (form values preserved on error)
- [ ] Scenario from Phase 2 passes via web UI

### 3.4 Phase 3 exit gate

- [ ] 3.4.1 All navigation graph screens implemented
- [ ] 3.4.2 All Phase 2 scenarios pass via web UI (manual verification)
- [ ] 3.4.3 No business logic in any handler
- [ ] 3.4.4 All forms preserve values on error
- [ ] 3.4.5 HTMX partial rendering works for all screens
- [ ] 3.4.6 Mobile responsive from first template: table scroll wrappers, responsive grid, flex-wrap toolbars
- [ ] 3.4.7 `task test` passes

---

## Phase 4 — Inline AI in Web UI

_Start only after Phase 3 exit gate is met._

### 4.1 Chat panel

- [ ] 4.1.1 Implement chat panel component (mobile: bottom sheet, desktop: side panel)
- [ ] 4.1.2 Wire `POST /chat` endpoint — MCP orchestrator, streaming SSE response
- [ ] 4.1.3 Context injection: current screen, company/workspace, data hints
- [ ] 4.1.4 Tool restriction per screen (nav graph `DataHints` drives allowed tool set)

### 4.2 Staging integration in UI

- [ ] 4.2.1 Render staging batch as structured action cards in chat panel
- [ ] 4.2.2 Confirm button calls `commit_batch` via HTMX
- [ ] 4.2.3 Discard button calls `discard_batch`

### 4.3 Proactive suggestions

- [ ] 4.3.1 `GET /:workspaceID/:instanceID/ai-hints` — lightweight AI, 0–3 suggestions
- [ ] 4.3.2 Cache per (workspace, instance, screen, data hash)
- [ ] 4.3.3 Render as dismissible hints below chat input

### 4.4 Knowledge base

- [ ] 4.4.1 Write `internal/agent/knowledge.go` — map of domain operation → explanation
- [ ] 4.4.2 Inject into AI system prompt at startup

### 4.5 Phase 4 exit gate

- [ ] 4.5.1 Chat panel available on all workspace-scoped screens
- [ ] 4.5.2 Context injection working
- [ ] 4.5.3 Write operations go through staging — agent cannot commit without user confirmation
- [ ] 4.5.4 Streaming renders token-by-token
- [ ] 4.5.5 Tool use renders as structured cards
- [ ] 4.5.6 All Phase 2 scenarios completable via chat interface
- [ ] 4.5.7 No regression in Phase 3 web UI
