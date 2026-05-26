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

## CSS Build — Critical Rules

The Tailwind CSS build **must** run from `apps/strategy-server/`, not from inside `web/`.

```bash
# CORRECT — always use task css
cd apps/strategy-server && task css

# CORRECT — manual equivalent (note: cd to apps/strategy-server first)
cd apps/strategy-server && node web/node_modules/.bin/tailwindcss -i web/base.css -o web/staticfiles/static/css/app.css --minify

# WRONG — running from inside web/ only scans base.css, produces ~73KB truncated output
cd apps/strategy-server/web && node node_modules/.bin/tailwindcss -i base.css -o ...
```

**CSS size is a correctness signal:**
- ~168KB = correct (Tailwind scanned all `.templ` + `.go` source files)
- ~73KB = wrong working directory (only `base.css` was scanned)

**After any CSS change, rebuild the binary** — `app.css` is `go:embed` compiled in:

```bash
cd apps/strategy-server && task css && go build -o /tmp/strategy-server . && /tmp/strategy-server server
```

**`@source inline(...)` in `base.css` is for two legitimate cases:**
1. **go-daisy shell component classes** — `AppShell`, `Sidebar`, `Navbar` live in the Go module
   cache and emit classes like `px-2.5`, `space-y-0.5`, `min-h-10`, `size-4.5`, `max-lg:hidden`
   that Tailwind cannot scan. These are safelisted in `base.css`.
2. **Opacity/modifier variants** — e.g. `bg-primary/10`, `text-base-content/50` used with
   go-daisy tokens that aren't in our source files.

Never use it to compensate for a wrong build path. If a class is used in our own `.templ`
files, fix the build path — don't safelist it.

## Architecture

Four-phase build order — do not start the next phase until the exit gate is met:

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | **Complete** | Foundation: scaffolding, day-one patterns, capability specs |
| Phase 2 | **Complete** | MCP server — 141 tools, auth, semantic engine, versioning, GitHub sync |
| Phase 3 | **In progress** | HTMX web UI — dashboard enrichment, AIM pipeline, tool filtering |
| Phase 4 | Not started | Inline AI in web UI |

### Phase 2 status

- **2a (Memory integration):** Complete — docker-compose, memory client, semantic
  service wiring, async ingestion pipeline, dual-layer graph (artifact + decomposed)
- **2b (Auth + multi-tenant):** Complete — Zitadel introspection, user/org model,
  auth middleware, org MCP tools
- **2c (Tool parity):** Complete — 141 MCP tools, agent routing, knowledge base
- **2d (Integration tests):** In progress — E2E tests for semantic tools (mocked Memory),
  org lifecycle, ingest pipeline, full agent workflow. Remaining: multi-tenant isolation,
  documentation
- **2e (Schema registry + versioning + GitHub sync):** Complete — schema registry with
  DB + embedded fallback, strategy versioning (publish/list/get/diff/restore), GitHub
  App write-back (branch + commit + PR), decomposer field reconciliation.
- **AIM lifecycle:** Complete — `domain/aim/` package (assessment, calibration, apply),
  orchestrated AIM cycles with SSE progress streaming, heartbeat-driven cycle proposals,
  evidence ingestion pipeline, autonomous skill execution.
- **Ripple coherence:** Complete — signal detection, convergence loop, equilibrium
  scoring, authority tiers, auto-versioning on equilibrium.
- **Tool filtering:** Complete — 13 categories, default core-only visibility,
  `list_tool_categories` and `set_tool_filter` meta-tools.

### Phase 3 status

- **Dashboard enrichment:** Complete — global dashboard cards show north star vision,
  health indicators, coherence score, signal counts, evidence, versions.
- **Execution dashboard:** Complete — strategic focus section with north star banner,
  strategic bets, health summary sidebar.
- **AIM pipeline UI:** Complete — cycle stepper, draft review flow, run panel with
  SSE streaming, proposal cards with approve/defer/dismiss.
- **FIRE phase UI:** Complete — track dashboards, feature detail, value model detail,
  definition detail, canonical definition installer.
- **READY phase UI:** Complete — artifact views for all 7 READY artifacts, bootstrap
  draft actions with generating indicators.

## Tech Stack

