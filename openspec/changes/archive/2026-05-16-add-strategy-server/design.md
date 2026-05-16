# Design: strategy-server

## Context

The emergent-strategy platform is a live strategy authoring, management, and serving solution
built on EPF (Emergent Product Framework). The EPF format — YAML files defining north star,
personas, features, roadmaps, value models — is the "strategy as code" artifact. The new server
treats these not as frozen files but as live objects with history, relationships, authorship, and
activation states stored in PostgreSQL, synchronised to the `emergent.memory` semantic graph.

`epf-cli` remains the reference validator and local CLI/MCP tool. `strategy-server` is the
platform on top of it.

## Goals / Non-Goals

**Goals:**
- Full constitution alignment from day one (no migration debt)
- Four-phase build order: Foundation Spec → MCP as first UI → HTMX web UI → Inline AI
- Import epf-cli domain packages directly — no duplication
- MCP interface operable for every capability — the AI agent is the primary Phase 2 UI
- Database-backed state with append-only ledger for strategy mutations
- Multi-tenant ready from the first route

**Non-Goals:**
- Changes to epf-cli (frozen)
- EPF format changes (governed by epf-cli's schema definitions)
- Replacing epf-cli's local stdio MCP server (different use case)
- A GraphQL API (REST + MCP is sufficient)

## Key Decisions

### Decision 1: New app, not a refactor of epf-cli

**What:** Create `apps/strategy-server/` as a greenfield application. Do not refactor epf-cli.

**Why:** epf-cli is a mature, stable CLI tool. Its architecture (cobra, no database, file-based)
is correct for what it does. Grafting a database, Echo, huma, PostgreSQL, and a web UI onto it
would produce a hybrid that satisfies neither use case well. A clean slate with the constitution
from day one is faster and produces a better result.

**Risk:** Duplicating domain logic. Mitigated by importing epf-cli's `internal/` packages
directly — the Go module structure allows cross-app imports within the same module.

### Decision 2: go-arg for config, no cobra

**What:** Use `alexflint/go-arg` for the entire CLI dispatch (two commands: `server`, `db`).
No cobra.

**Why:** strategy-server has two commands. go-arg handles this perfectly. The constitution
mandates go-arg. There is no cobra justification here — this is not a 42-command CLI tool.

```go
type Config struct {
    Server *ServerCmd `arg:"subcommand:server"`
    DB     *DBCmd     `arg:"subcommand:db"`

    LogLevel string `arg:"--log-level,env:LOG_LEVEL" default:"INFO"`
    Env      string `arg:"--env,env:ENV" default:"development"`

    // Database
    PGHost     string `arg:"--pg-host,env:PGHOST" default:"localhost"`
    PGPort     int    `arg:"--pg-port,env:PGPORT" default:"5432"`
    PGUser     string `arg:"--pg-user,env:PGUSER" default:"strategy"`
    PGPass     string `arg:"--pg-password,env:PGPASSWORD" default:"strategy"`
    PGDBName   string `arg:"--pg-database,env:PGDATABASE" default:"strategy"`
    PGSSLMode  string `arg:"--pg-sslmode,env:PGSSLMODE" default:"disable"`

    // Server
    Port       int    `arg:"--port,env:PORT" default:"8080"`
    ServerURL  string `arg:"--server-url,env:SERVER_URL"`
    AuthEnabled bool  `arg:"--auth-enabled,env:AUTH_ENABLED" default:"false"`

    // GitHub OAuth (auth)
    GithubClientID     string `arg:"env:EPF_OAUTH_CLIENT_ID"`
    GithubClientSecret string `arg:"env:EPF_OAUTH_CLIENT_SECRET"`
    SessionSecret      string `arg:"env:EPF_SESSION_SECRET"`

    // Memory (semantic graph)
    MemoryURL     string `arg:"env:EPF_MEMORY_URL"`
    MemoryProject string `arg:"env:EPF_MEMORY_PROJECT"`
    MemoryToken   string `arg:"env:EPF_MEMORY_TOKEN"`
}
```

### Decision 3: epf-cli packages imported as library, not copied

**What:** Import `internal/` packages from `apps/epf-cli` using Go's module path
(`github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/...`).

**Why:** Single source of truth for the EPF domain model, validator, schema registry, and
semantic engine. If epf-cli's schema definitions evolve (even in maintenance mode), strategy-server
gets the update automatically. Copying code creates two drifting implementations.

**Risk:** If epf-cli is ever moved to a separate module, import paths break. Mitigated by keeping
both apps in the same `emergent-strategy` repository with a single `go.work`.

### Decision 4: Database schema reflects EPF domain

**What:** PostgreSQL tables for workspaces, strategy instances, artifacts (north star, features,
roadmap, etc.), mutations (append-only), and audit log.

**Core tables (initial):**
```sql
-- Workspace: a user/org and their strategy instances
workspaces (id UUID PK, github_owner TEXT, created_at, updated_at, deleted_at)

-- StrategyInstance: a versioned EPF instance within a workspace
strategy_instances (
    id UUID PK,
    workspace_id UUID FK,
    name TEXT,
    description TEXT,
    github_repo TEXT,
    github_base_path TEXT,
    status TEXT,      -- draft | active | archived
    created_by UUID,
    created_at, updated_at, deleted_at
)

-- StrategyMutation: append-only log of every change
strategy_mutations (
    id UUID PK,
    instance_id UUID FK,
    artifact_type TEXT,
    artifact_key TEXT,
    action TEXT,      -- create | update | archive
    payload JSONB,    -- full artifact snapshot
    source TEXT,      -- mcp | web | import | system
    created_by UUID,
    created_at
)

-- AuditLog: all significant events
audit_log (
    id UUID PK,
    entity_type TEXT,
    entity_id UUID,
    action TEXT,
    source TEXT,
    actor_id UUID,
    details JSONB,
    created_at
)
```

### Decision 5: MCP is the primary Phase 2 interface — all capabilities exposed as tools

**What:** Every domain operation has a corresponding MCP tool. The tool set is the acceptance
test for Phase 2. If the agent can complete every user journey using only MCP tools, Phase 2
is done.

**MCP tool categories (initial inventory):**

Read tools (safe, no staging required):
- `list_workspaces` — list accessible EPF workspaces
- `get_workspace` — get workspace details
- `list_instances` — list strategy instances in a workspace
- `get_instance` — get instance details and health
- `get_strategy_context` — full strategic context (vision, personas, position)
- `get_product_vision` — north star details
- `get_personas` — persona list with pain points
- `get_competitive_position` — competitive analysis
- `get_roadmap` — full roadmap summary
- `list_features` — feature list with strategic alignment
- `get_feature` — individual feature details with value model
- `validate_artifact` — validate an artifact file
- `health_check` — instance health report
- `search_strategy` — semantic search across strategy graph
- `get_neighbors` — graph neighborhood for a strategy node
- `list_mutations` — change history for an instance
- `detect_contradictions` — structural contradiction scan

Write tools (create staging batch, require commit):
- `create_workspace` — register a new workspace
- `import_instance` — import EPF artifacts from GitHub into DB
- `update_north_star` — draft north star change
- `update_feature` — draft feature update
- `create_feature` — draft new feature
- `archive_feature` — draft feature archival
- `run_scenario` — create what-if branch
- `commit_batch` — atomically commit a staged batch of changes
- `discard_batch` — discard a staged batch

### Decision 6: i18n, audit, and auth scaffolded before first service method

**What:** All three day-one patterns from the constitution installed before any business logic:
1. `internal/langs/` — `T(ctx, key)`, `locale.toml` with `en` and `nb` sections
2. `domain/audit/` — `ContextWithAudit`, `AuditFromContext`, `ContextWithSource`
3. `internal/web/middleware.go` — `AuthMiddleware` as no-op in dev, real in prod

**Why:** The cost multiplier table in the constitution is explicit. Retrofitting i18n across
60 template files costs ~15 dev-days. Audit logging across 40+ service methods costs ~77 tasks.
Both are zero cost if done first.

### Decision 7: Append-only mutation log as the source of truth

**What:** Strategy mutations are never updated or deleted. Every change to a strategy artifact
is a new record in `strategy_mutations`. Current state is derived by reading the latest mutation
per artifact key.

**Why:** Strategy decisions have a history. "Why did we deprioritize feature X?" is a question
the system must be able to answer. An audit trail also enables scenario branching and rollback.
This matches the constitution's ledger mindset exactly.

**Implementation:** `strategy_mutations` is append-only. The service computes current state by
`SELECT ... WHERE instance_id = ? AND artifact_key = ? ORDER BY created_at DESC LIMIT 1`.
Materialized views or computed columns provide fast current-state access if performance evidence
demands it later.

## Domain Model

```
Workspace (github_owner, github_org)
  └─ StrategyInstance (github_repo, base_path, status)
       ├─ NorthStar         (derived from mutations)
       ├─ PersonaSet        (derived from mutations)
       ├─ StrategicContext  (derived from mutations)
       ├─ Roadmap           (derived from mutations)
       │   └─ Feature[]     (derived from mutations)
       │       └─ ValueModel
       └─ AIMPhase
           └─ LRA, OKRs, Assumptions
```

Each artifact type maps to:
- A row (or set of rows) in `strategy_mutations` (source of truth)
- A parsed Go struct from `epf-cli/internal/strategy` (for reading)
- A JSON Schema from `epf-cli/internal/schema` (for validation)
- An MCP tool pair (read + write/stage)
- An HTMX screen (Phase 3)

## Tech Stack (full constitution compliance)

| Concern | Library |
|---|---|
| Language | Go (latest stable) |
| Database | PostgreSQL 16 |
| ORM | `uptrace/bun` + `jackc/pgx/v5` |
| HTTP | Echo v4 + `danielgtaylor/huma/v2` |
| CLI/Config | `alexflint/go-arg` |
| Migrations | `pressly/goose/v3` embedded SQL |
| Logging | `log/slog` JSON |
| UUIDs | `google/uuid` |
| Templates | `a-h/templ` |
| UI components | `emergent-company/go-daisy` |
| Interactivity | HTMX v4 |
| Live reload | Air + templ watch |
| Task runner | `go-task/task` |
| Linting | `golangci-lint` |
| Containers | Docker Compose (Postgres only) |

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| epf-cli internal package API changes break imports | epf-cli is frozen — API is stable |
| go.work multi-module complexity | Both apps in same repo, single go.work; straightforward |
| PostgreSQL schema design for strategy mutations is complex | Spec the schema in Phase 1 before any code |
| MCP tool count grows large | Use same agent/skill recommendation pattern as epf-cli |
| Phase 2 MCP tests require a running DB | Docker Compose Postgres; `task docker-deps` |
| templ + go-daisy CSS pipeline | Follow constitution section 16 exactly from day one |

## Open Questions

- Should `strategy-server` also serve stdio MCP (for local AI agent use) or only HTTP MCP?
  The constitution says MCP in Phase 2, but epf-cli already covers local stdio. Recommendation:
  HTTP MCP only; use epf-cli for local stdio.

- What is the multi-tenancy model? Per-workspace isolation in one DB, or separate schemas?
  Recommendation: row-level isolation with `workspace_id` on every table (simpler, proven).

- Which languages for i18n from day one? Recommendation: English (`en`) and Norwegian (`nb`)
  to match the Emergent company's market.

- Should the semantic engine (propagation, scenarios) be synchronous (blocking the MCP call)
  or async (return a job ID)? Recommendation: async with a job table; propagation can take
  seconds to minutes on large graphs.
