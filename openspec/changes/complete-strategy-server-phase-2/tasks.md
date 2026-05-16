## Phase 2a: Self-Hosted Memory

### 1. Infrastructure

- [ ] 1.1 Add Memory server to `docker-compose.yml` (image, ports, env, health check)
- [ ] 1.2 Add Memory Postgres schema bootstrap (or shared DB config) to compose
- [ ] 1.3 Write `scripts/setup-memory.sh` — creates Memory project, installs EPF schemas
- [ ] 1.4 Add Memory config to `config/config.go` (`MEMORY_URL`, `MEMORY_PROJECT`, `MEMORY_TOKEN`)
- [ ] 1.5 Document local dev setup in strategy-server AGENTS.md

### 2. Memory Client

- [ ] 2.1 Create `internal/memory/client.go` — HTTP client for Memory REST API
- [ ] 2.2 Implement object CRUD (create, upsert, get, list by type, delete)
- [ ] 2.3 Implement relationship CRUD (create, list, delete)
- [ ] 2.4 Implement search (hybrid search endpoint)
- [ ] 2.5 Implement branch operations (create, merge, discard)
- [ ] 2.6 Implement journal writes (append traversal/mutation entries)
- [ ] 2.7 Write unit tests with HTTP mocks

### 3. Semantic Service Wiring

- [ ] 3.1 Wire `SearchStrategy` to Memory search endpoint
- [ ] 3.2 Wire `GetNeighbors` to Memory graph edges endpoint
- [ ] 3.3 Wire `DetectContradictions` to Memory quality audit or graph query
- [ ] 3.4 Wire `RunScenario` to Memory branch creation
- [ ] 3.5 Wire `EvaluateScenario` to Memory branch analysis
- [ ] 3.6 Wire `CommitScenario` to Memory branch merge + strategy mutation staging
- [ ] 3.7 Implement graceful degradation (return `ErrSemanticUnavailable` when Memory is down)
- [ ] 3.8 Write integration tests for semantic service with real Memory

### 4. Ingestion Pipeline

- [ ] 4.1 Import or adapt decomposer types for strategy-server (investigate `internal` import path)
- [ ] 4.2 Implement `domain/ingest/` — converts committed mutations to Memory graph objects
- [ ] 4.3 Wire async ingestion: on `CommitBatch`, enqueue ingestion job
- [ ] 4.4 Implement ingestion worker pool (configurable concurrency)
- [ ] 4.5 Add `memory_sync_status` column to `strategy_instances` (last sync point)
- [ ] 4.6 Implement re-ingest command (`db --reingest --instance-id`)
- [ ] 4.7 Ensure Memory project has EPF schemas installed at server startup
- [ ] 4.8 Write integration tests: commit batch → verify objects appear in Memory graph

---

## Phase 2b: Zitadel Auth and Multi-Tenant

### 5. Auth Infrastructure

- [ ] 5.1 Add `github.com/zitadel/oidc/v3` to `go.mod`
- [ ] 5.2 Replace GitHub OAuth config with Zitadel config in `config/config.go`
- [ ] 5.3 Add `STRATEGY_DB_MODE` config (shared / standalone / dev)
- [ ] 5.4 Create `internal/auth/introspection.go` — Zitadel OIDC introspection client
- [ ] 5.5 Implement introspection cache (Postgres-backed, configurable TTL)
- [ ] 5.6 Implement circuit breaker for Zitadel calls
- [ ] 5.7 Implement `ZITADEL_DEBUG_TOKEN` bypass for integration tests
- [ ] 5.8 Write unit tests for introspection client (mocked Zitadel)

### 6. User and Org Model

- [ ] 6.1 Write migration `005_users.sql` — `strategy.users` table
- [ ] 6.2 Write migration `006_orgs.sql` — `strategy.orgs` table
- [ ] 6.3 Write migration `007_org_memberships.sql` — `strategy.org_memberships` table
- [ ] 6.4 Write migration `008_org_invitations.sql` — `strategy.org_invitations` table
- [ ] 6.5 Write migration `009_auth_cache.sql` — `strategy.auth_introspection_cache` table
- [ ] 6.6 Write migration `010_add_org_id.sql` — add `org_id` FK to `workspaces`
- [ ] 6.7 Write migration `011_created_by_fk.sql` — FK constraints on `created_by` columns
- [ ] 6.8 Implement `domain/user/` service — `EnsureUser`, `GetByID`, `GetBySub`
- [ ] 6.9 Implement `domain/org/` service — `Create`, `List`, `AddMember`, `RemoveMember`, `ListMembers`
- [ ] 6.10 Implement invitation flow — `Invite`, `AcceptInvitation` (auto on first login)
- [ ] 6.11 Implement last-admin protection on `RemoveMember`
- [ ] 6.12 Write unit tests for user and org services