| Concern | Library |
|---|---|
| Language | Go 1.26 |
| Database | PostgreSQL 16 via `uptrace/bun` + `jackc/pgx/v5` |
| HTTP | Echo v4 + `danielgtaylor/huma/v2` |
| CLI/Config | `alexflint/go-arg` |
| Migrations | `pressly/goose/v3` embedded SQL (28 migrations) |
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
| `domain/ripple/` | Ripple coherence engine (signals, propagation, convergence, equilibrium) |
| `domain/aim/` | AI-assisted AIM cycle (trigger evaluation, draft assessment/calibration/apply, cycle snapshots, orchestrated cycle workflow) |
| `domain/heartbeat/` | Background heartbeat ticker, trigger evaluation, cycle proposals (pending/approved/deferred/expired lifecycle) |
| `domain/evidence/` | Evidence ingestion and management — first-class artifacts stored in strategy_artifacts + Memory |
| `domain/skillexec/` | Autonomous skill execution engine (context building, LLM calls, chunk-based validation) |
| `domain/skillrun/` | Skill run ledger — execution history and LLM token usage tracking |
| `domain/activity/` | Activity stream — event sourcing for instance-level lifecycle events |
| `domain/watchdog/` | Instance health monitoring (stale artifacts, orphans, coherence issues) |

### Internal packages

| Package | Purpose |
|---------|---------|
| `internal/database/` | DB connection, migrations (28), `TestDB(t)` |
| `internal/mcpserver/` | 141 MCP tools across 13 registration files, tool category filter |
| `internal/navigation/` | Navigation graph — screens, tabs, routes, breadcrumbs (single source of truth for web UI) |
| `internal/handler/` | Web UI handlers — HTMX rendering, RenderTriple pattern, graph-driven route registration |
| `internal/ui/` | Templ components for all web pages (dashboards, phases, AIM pipeline, evidence) |
| `internal/pipeline/` | Post-commit pipeline (ripple analysis, Memory ingestion, validation) |
| `internal/auth/` | Zitadel OIDC introspection + PostgreSQL cache |
| `internal/memory/` | emergent.memory REST API client (7 files) |
| `internal/agent/` | Task routing (`get_agent_for_task`) + domain knowledge base (29 topics) |
| `internal/embedded/` | go:embed EPF schemas, templates, agents, skills, field manifest |
| `internal/github/` | GitHub App client (JWT, installation tokens, Git tree API) |
| `internal/web/` | Auth + audit + lang middleware |
| `internal/audit/` | Audit context contract |
| `internal/langs/` | i18n translations |
| `internal/skillrunner/` | Script skill subprocess execution |
| `pkg/orchestration/` | Interface-driven async workflow orchestrator (Engine, Backend, Workflow, SSE fanout) |
| `pkg/orchestration/pg/` | PostgreSQL-backed orchestration backend with goroutine worker pool |
| `internal/domain/` | Shared struct definitions with bun tags |
| `internal/index/` | Strategic relationship index derivation |

### Database migrations

28 migrations in `internal/database/migrations/`:

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
| `014_sync_status_and_fks.sql` | Memory sync status + created_by FK constraints |
| `015_ripple_signals.sql` | Ripple signals table + batch_metadata column |
| `016_ripple_convergence.sql` | Ripple config, convergence runs, version metadata enrichment |
| `017_enrich_orgs.sql` | Org enrichment fields (org_number, country, website, twentyfirst_id) |
| `018_memory_sync_counts.sql` | Memory sync object/edge counts on instances |
| `019_memory_decomposed_counts.sql` | Memory decomposed object/edge counts |
| `020_instance_cascade_delete.sql` | Cascade delete for instance cleanup |
| `021_aim_cycle_index.sql` | Index on strategy_versions(instance_id, source) for AIM cycle queries |
| `022_orchestration_runs.sql` | `orchestration_runs` table + index on (workflow_name, concurrency_key, status) |
| `023_heartbeat_signals.sql` | `heartbeat_signals` table — persistent trigger events per instance |
| `024_cycle_proposals.sql` | `cycle_proposals` table — AIM cycle proposals with status/snooze lifecycle |
| `025_strategy_activities.sql` | Activity stream event log |
| `026_skill_runs.sql` | Skill execution ledger + LLM token usage |
| `027_proposal_dismissed_status.sql` | Add dismissed status to cycle proposals |
| `028_mutation_staging_status.sql` | Staging status for mutations |

## MCP Server

The server exposes 141 MCP tools at `/mcp`, organized into 13 categories with
context-aware filtering. By default only ~13 core tools are visible; clients
call `list_tool_categories` and `set_tool_filter` to activate additional categories.

