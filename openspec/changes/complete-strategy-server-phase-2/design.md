## Context

Strategy-server is a Go backend serving the Emergent Strategy platform. Phase 1
(foundation) and most of Phase 2 (MCP server) are built — 76 tools, 6 domain
packages, staged mutation pattern, skill packs, app platform. Three gaps remain:
semantic engine (stubbed), auth (dev-only), and task routing (absent).

This design covers the cross-cutting architectural decisions for completing
Phase 2. Individual implementation details are in the referenced specs.

### Stakeholders

- **Coding agents** — primary consumers via MCP. Must be able to perform all
  EPF strategy operations end-to-end.
- **EPF users** — benefit from persistent strategy data, semantic search, and
  multi-user collaboration (via agents).
- **Platform operators** — deploy and maintain strategy-server + Memory as a
  co-located stack.

---

## Goals / Non-Goals

### Goals

- Strategy-server is a complete, self-contained backend for EPF strategy
  management via MCP
- Self-hosted Memory runs alongside strategy-server under operator control
- Real authentication and tenant isolation for multi-user deployments
- Agents can self-navigate the tool surface without pre-programming
- End-to-end integration tests validate the full agent workflow

### Non-Goals

- Web UI (Phase 3 — explicitly deferred)
- Inline AI in browser (Phase 4)
- Navigation graph visualization (separate proposal: `add-agent-guided-navigation`)
- Multi-instance networking across organizations
- Custom LLM provider configuration in strategy-server (delegates to Memory)

---

## Decisions

### Decision 1: Self-hosted Memory as a co-located service

Memory server runs alongside strategy-server in the same deployment boundary
(docker-compose, Kubernetes pod, or Cloud Run service group). Strategy-server
communicates with Memory via its REST API over localhost.

**Why:** Full control over upgrades, data isolation, and availability. No
external runtime dependency. Shared Postgres option minimizes infrastructure.

**Alternatives considered:**
- Managed Memory (SaaS): Creates external dependency, latency, upgrade coupling.
  Rejected.
- Embedded Memory (in-process): Memory is a separate Go server with its own
  migrations and workers. Embedding would require major refactoring. Rejected.
- No Memory (pure SQL semantic queries): Would require reimplementing vector
  search, graph traversal, and embedding in strategy-server. Rejected — Memory
  already does this.

### Decision 2: Shared Postgres as default deployment mode

In the default deployment, strategy-server and Memory share a single Postgres
instance. Strategy-server tables live in the `strategy` schema; Memory tables
live in `core` and `kb` schemas. In shared mode, strategy-server reads user
profiles and org memberships directly from Memory's tables — no identity
duplication.

**Why:** Simpler operations (one database), consistent user identity, natural
tenant isolation boundary.

**Fallback:** Standalone mode uses a separate Postgres instance for strategy-server.
Useful for air-gapped deployments or when Memory is managed externally.

### Decision 3: Zitadel OIDC for authentication

Use Zitadel as the identity provider, consistent with emergent-memory. Token
introspection with JWT-profile service account auth. PostgreSQL-backed
introspection cache with configurable TTL.

**Why:** Single sign-on with Memory. Zitadel is already deployed. Users who
access Memory automatically access strategy-server.

**Alternatives considered:**
- GitHub OAuth: Original spec target. Rejected — couples to GitHub, no org
  model, no SSO with Memory.
- Auth0/Clerk: Would require a separate identity provider. More infrastructure
  to manage. Rejected.
- API keys only: Insufficient for multi-user, no identity model. Rejected for
  production (but supported for CI/testing).

### Decision 4: Memory client as strategy-server package, not epf-cli import

Write a focused Memory client in `strategy-server/internal/memory/` rather than
importing `epf-cli/internal/memory`. The epf-cli client carries dependencies on
epf-cli config, CLI-specific error handling, and file-based operations that
don't apply to strategy-server.

**Why:** Clean dependency boundary. Strategy-server's Memory client needs only:
project bootstrap, object/relationship CRUD, search, branch operations, and
journal writes. The epf-cli client has 940+ lines with CLI-specific concerns.

**Alternative:** Import epf-cli's client directly. Rejected because Go's
`internal` package rule blocks cross-module imports, and even with restructuring,
the client carries unwanted coupling.

### Decision 5: Decomposer imported from epf-cli

The decomposer (`epf-cli/internal/decompose`) converts YAML artifacts to graph
objects. Strategy-server imports this as a library rather than rewriting it.

