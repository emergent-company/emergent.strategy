# Change: Complete Strategy Server Phase 2 — Full MCP Agent Backend

## Why

The strategy-server has a substantial Phase 2 backend — 76 MCP tools, 6 domain
packages, a strategic index with graph queries, skill pack system, and app
platform. But three critical gaps prevent it from being a viable end-to-end
backend for coding agents:

1. **Semantic engine is stubbed.** All 7 methods in `domain/semantic` return
   empty results. Without this, `search_strategy`, `get_neighbors`,
   `detect_contradictions`, and scenario tools are dead code. The strategic
   intelligence layer — what makes strategy-server more than a CRUD store — is
   missing.

2. **Auth is dev-only.** The auth middleware hard-401s in production. There is
   no real authentication or tenant isolation. The existing spec targets GitHub
   OAuth, but the correct provider is Zitadel (already running for
   emergent-memory). This is captured in the `add-zitadel-multi-tenant`
   proposal.

3. **Task routing is absent.** With 76 tools, agents need a routing layer
   (`get_agent_for_task`) to self-navigate the tool surface. Without it, agents
   must be pre-programmed to know which tool to call — defeating the purpose of
   a discoverable MCP interface.

The constitution requires Phase 2 to be complete before Phase 3 (web UI). The
exit gate is: "Full MCP tool coverage with integration tests." This proposal
consolidates the remaining Phase 2 work into a single trackable plan.

The milestone: **a coding agent pointed at strategy-server's MCP endpoint can
perform all EPF strategy operations end-to-end, with real auth, persistent
semantic graph, and self-discoverable tools.**

## What Changes

### 1. Self-Hosted Memory (semantic engine)

Deploy emergent-memory alongside strategy-server as a co-located service. Wire
`domain/semantic` to the Memory API. This replaces the stubs with real
implementations:

- Add Memory server to `docker-compose.yml` (Postgres shared or dedicated,
  configurable)
- Import or adapt `epf-cli/internal/memory` client for strategy-server
- Wire `domain/semantic` methods to Memory client (search, neighbors,
  contradictions, scenarios)
- Connect decomposer/ingestion: when a batch is committed, asynchronously
  ingest affected artifacts into Memory graph
- Add full re-ingest command for rebuilding the graph from the mutation ledger
- Configure Memory project, schemas, and relationship types at startup

### 2. Zitadel Auth and Multi-Tenant Model

Implement the `add-zitadel-multi-tenant` proposal:

- Replace GitHub OAuth config with Zitadel OIDC introspection
- Add users, orgs, org memberships, org invitations tables
- Implement tenant isolation (all queries scoped to caller's org)
- Three deployment modes: shared (same Postgres as Memory), standalone, dev
- 5 new MCP tools for org management

### 3. Task Routing and Agent Discoverability

Port the agent/task routing system from epf-cli:

- `get_agent_for_task` — routes natural-language task descriptions to the right
  tool or agent, with direct tool shortcuts for simple operations
- `list_agents` / `get_agent` — already exist but need enrichment with routing
  metadata
- Agent knowledge base — `internal/agent/knowledge.go` already exists (630
  lines); ensure it's injected into MCP server instructions

### 4. Tool Parity and Polish

Fill remaining gaps between epf-cli and strategy-server MCP surfaces:

- AIM tools: assumption validation, recalibration, SRC tools
- Relationship maintenance: `add_implementation_reference`,
  `suggest_relationships`
- Definition tools: `list_definitions`, `get_definition`
- Validation: `validate_with_plan`, `validate_section`
- Content readiness scoring refinements
- Update tool descriptions to follow trigger-phrase convention

### 5. Integration Testing and Dogfooding

- Write end-to-end integration tests covering the full agent workflow:
  import instance → query strategy → stage mutation → commit → verify in
  semantic graph
- Dogfood: configure a coding agent to use strategy-server MCP endpoint
  (instead of epf-cli) for real strategy work
- Document the switchover path for existing epf-cli MCP users

## Impact

- **Affected specs:** `strategy-semantic` (wire stubs to real Memory),
  `strategy-auth` (**BREAKING**: replace GitHub OAuth with Zitadel OIDC),
  `strategy-mcp` (add routing tools, org tools, missing parity tools)
- **Affected code:**
  - `docker-compose.yml` — add Memory server service
  - `config/config.go` — Memory config, Zitadel config, DB mode
  - `domain/semantic/` — replace stubs with real Memory client calls
  - `domain/user/`, `domain/org/` — new domain services
  - `internal/auth/` — new Zitadel introspection package
  - `internal/web/middleware.go` — real auth path
  - `internal/mcpserver/` — new tools (routing, org, parity)
  - `internal/database/migrations/` — new migrations for users, orgs, auth cache
  - `cmd_serve.go` — Memory client initialization, schema bootstrapping
- **No changes to `apps/epf-cli/`** (frozen)
- **BREAKING** (internal): `web.User.GithubLogin` removed; `web.User.Sub` added
- **Consolidates work from:** `add-strategy-server` (tasks 2.4.x, 2.5.5),
  `add-zitadel-multi-tenant` (entire proposal),
  `add-emergent-strategy-platform` Phase 1 (semantic wiring)