### 7. Auth Middleware and Tenant Isolation

- [ ] 7.1 Update `web.User` struct — replace `GithubLogin` with `Sub`, add `Email`
- [ ] 7.2 Wire real auth path in `AuthMiddleware` (introspect → EnsureUser → context)
- [ ] 7.3 Implement shared mode — read from `core.user_profiles`, `kb.orgs`
- [ ] 7.4 Implement standalone mode — read from `strategy.users`, `strategy.orgs`
- [ ] 7.5 Scope `list_workspaces` by org membership
- [ ] 7.6 Scope `list_instances`, `list_mutations`, `get_artifact` by workspace → org
- [ ] 7.7 Assert org membership before `commit_batch`, `discard_batch`
- [ ] 7.8 Write integration tests for tenant isolation (two users, two orgs, cross-access denied)

### 8. Org MCP Tools

- [ ] 8.1 Implement `create_org` tool
- [ ] 8.2 Implement `list_orgs` tool
- [ ] 8.3 Implement `invite_member` tool
- [ ] 8.4 Implement `remove_member` tool
- [ ] 8.5 Implement `list_members` tool
- [ ] 8.6 Write MCP tool tests for org management

---

## Phase 2c: Task Routing and Tool Parity

### 9. Agent Routing

- [ ] 9.1 Implement `get_agent_for_task` tool — keyword/category routing to tools or agents
- [ ] 9.2 Build routing table mapping task categories to tool names and agent recommendations
- [ ] 9.3 Add direct tool shortcuts (e.g., "validate" → `validate_artifact` without agent)
- [ ] 9.4 Ensure `internal/agent/knowledge.go` is injected into MCP server instructions
- [ ] 9.5 Write tests for task routing accuracy

### 10. Missing Tool Implementations

- [ ] 10.1 `get_phase_artifacts` — list artifact types by READY/FIRE/AIM phase
- [ ] 10.2 `list_definitions` / `get_definition` — canonical track definitions
- [ ] 10.3 `validate_with_plan` — chunked fix-plan for large validation error sets
- [ ] 10.4 `get_persona_details` — deep persona detail with pain points and jobs-to-do
- [ ] 10.5 `get_strategic_context` — enriched version with value model alignment
- [ ] 10.6 `explain_value_path` — already exists but verify parity with epf-cli
- [ ] 10.7 `get_coverage_analysis` — already exists but verify parity
- [ ] 10.8 AIM tools: `validate_assumptions`, `write_calibration`
- [ ] 10.9 Relationship tools: `add_implementation_reference`, `suggest_relationships`
- [ ] 10.10 Audit: review `check_content_readiness` scoring parity with epf-cli

### 11. Tool Polish

- [ ] 11.1 Update all tool descriptions to follow trigger-phrase convention (≤ 120 chars)
- [ ] 11.2 Ensure all write tools document batch_id return and commit requirement
- [ ] 11.3 Add tool categorization metadata for agent discovery
- [ ] 11.4 Review and update MCP server system prompt with current tool inventory

---

## Phase 2d: Integration Testing and Dogfooding

### 12. End-to-End Tests

- [ ] 12.1 Write E2E test: import instance → query vision → verify strategic context
- [ ] 12.2 Write E2E test: stage feature → commit → verify in semantic graph
- [ ] 12.3 Write E2E test: search strategy → verify ranked results from Memory
- [ ] 12.4 Write E2E test: create scenario → evaluate → commit/discard
- [ ] 12.5 Write E2E test: multi-tenant isolation (two orgs, cross-access denied)
- [ ] 12.6 Write E2E test: full agent workflow (routing → query → mutate → commit → verify)

### 13. Dogfooding

- [ ] 13.1 Configure a coding agent to use strategy-server MCP endpoint
- [ ] 13.2 Perform real strategy work (query, update features, run scenarios)
- [ ] 13.3 Document friction points and missing capabilities
- [ ] 13.4 Fix identified issues from dogfooding

### 14. Documentation

- [ ] 14.1 Update strategy-server AGENTS.md — phase status, new packages, deployment
- [ ] 14.2 Update CONSTITUTION.md — strategy-server directory layout, Memory integration
- [ ] 14.3 Document MCP tool parameters and response formats
- [ ] 14.4 Document deployment guide (docker-compose with Memory)
- [ ] 14.5 Document migration path from epf-cli MCP to strategy-server MCP
