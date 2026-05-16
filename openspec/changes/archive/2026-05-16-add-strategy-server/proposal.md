# Change: Add strategy-server — Live Strategy Authoring and Management Platform

## Why

`epf-cli` is a stable, frozen CLI/MCP tool for local EPF artifact validation and AI agent
integration. It treats strategy as files. The next evolution is a live platform: strategy
authored, managed, and served from a database-backed server with a web UI, REST API, and MCP
interface — all from a single binary built constitution-first.

`epf-cli` becomes the **format specification and reference validator**. `strategy-server`
becomes the **platform that authors, manages, and activates EPF strategy at runtime**.

## What This Is

A new Go application at `apps/strategy-server/` — a constitution-compliant backend serving:

| Surface | Description |
|---|---|
| **MCP** | Primary interface for Phase 2 — every capability operable by an AI agent |
| **REST API** | Echo v4 + huma v2; typed operations, auto-generated OpenAPI 3.1 |
| **HTMX web UI** | Echo v4 + templ + go-daisy; Phase 3 human interface |
| **Inline AI** | Phase 4 — AI chat panel in the web UI, driven by the Phase 2 MCP tools |

The MCP surface is the first UI. The web UI is a rendering layer on top of a backend validated
entirely through agent-driven test scenarios before a single template is written.

## Relationship to epf-cli

| Concern | epf-cli | strategy-server |
|---|---|---|
| EPF format definition | Owns (schemas, embedded artifacts) | Imports from epf-cli packages |
| File validation | Full validator CLI | Calls epf-cli's `internal/validator` |
| Local AI agent (stdio) | Serves via `epf-cli serve` | Out of scope — epf-cli continues this |
| Strategy authoring | Read-only, file-based | Read/write, database-backed |
| Strategy management | Manual YAML editing | Web UI + MCP write tools |
| Semantic engine | Stateless per-invocation | Database-persisted graph + live propagation |
| Auth | GitHub App OAuth | Same — imports `internal/auth` |
| Deployment | CLI binary / Cloud Run | Cloud Run (constitution-standard) |

**epf-cli packages imported directly** (no copy, no fork — shared module):
- `internal/strategy` — EPF domain model and parser
- `internal/source` — filesystem/GitHub source abstraction
- `internal/schema` — artifact type registry and schemas
- `internal/validator` — YAML → JSON schema validation
- `internal/auth` — GitHub App OAuth, session management, multi-tenant
- `internal/memory` — emergent.memory graph client
- `internal/decompose` — EPF YAML → graph objects
- `internal/ingest` — full ingestion pipeline
- `internal/reasoning` — tiered LLM reasoning engine
- `internal/propagation` — semantic propagation circuit
- `internal/scenario` — what-if exploration via graph branching
- `internal/workspace` — GitHub workspace discovery
- `internal/agent` — agent manifest loading and recommendation
- `internal/skill` — skill loading and execution
- `internal/checks` — health check implementations
- `internal/embedded` — binary-embedded schemas and templates
- `internal/relationships`, `internal/valuemodel`, `internal/anchor`, `internal/discovery`

**Not imported** (CLI-specific or transport-coupled):
- `internal/mcp/` (mcp-go transport coupled) — used as reference only; new MCP tooling written against the new server's domain services
- `internal/lsp/`, `internal/tui/`, `internal/migration/` — CLI-only

## What Changes

### New: `apps/strategy-server/`

A greenfield Go application. Constitution-aligned from day one. No migration debt.

```
apps/strategy-server/
├── main.go                          # go-arg dispatch: server | db
├── cmd_serve.go                     # runServer()
├── cmd_db.go                        # runMigrate()
├── config/
│   └── config.go                    # Config struct (go-arg, all env vars)
├── domain/
│   ├── strategy/                    # Strategy authoring and management
│   │   └── service.go
│   ├── workspace/                   # Workspace and instance lifecycle
│   │   └── service.go
│   └── semantic/                    # Semantic graph and propagation
│       └── service.go
├── internal/
│   ├── database/
│   │   ├── db.go                    # bun + pgx, migration runner, advisory lock
│   │   ├── testdb.go                # TestDB(t) — isolated DB per test
│   │   └── migrations/
│   │       └── 001_initial.sql
│   ├── domain/
│   │   └── models.go                # Shared bun-tagged structs
│   ├── handler/
│   │   └── handler.go               # huma.Register — REST API handlers
│   ├── mcpserver/
│   │   └── server.go                # MCP tool registrations (all surfaces)
│   ├── web/
│   │   ├── routes.go
│   │   ├── middleware.go
│   │   └── handler_*.go
│   ├── ui/                          # templ components
│   ├── navigation/
│   │   └── graph.go                 # Navigation graph — screens, tabs, data hints
│   ├── langs/                       # i18n: locale.toml, T(ctx, key)
│   └── audit/                       # Audit context contract
├── pkg/
│   ├── apperror/                    # Typed HTTP errors
│   └── logger/                      # slog context wrapper
├── tests/
│   └── e2e/
├── web/                             # Tailwind CSS pipeline
│   ├── app.css
│   ├── base.css
│   ├── package.json
│   └── staticfiles/
├── Taskfile.yml
├── Dockerfile
├── docker-compose.yml
├── .golangci.yaml
├── .air.toml
└── AGENTS.md
```

### New: `openspec/project.md` updated

Add `strategy-server` context alongside existing epf-cli context.

## Build Order (Four-Phase Constitution Strategy)

### Phase 1 — Foundation Spec (this proposal is the start)

Exit gate:
- [ ] `openspec/project.md` complete for `strategy-server`
- [ ] All domain capability specs written: `strategy`, `workspace`, `semantic`, `auth`
- [ ] Navigation graph enumerated (all screens, URL patterns, data hints)
- [ ] MCP tool inventory complete (every tool named, described, input/output typed)
- [ ] Test scenario library covers all primary user journeys
- [ ] Day-one scaffolding in place: i18n, audit context, auth middleware scaffold, `AppError`

### Phase 2 — MCP Server as First UI

Build the complete backend, validate it with an AI coding agent before any web UI is written.

### Phase 3 — HTMX Web UI

Build the human-facing web UI as a rendering layer on top of the Phase 2 validated backend.

### Phase 4 — Inline AI in the Web UI

Wire the Phase 2 MCP tools into the Phase 3 UI as a context-aware AI co-pilot.

## Impact

- **New code:** `apps/strategy-server/` — entirely additive
- **No changes to:** `apps/epf-cli/`, `docs/EPF/`, `packages/opencode-epf/`
- **epf-cli:** frozen at current state; no new features
- **Breaking changes:** none
- **Enables:** live strategy platform; retirement path for epf-cli's server/MCP mode when strategy-server coverage is complete