| Category | Count | Examples |
|----------|-------|---------|
| core | ~13 | `get_agent_for_task`, `list_workspaces`, `health_check`, `commit_batch`, `search_strategy` |
| strategy | 12 | `get_product_vision`, `get_personas`, `get_roadmap`, `get_coverage_analysis` |
| features | 16 | `create_feature`, `update_feature`, `list_artifacts`, `add_relationship` |
| authoring | 6 | `update_north_star`, `update_strategy_formula`, `update_roadmap` |
| aim | 13 | `draft_aim_assessment`, `draft_aim_calibration`, `aim_start_cycle`, `list_aim_cycles` |
| ripple | 11 | `coherence_check`, `list_signals`, `get_equilibrium_status`, `propose_change` |
| evidence | 5 | `ingest_evidence`, `list_evidence`, `link_evidence` |
| semantic | 6 | `detect_contradictions`, `get_neighbors`, `run_scenario` |
| validation | 8 | `validate_artifact`, `validate_with_plan`, `export_report` |
| admin | 21 | `scaffold_instance`, `publish_version`, `sync_to_github`, `create_org` |
| knowledge | 10 | `list_schemas`, `get_template`, `get_agent`, `get_skill` |
| packs | 11 | `install_pack`, `run_skill`, `run_app`, `scaffold_skill` |
| observability | 9 | `list_activities`, `list_skill_runs`, `get_llm_usage`, `list_cycle_proposals` |
| Evidence | 5 | `ingest_evidence`, `get_evidence`, `list_evidence`, `update_evidence`, `link_evidence` |

### Ripple Coherence Engine

The strategy graph is interconnected — changing one artifact can misalign others.
The Ripple Coherence Engine detects these misalignments, classifies them by
authority tier, and runs a convergence loop to reach equilibrium.

**After every `commit_batch`:**
1. Post-commit ripple analysis detects structural misalignments
2. Semantic change classification (via Memory when available) assigns authority tiers
3. Convergence loop iterates until equilibrium or damping limits
4. If equilibrium is reached with changes, an auto-published version snapshot is created

**Authority tiers:**
- `autonomous` — trivial/minor changes (high semantic similarity). Auto-resolvable.
- `gated` — significant changes. Require human `commit_batch` approval.
- `escalated` — major changes. Require human review with blast radius acknowledgment.

**Equilibrium:** Threshold-based coherence score (0.0-1.0, default 0.70). Accounts for
natural inter-track tension (Product-Commercial divergence of 0.25 is normal).

**Damping:** 4-layer safety net — max iterations (5), change budget (0.50),
anchor drift (0.10 for North Star/formula), emergency brake (signal count increasing).

**Key tools:**
| Tool | Purpose |
|------|---------|
| `propose_change` | Preview blast radius before committing |
| `coherence_check` | Full-graph coherence analysis |
| `list_signals` | View active ripple signals |
| `generate_ripple_batch` | Context for AI-assisted resolution |
| `acknowledge_signal` | Mark signal as seen |
| `resolve_signal` | Mark signal as addressed |
| `dismiss_signal` | Mark signal as intentional |
| `get_equilibrium_status` | Current coherence score and breakdown |
| `get_convergence_history` | Past convergence runs and outcomes |
| `get_ripple_config` | Current thresholds and baselines |
| `update_ripple_config` | Adjust thresholds and baselines |

**Configuration examples:**

Default config (conservative — suitable for most organizations):
```json
{
  "equilibrium_threshold": 0.70,
  "damping": {"max_iterations": 5, "change_budget": 0.50, "anchor_drift_limit": 0.10},
  "authority_thresholds": {
    "_default": {"autonomous_above": 0.85, "gated_above": 0.70},
    "north_star": {"autonomous_above": 0.92, "gated_above": 0.80},
    "feature": {"autonomous_above": 0.80, "gated_above": 0.65}
  },
  "natural_tension_baselines": {
    "commercial|product": 0.25, "product|strategy": 0.15,
    "commercial|org_ops": 0.25, "org_ops|strategy": 0.15
  }
}
```

Product-led growth (low Product-Commercial tension, tighter equilibrium):
```json
{
  "equilibrium_threshold": 0.80,
  "natural_tension_baselines": {
    "commercial|product": 0.10,
    "product|strategy": 0.10
  }
}
```

Enterprise sales (higher natural tension between Product and Commercial):
```json
{
  "equilibrium_threshold": 0.65,
  "natural_tension_baselines": {
    "commercial|product": 0.35,
    "commercial|strategy": 0.30
  }
}
```

**Dual-mode operation:**
- **Agent-orchestrated** (default, MCP clients): The convergence loop detects
  and classifies signals. The AI agent sees the `convergence_summary` in the
  `commit_batch` response and drives resolution via subsequent MCP calls.
- **Server-orchestrated** (future, web UI): An LLM provider is configured and
  the convergence loop autonomously resolves low-authority signals.

### Strategy Versioning Workflow

1. Mutate artifacts via MCP tools (create/update features, north star, etc.)
2. `publish_version` — snapshots all artifacts + relationships as an atomic version
3. `list_versions` / `diff_versions` — review version history and changes
4. `restore_version` — revert to a previous version's state (creates a new version)

Versions are also auto-published when the convergence loop reaches equilibrium
with changes. Auto-published versions are tagged with `source='convergence'` and
include the equilibrium score and convergence summary in their metadata.

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