**Why:** The decomposer is well-tested (1900+ lines of tests), handles 15+
artifact types, and is the single source of truth for YAML-to-graph mapping.
Duplicating it would create drift.

**How:** The decomposer has no CLI-specific dependencies — it takes YAML bytes
and returns structured graph objects. It can be imported directly (if exposed) or
the types/logic can be extracted to a shared package.

### Decision 6: Async ingestion on commit, not synchronous

When a batch is committed, ingestion into Memory is triggered asynchronously.
Commit success is returned immediately; ingestion failures are logged and retried
but do not roll back the commit.

**Why:** The PostgreSQL mutation ledger is the source of truth. Memory is a
derived view. A commit must not fail because Memory is temporarily unavailable.

**Implementation:** A goroutine pool processes ingestion jobs. Failed jobs are
retried with exponential backoff. A `memory_sync_status` column on
`strategy_instances` tracks the last successful sync point.

### Decision 7: Agent routing via embedded knowledge, not LLM

`get_agent_for_task` uses keyword matching and category scoring against a static
routing table, not an LLM call. This keeps routing fast, deterministic, and free
of LLM cost.

**Why:** epf-cli's implementation proves this works. The routing table maps task
categories (e.g., "validate", "create feature", "search strategy") to tool
names or agent recommendations. LLM-based routing would add latency and cost to
every tool discovery call.

---

## Risks / Trade-offs

### Risk: Memory server adds operational complexity

Running a second service (Memory) alongside strategy-server increases the
deployment surface.

**Mitigation:** Docker-compose handles local dev. For production, a single
docker-compose or Kubernetes deployment manifest bundles both services. Health
checks on `/health` for both. Memory's failure degrades semantic features but
does not break core CRUD operations (graceful degradation).

### Risk: Shared Postgres creates schema coupling

Reading Memory's `core.user_profiles` and `kb.orgs` tables directly couples
strategy-server to Memory's schema.

**Mitigation:** Read-only access to a small, stable surface (user profiles and
org memberships). strategy-server never writes to Memory's tables. Schema
changes in Memory that affect these tables would be coordinated releases. The
standalone mode provides an escape hatch.

### Risk: Zitadel dependency

If Zitadel is unavailable, no user can authenticate.

**Mitigation:** Introspection cache with configurable TTL (default 5 minutes).
Circuit breaker prevents cascading failures. Dev mode bypass for local
development. Debug token for integration tests.

### Trade-off: Two Memory clients

epf-cli and strategy-server each have their own Memory client. This means
changes to the Memory API require updates in two places.

**Accepted because:** The clients serve different purposes (CLI file-based
operations vs. server-side async ingestion). A shared client package would
create coupling between the two apps, violating the "epf-cli is frozen"
constraint.

---

## Migration Plan

### Phase 2a: Self-Hosted Memory (can be deployed independently)

1. Add Memory server to docker-compose
2. Write strategy-server Memory client
3. Wire `domain/semantic` to Memory client
4. Connect ingestion pipeline (commit → async ingest)
5. Add re-ingest command
6. Integration tests with real Memory

### Phase 2b: Auth (can be deployed independently)

1. Implement `internal/auth` (Zitadel introspection)
2. Add user/org/membership migrations
3. Implement `domain/user` and `domain/org` services
4. Wire auth middleware
5. Add org MCP tools
6. Scope existing queries to tenant
7. Integration tests with auth

### Phase 2c: Routing and Parity (requires 2a)

1. Implement `get_agent_for_task` routing
2. Add missing tool implementations
3. Update tool descriptions
4. End-to-end integration tests
5. Dogfooding with real agent

### Rollback

Each phase is independently deployable. If Memory fails, semantic features
degrade gracefully (return `ErrSemanticUnavailable`). If auth fails, dev mode
is always available. No irreversible migrations — all new tables are additive.

---

## Open Questions

1. **Memory version pinning:** Should strategy-server pin to a specific Memory
   server version, or track latest? Recommendation: pin to a tested version in
   docker-compose, upgrade explicitly.

2. **Ingestion worker count:** How many concurrent ingestion goroutines? Needs
   benchmarking with real instance sizes (typical: 20-50 artifacts; large:
   200+).

3. **Introspection cache TTL:** Default 5 minutes — is this appropriate for
   strategy workflows where sessions are long but infrequent?

4. **Decomposer extraction:** Can `epf-cli/internal/decompose` be imported
   directly, or does Go's `internal` rule require extracting to a shared
   package? Needs investigation.
