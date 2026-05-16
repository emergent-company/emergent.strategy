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

**Do not modify `apps/epf-cli/`.** That app is frozen. strategy-server has its own
`internal/memory/` client (cannot import epf-cli's `internal/` packages due to Go visibility).

## Local Development Setup

**One command to start everything:**

```bash
cd apps/strategy-server

# Postgres only (semantic features disabled — fastest)
task dev-up

# Postgres + Memory server (full semantic features)
task dev-up-full
```

This starts Docker containers, runs migrations, writes `.env.local`, and starts
the server on port 8090. The MCP endpoint is at `http://localhost:8090/mcp`.

### All dev tasks

| Task | What it does |
|------|-------------|
| `task dev-up` | Postgres + migrations + server on port 8090 |
| `task dev-up-full` | Same, plus Memory server for semantic features |
| `task dev-deps` | Start containers + write `.env.local`, don't start server |
| `task dev-down` | Stop containers, keep data |
| `task dev-reset` | Stop containers, remove volumes + `.env.local` (clean slate) |
| `task run` | Start server (auto-sources `.env.local` if present) |
| `task build` | Build production binary to `build/strategy-server` |

### Configuration

All config is via environment variables (see `config/config.go`). `task dev-up`
generates a `.env.local` file with sensible defaults. Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8090` | HTTP listen port |
| `PGPORT` | `5433` | Postgres port (docker-compose maps 5433 -> container 5432) |
| `STRATEGY_DB_MODE` | `dev` | Database mode: `dev`, `standalone`, `shared` |
| `AUTH_ENABLED` | `false` | Enable Zitadel auth (disabled in dev) |
| `EPF_MEMORY_URL` | `http://localhost:8787` | Memory server URL |
| `EPF_MEMORY_PROJECT` | — | Memory project ID (set by `setup-memory.sh`) |
| `EPF_MEMORY_TOKEN` | — | Memory project token |

### Docker services

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5433 | PostgreSQL 16 (user/pass/db: `strategy`) |
| `memory` | 8787 | emergent.memory server (requires `--with-memory`) |

The Memory server image is amd64-only. On Apple Silicon it runs via QEMU
emulation (`platform: linux/amd64` in docker-compose).

## Build & Test

```bash
cd apps/strategy-server

# Build
task build

# Run (auto-sources .env.local)
task run

# Tests (requires running Postgres — start with task dev-deps first)
task test

# Unit tests only (no DB required)
go test ./pkg/... ./internal/audit/... ./internal/agent/... ./internal/embedded/...

# Lint
task lint
```

## Architecture

Four-phase build order — do not start the next phase until the exit gate is met:

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | **Complete** | Foundation: scaffolding, day-one patterns, capability specs |
| Phase 2 | **In Progress** | MCP server — 96 tools, auth, semantic engine, ingestion |
| Phase 3 | Not started | HTMX web UI — rendering layer on validated backend |
| Phase 4 | Not started | Inline AI in web UI |

### Phase 2 status

- **2a (Memory integration):** Complete — docker-compose, memory client, semantic
  service wiring, async ingestion pipeline, dual-layer graph (artifact + decomposed)
- **2b (Auth + multi-tenant):** Complete — Zitadel introspection, user/org model,
  auth middleware, org MCP tools
- **2c (Tool parity):** Complete — 96 MCP tools, agent routing, knowledge base
- **2d (Integration tests):** In progress — E2E tests for semantic tools (mocked Memory),
  org lifecycle, ingest pipeline, full agent workflow. Remaining: multi-tenant isolation,
  documentation
- **2e (Schema registry + versioning + GitHub sync):** Complete — schema registry with
  DB + embedded fallback, strategy versioning (publish/list/get/diff/restore), GitHub
  App write-back (branch + commit + PR), decomposer field reconciliation. 103 MCP tools.

## Tech Stack

| Concern | Library |
|---|---|
| Language | Go 1.26 |
| Database | PostgreSQL 16 via `uptrace/bun` + `jackc/pgx/v5` |
| HTTP | Echo v4 + `danielgtaylor/huma/v2` |
| CLI/Config | `alexflint/go-arg` |
| Migrations | `pressly/goose/v3` embedded SQL (13 migrations) |
| Logging | `log/slog` JSON |
| UUIDs | `google/uuid` |
| MCP | `mark3labs/mcp-go` |
| Auth | Zitadel OIDC introspection (`internal/auth/`) |
| Semantic graph | emergent.memory REST API (`internal/memory/`) |
| Templates | `a-h/templ` (Phase 3) |
| UI components | `emergent-company/go-daisy` (Phase 3) |

## Day-One Patterns (never skip)

All three patterns are installed from day one and must be used in every service method and handler:

### 1. i18n — `internal/langs`

```go
msg := langs.T(ctx, "workspace.not_found")
```

Never hard-code user-facing strings outside `internal/langs/langs.go`.

### 2. Audit — `internal/audit`

```go
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
user := web.UserFromContext(ctx)  // never nil after auth middleware
```

In dev mode (`AUTH_ENABLED=false`), a synthetic dev user is injected.
In production, Bearer tokens are introspected via Zitadel OIDC.

## Package Rules

- `domain/<capability>/` — pure domain logic. `*bun.DB` passed to constructor.
- `internal/database/` — DB connection, migrations, `TestDB(t)`.
- `internal/mcpserver/` — MCP tool registration. No business logic.
- `internal/auth/` — Zitadel introspection client with caching + circuit breaker.
- `internal/memory/` — emergent.memory REST API client.
- `internal/agent/` — Task routing and domain knowledge base.
- `pkg/apperror/` — typed errors. Define sentinel `var` at package level.
- Cross-package imports: `mcpserver → domain → (nothing)`.

## Error Code Ranges

- `100xxx` — generic
- `110xxx` — workspace
- `111xxx` — strategy instance
- `112xxx` — mutation/authoring
- `113xxx` — semantic engine

## Key Files

| File | Purpose |
|------|---------|
| `main.go` | go-arg subcommand dispatch |
| `cmd_serve.go` | Echo server wiring (services, middleware, MCP mount) |
| `cmd_db.go` | Migration runner |
| `cmd_import.go` | Local EPF instance import |
| `config/config.go` | Config struct (env vars, defaults) |
| `scripts/dev-setup.sh` | One-command local dev environment |
| `docker-compose.yml` | Postgres + Memory containers |

### Domain services

| Package | Purpose |
|---------|---------|
| `domain/workspace/` | Workspace CRUD |
| `domain/instance/` | Strategy instance lifecycle |
| `domain/strategy/` | Artifact CRUD, mutations, batches, derived reads |
| `domain/semantic/` | Semantic graph via Memory (search, contradictions, scenarios) |
| `domain/ingest/` | Async ingestion pipeline (mutations -> Memory graph) |
| `domain/user/` | User identity (EnsureUser, GetByID, GetBySub) |
| `domain/org/` | Organisation management (create, invite, membership) |
| `domain/pack/` | Skill pack installation and resolution |
| `domain/app/` | Strategy app platform |
| `domain/schema/` | Schema registry (DB + embedded fallback) |
| `domain/version/` | Strategy versioning (publish/list/get/diff/restore) |
| `domain/sync/` | GitHub sync (RepoWriter interface, sync log) |

### Internal packages

| Package | Purpose |
|---------|---------|
| `internal/database/` | DB connection, migrations, `TestDB(t)` |
| `internal/mcpserver/` | 103 MCP tools across 7 registration files |
| `internal/auth/` | Zitadel OIDC introspection + PostgreSQL cache |
| `internal/memory/` | emergent.memory REST API client (7 files) |
| `internal/agent/` | Task routing (`get_agent_for_task`) + knowledge base |
| `internal/embedded/` | go:embed EPF schemas, templates, agents, skills, field manifest |
| `internal/github/` | GitHub App client (JWT, installation tokens, Git tree API) |
| `internal/web/` | Auth + audit + lang middleware |
| `internal/audit/` | Audit context contract |
| `internal/langs/` | i18n translations |
| `internal/skillrunner/` | Script skill subprocess execution |
| `internal/domain/` | Shared struct definitions with bun tags |
| `internal/index/` | Strategic relationship index derivation |

### Database migrations

13 migrations in `internal/database/migrations/`:

| Migration | Purpose |
|-----------|---------|
| `001_initial.sql` | Workspaces, instances, mutations, artifacts, relationships |
| `002_strategic_index.sql` | Strategic index for derived reads |
| `003_installed_skills.sql` | Skill pack installation tracking |
| `004_strategy_apps.sql` | App platform tables |
| `005_users.sql` | User identity table |
| `006_orgs.sql` | Organisation table |
| `007_org_memberships.sql` | Org membership (role-based) |
| `008_org_invitations.sql` | Email invitations |
| `009_auth_cache.sql` | Token introspection cache |
| `010_add_org_id.sql` | Org FK on workspaces |
| `011_schema_registry.sql` | Schema registry + instance schema_version/dialect |
| `012_strategy_versions.sql` | Strategy versions (JSONB snapshots) |
| `013_github_sync_log.sql` | GitHub sync log (branch, PR, status tracking) |

## MCP Server

The server exposes 103 MCP tools at `/mcp`. Key categories:

| Category | Count | Examples |
|----------|-------|---------|
| Workspace/Instance | 9 | `list_workspaces`, `import_instance`, `health_check` |
| Strategy reads | 11 | `get_product_vision`, `list_features`, `get_feature` |
| Mutation writes | 13 | `create_feature`, `update_north_star`, `commit_batch` |
| Semantic graph | 7 | `search_strategy`, `detect_contradictions`, `run_scenario` |
| Derived reads | 6 | `explain_value_path`, `get_coverage_analysis`, `get_assumptions` |
| Validation | 5 | `validate_artifact`, `validate_with_plan`, `check_content_readiness` |
| Embedded knowledge | 12 | `get_agent_for_task`, `list_schemas`, `get_agent`, `get_skill` |
| Organisation | 5 | `create_org`, `invite_member`, `list_members` |
| Skill packs/apps | 11 | `install_pack`, `run_skill`, `run_app` |
| Relationship tools | 3 | `add_relationship`, `suggest_relationships`, `list_relationships` |
| AIM lifecycle | 7 | `create_lra`, `validate_assumptions`, `stage_calibration` |
| Export | 3 | `export_instance_yaml`, `export_report` |
| Phase discovery | 4 | `get_phase_artifacts`, `list_definitions`, `get_definition` |
| Strategy versions | 5 | `publish_version`, `list_versions`, `diff_versions`, `restore_version` |
| GitHub sync | 2 | `sync_to_github`, `get_sync_status` |

### Strategy Versioning Workflow

1. Mutate artifacts via MCP tools (create/update features, north star, etc.)
2. `publish_version` — snapshots all artifacts + relationships as an atomic version
3. `list_versions` / `diff_versions` — review version history and changes
4. `restore_version` — revert to a previous version's state (creates a new version)

### GitHub Sync Workflow

1. Ensure `github_repo` is set on the instance (e.g. `org/strategy-repo`)
2. `sync_to_github` — exports artifacts as YAML, creates a branch + commit + PR
3. `get_sync_status` — check sync history, open PRs, last sync result

Requires a GitHub App installation. Configure with `GITHUB_APP_ID` and
`GITHUB_APP_PRIVATE_KEY_PATH` env vars. The App needs `contents: write` and
`pull_requests: write` permissions.

### Schema Registry

The server maintains a runtime schema registry in PostgreSQL. On startup,
embedded schemas are auto-imported. Validation uses a 3-tier lookup:
1. DB exact match (version + dialect)
2. DB latest version (standard dialect)
3. Embedded fallback

After syncing schemas from canonical-epf, run the decomposer reconciliation
test to verify field compatibility:

```bash
go test ./internal/embedded/... -run TestDecomposerFieldsMatchSchemas
```

Use `get_agent_for_task(task_description)` as the entry point — it routes to the
right tool or agent based on keyword matching.
