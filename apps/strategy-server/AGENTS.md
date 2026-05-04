<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# strategy-server — AI Agent Instructions

## What This Is

`strategy-server` is a constitution-compliant Go backend serving the Emergent Strategy platform.
It is a **greenfield app** at `apps/strategy-server/` in the `emergent-strategy` monorepo.

**Do not modify `apps/epf-cli/`.** That app is frozen. strategy-server imports its `internal/`
packages as a library. Any changes to epf-cli's packages require a separate change proposal.

## Build & Test

```bash
# Build
cd apps/strategy-server && task build

# Run (requires Postgres: task docker-deps)
cd apps/strategy-server && task run

# Tests (no DB required for unit tests)
cd apps/strategy-server && go test ./pkg/... ./internal/audit/... ./internal/langs/...

# All tests (requires running Postgres)
cd apps/strategy-server && task test

# Lint
cd apps/strategy-server && task lint
```

## Architecture

Four-phase build order — do not start the next phase until the exit gate is met:

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | **In Progress** | Foundation spec: scaffolding, day-one patterns, capability specs |
| Phase 2 | Not started | MCP server as first UI — all domain services + MCP tools |
| Phase 3 | Not started | HTMX web UI — rendering layer on validated backend |
| Phase 4 | Not started | Inline AI in web UI |

## Tech Stack

| Concern | Library |
|---|---|
| Language | Go 1.26 |
| Database | PostgreSQL 16 via `uptrace/bun` + `jackc/pgx/v5` |
| HTTP | Echo v4 + `danielgtaylor/huma/v2` |
| CLI/Config | `alexflint/go-arg` |
| Migrations | `pressly/goose/v3` embedded SQL |
| Logging | `log/slog` JSON |
| UUIDs | `google/uuid` |
| MCP | `mark3labs/mcp-go` (Phase 2) |
| Templates | `a-h/templ` (Phase 3) |
| UI components | `emergent-company/go-daisy` (Phase 3) |

## Day-One Patterns (never skip)

All three patterns are installed from day one and must be used in every service method and handler:

### 1. i18n — `internal/langs`

```go
// In any handler or template:
msg := langs.T(ctx, "workspace.not_found")
```

Never hard-code user-facing strings outside `internal/langs/langs.go`.

### 2. Audit — `internal/audit`

```go
// In middleware (already wired):
ctx = audit.ContextWithSource(ctx, audit.SourceMCP)

// In every write service method:
audit.FromContext(ctx).Write(ctx, audit.Entry{
    EntityType: "workspace",
    EntityID:   ws.ID,
    Action:     "create",
    Source:     audit.SourceFromContext(ctx),
    ActorID:    audit.ActorFromContext(ctx),
})
```

### 3. Auth — `internal/web/middleware.go`

```go
// Auth middleware is registered globally (dev pass-through, prod validates JWT):
user := web.UserFromContext(ctx)  // never nil after auth middleware
```

## Package Rules

- `domain/<capability>/` — pure domain logic. No DB imports in package signatures; `*bun.DB` passed to service constructor.
- `internal/database/` — DB connection, migrations, `TestDB(t)`.
- `internal/handler/` — huma handlers: decode → call domain service → encode. No business logic.
- `pkg/apperror/` — all typed errors. Define sentinel `var` at package level.
- Cross-package imports: `handler → domain → (nothing)`.

## Error Code Ranges

- `100xxx` — generic
- `110xxx` — workspace
- `111xxx` — strategy instance
- `112xxx` — mutation/authoring
- `113xxx` — semantic engine

## Key Files

| File | Purpose |
|------|---------|
| `main.go` | go-arg dispatch |
| `cmd_serve.go` | Echo server wiring |
| `cmd_db.go` | Migration runner |
| `config/config.go` | Config struct |
| `internal/database/db.go` | DB connection + migrations |
| `internal/database/testdb.go` | `TestDB(t)` |
| `internal/database/migrations/001_initial.sql` | Initial schema |
| `internal/langs/langs.go` | i18n: `T(ctx, key)` |
| `internal/audit/audit.go` | Audit context contract |
| `internal/web/middleware.go` | Auth + audit + lang middleware |
| `pkg/apperror/apperror.go` | Typed HTTP errors |
| `pkg/logger/logger.go` | slog context wrapper |
