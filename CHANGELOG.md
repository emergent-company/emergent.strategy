## Changelog

## [Unreleased]

### Added

**Recent Items Page** (2025-12-15)

New "Recent" page that displays recently accessed documents and objects, enabling quick access to frequently used items.

**Features:**

- **Dual-table layout**: Shows "Recent Objects" and "Recent Documents" in separate tables for clear organization
- **Activity tracking**: Records document and object views with timestamps
- **Relative time display**: Shows access times as "just now", "5 minutes ago", "yesterday", etc.
- **Action badges**: Visual indicators showing whether items were "viewed" or "edited"
- **Click-to-navigate**: Click any row to open the document or object detail view
- **Empty states**: Friendly messaging when no recent activity exists

**Technical Implementation:**

- New `kb.user_recent_items` database table with upsert behavior (10 items per type per user/project)
- `UserActivityModule` with fire-and-forget recording pattern (non-blocking)
- New scopes: `user-activity:read` and `user-activity:write`
- Frontend utility `formatRelativeTime` using native `Intl.RelativeTimeFormat`
- Route: `/admin/recent` with sidebar navigation (clock icon)

**API Endpoints:**

- `POST /user-activity/record` - Record activity (fire-and-forget from document/object views)
- `GET /user-activity/recent` - Get recent items with optional type filtering

---

**Optimized Entity Extraction (Map-Reduce + Semantic Chunking)** (2025-11-21)

Refactored the entity extraction pipeline to use a highly parallelized LangGraph Map-Reduce architecture with Semantic Chunking.

**Improvements:**

- **Semantic Chunking**: Uses `text-embedding-004` to split documents based on topic shifts rather than arbitrary token counts, ensuring better context preservation.
- **Single-Pass Extraction**: Consolidates all entity types (Requirements, Risks, etc.) into a unified schema, reducing LLM calls by ~80% (1 call per chunk instead of N types per chunk).
- **Parallel Execution**: Processes all chunks in parallel using LangGraph `Send` API.
- **Cost Efficiency**: Optimized for `gemini-2.5-flash`.

**Technical Changes:**

- Replaced `RecursiveCharacterTextSplitter` with `SemanticChunkerService`.
- Replaced sequential loop in `LangChainGeminiProvider` with `LangGraph` workflow.
- Introduced `UnifiedSchemaFactory` to merge Zod schemas dynamically.

---

**Unified Search Endpoint** (2025-11-19)

New `POST /search/unified` endpoint combines graph object search and document chunk search into a single unified interface with multiple fusion strategies.

**Features:**

- **Parallel Search Execution**: Runs graph search and text search concurrently for optimal performance
- **5 Fusion Strategies**:
  - `weighted`: Score-based combination with configurable weights (default)
  - `rrf`: Reciprocal Rank Fusion (rank-based, handles different score scales)
  - `interleave`: Alternates between graph and text results for balanced representation
  - `graph_first`: Prioritizes graph objects (decisions, requirements) over text chunks
  - `text_first`: Prioritizes document chunks over graph objects
- **Relationship Expansion**: Optionally expands relationships for graph results (configurable depth, neighbors, direction)
- **Result Type Filtering**: Choose to return graph-only, text-only, or both result types
- **Performance Tracking**: Returns execution time metadata for each search phase
- **Debug Mode**: Includes score distributions and raw results (requires `search:debug` scope)

**API Usage:**

```bash
POST /search/unified
Authorization: Bearer <token>
X-Project-ID: <projectId>

{
  "query": "hybrid search architecture",
  "limit": 20,
  "resultTypes": "both",
  "fusionStrategy": "weighted",
  "weights": {
    "graphWeight": 0.6,
    "textWeight": 0.4
  },
  "relationshipOptions": {
    "enabled": true,
    "maxDepth": 1,
    "maxNeighbors": 5,
    "direction": "both"
  }
}
```

**Response Structure:**

```typescript
{
  results: Array<GraphResult | TextResult>,  // Unified list with type discriminator
  metadata: {
    total_elapsed_ms: number,
    graph: { total, returned, elapsed_ms, channels },
    text: { total, returned, elapsed_ms },
    fusion_strategy: string
  }
}
```

**Authorization:**

- Requires `search:read` scope for all operations
- Requires `search:debug` scope for `includeDebug: true`

**Test Coverage:**

- 15 E2E test scenarios covering all fusion strategies, result filtering, validation, and authorization
- Separate quality tests for hybrid search (document chunks) and graph search with relationships

See `/apps/server/src/modules/unified-search/` for implementation details.

---

### BREAKING CHANGES

**API Headers Simplified - X-Org-ID Header Removed** (2025-11-18)

The `X-Org-ID` header has been removed from all API endpoints. API requests now only require the `X-Project-ID` header for tenant scoping. The organization ID is automatically derived from the project ID on the backend.

**Migration Required:**

- **Frontend**: Remove `X-Org-ID` from all API request headers
- **Backend Services**: Remove `X-Org-ID` from API calls to this server
- **Custom Controllers**: Update to no longer read `x-org-id` header

**Benefits:**

- Simpler API with single source of truth for tenant context
- Eliminates possibility of mismatched org/project pairs
- Better security through server-side derivation
- Cleaner code with less validation logic

**Before:**

```bash
curl -H "X-Org-ID: abc123" -H "X-Project-ID: xyz789" /api/documents
```

**After:**

```bash
curl -H "X-Project-ID: xyz789" /api/documents
```

See [Migration Guide](./docs/migrations/remove-org-id-header-migration.md) for complete migration instructions.

---

**Database Environment Variables Renamed** (v2.0.0)

All database environment variables have been standardized from `PG*` to `POSTGRES_*` format for consistency with Docker conventions and better clarity.

**Migration Required:**

| Old Variable (deprecated) | New Variable (required) |
| ------------------------- | ----------------------- |
| `PGHOST`                  | `POSTGRES_HOST`         |
| `PGPORT`                  | `POSTGRES_PORT`         |
| `PGUSER`                  | `POSTGRES_USER`         |
| `PGPASSWORD`              | `POSTGRES_PASSWORD`     |
| `PGDATABASE`              | `POSTGRES_DB`           |
| `PGDATABASE_E2E`          | `POSTGRES_DB_E2E`       |

**Action Required:**
Update your `.env` file with new variable names. See `.env.example` for reference.

```bash
# Backup your current config
cp .env .env.backup

# Update variables in .env from PG* to POSTGRES_*
# Use .env.example as template
```

**Impact:**

- All scripts now require `POSTGRES_*` variables
- Configuration schema updated
- Docker compose production deployment uses `POSTGRES_*`
- Tests use `POSTGRES_*` variables
- No backward compatibility - old variables will not work

### Security

- Hardened multi-tenant Graph RLS enforcement:
  - Introduced dedicated non-bypass application role `app_rls` with scoped CRUD grants; automatic post-schema role switch prevents `rolbypassrls` leakage.
  - Dynamic policy purge & deterministic recreation for `kb.graph_objects` / `kb.graph_relationships` (drops legacy permissive `*_isolation` policies) in both full & minimal schema paths.
  - FORCE ROW LEVEL SECURITY enabled on graph tables; per-query GUC application (`app.current_org_id`, `app.current_project_id`, `row_security=on`) ensures policies honored across pooled connections.
  - Policies tightened: tenant-scoped visibility/update when context present; explicit wildcard only when both org & project context empty.
  - Added insert fallback logic leveraging GUCs when org/project not provided to maintain consistent tenancy attribution.
  - Removed verbose debug logging; retained concise RLS enablement confirmation.
  - Tests: `graph-rls.security.spec.ts` validates isolation, wildcard mode, and cross-tenant update blocking (all passing).
  - Secret externalization: Added `APP_RLS_PASSWORD` env var; removed hard-coded credential for `app_rls` role (fallback to previous value if unset for backwards compatibility). Added regression test `graph-rls.policies.spec.ts` asserting exact policy set (guards against drift / reintroduction of permissive policies).
  - Strict verification & fail-fast guard: Added `RLS_POLICY_STRICT` env var. When true, schema ensure (both minimal & full paths) performs canonical policy set validation (exact 8 policies) and fails startup on mismatch. In non-strict mode, mismatches log a warning without aborting (existing regression test still covers drift detection).
  - Automatic password rotation: On each startup, role switch logic issues `ALTER ROLE app_rls PASSWORD <APP_RLS_PASSWORD>` so secret rotation only requires updating the environment + restart (no manual SQL). Fallback password remains for local/dev when env unset.

### Added

- Tests: Centralized deterministic vector helpers (`tests/utils/vector-helpers.ts`) providing `baseVec()` epsilon non‑zero vector (avoids zero‑norm cosine edge cases) now used across controller and service vector specs.
- Tests: Service vector search spec expanded with distance threshold filtering (minScore alias of maxDistance) and combined orgId+projectId filter coverage.
- Refactor: Service-level vector search spec updated to consume shared helper removing duplicated epsilon logic for maintainability.
- Vector Search: Service now directly supports `maxDistance` option (alias for legacy `minScore`, with precedence when both supplied) matching controller DTO semantics; added tests for precedence, zero-dimension query guard, and alias behavior.
- OpenAPI: Regenerated after vector search description / alias precedence updates. New hash: `e04be993c47a792e68baecb677b48013119342c73e6ba4803affb72a646b38bb`.
- Validation: Added range enforcement (0–2) for `minScore`/`maxDistance` in both vector search DTOs plus once-per-process debug warnings when legacy `minScore` used without `maxDistance`.
- Tests: Added OpenAPI alias regression test `tests/openapi/openapi-vector-alias.spec.ts` asserting both `minScore` and `maxDistance` remain documented.
- OpenAPI: Added vector similarity endpoints `/graph/objects/vector-search` (POST) and `/graph/objects/{id}/similar` (GET) plus full‑text search endpoint `/graph/objects/fts` (GET) with `graph:read` scopes. Paths+tags hash updated to `f408826cf4afb53f3cc9d044fd18e5191f89ae75bbdb60d8df80e789f7a82785` and full document hash `879a47133c6d84b0998fb71820c364e16ffc3c34ba8275629280275afd2fcab3`.
- Tests: Introduced `tests/utils/seed-embeddings.ts` helper (deterministic pgvector seeding with slight per-item perturbations) and updated vector controller spec to use non-zero-norm base vectors (tiny epsilon) to ensure cosine distance computations always return rows instead of empty sets when zero vectors would be ignored by pgvector.
- Tests: Relocated service-level vector search spec to `tests/graph/graph-vector.search.spec.ts` and expanded it (ordering + type + labelsAll/labelsAny + keyPrefix) using epsilon-based non‑zero vectors for stable cosine distance behavior.
- Graph object Full-Text Search endpoint `/graph/objects/fts` supporting `q`, `type`, `label`, `branch_id` with websearch syntax and rank ordering.
- Asynchronous embedding pipeline scaffolding:
  - New table `kb.graph_embedding_jobs` (pending|processing|failed|completed) with priority & backoff scheduling.
  - `EmbeddingJobsService` for enqueue/dequeue/markFailed/markCompleted operations.
  - Automatic enqueue on object create / patch when embeddings are enabled and object lacks embedding.
  - Background `EmbeddingWorkerService` that dequeues jobs and computes deterministic placeholder embeddings (sha256 based) – ready for swap with real provider when `GOOGLE_API_KEY` is present.
  - Embedding provider abstraction (`EmbeddingProvider` DI token) with default `DummySha256EmbeddingProvider` allowing future plug-in of real model without altering worker logic.
- Conditional embedding provider selection: `GraphModule` now binds `GoogleVertexEmbeddingProvider` when `EMBEDDING_PROVIDER` is set to `vertex` or `google`; falls back to deterministic dummy otherwise.
- Placeholder `GoogleVertexEmbeddingProvider` implementation hashing content with a distinct salt (`vertex:`) until real HTTP integration is added.
- Real Vertex AI embedding provider HTTP attempt with graceful fallback & deterministic stub. Falls back to hash on network / response errors (logs once).
- `EMBEDDINGS_NETWORK_DISABLED` env flag to force deterministic local embeddings even when a real provider is selected (useful for CI determinism).
- Provider selection tests (`embedding-provider.selection.spec.ts`) and Vertex behavior tests (`embedding-provider.vertex.spec.ts`).

### Environment Variables

- `GOOGLE_API_KEY` – toggles `embeddingsEnabled` feature flag (placeholder implementation currently uses deterministic embeddings regardless, but real provider integration will key off this).
- `EMBEDDING_WORKER_INTERVAL_MS` – polling interval for the worker (default 2000ms).
- `EMBEDDING_WORKER_BATCH` – max jobs claimed per tick (default 5).
- `EMBEDDING_PROVIDER` – select embedding backend (`dummy` | `vertex`/`google`). Defaults to `dummy`.
- `VERTEX_EMBEDDING_MODEL` – (future) Vertex AI model id (default `text-embedding-004`).
- `GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_LOCATION` – (future) explicit project & region configuration for Vertex calls.
- `EMBEDDINGS_NETWORK_DISABLED` – force dummy/deterministic mode even with `EMBEDDING_PROVIDER=vertex` (skips network calls).
- `APP_RLS_PASSWORD` – password for dedicated non-bypass role `app_rls` used to enforce Row Level Security (RLS) without superuser bypass. If unset, defaults to legacy fallback `app_rls_pw` (set explicitly in production and rotate via restart).

### Notes

- Worker is registered in `GraphModule` and auto-starts when DB is online. Tests can invoke `processBatch()` directly for deterministic behavior.
- Backoff: quadratic (attempt^2 \* baseDelay) capped at 1 hour.

### Added

- Graph objects: Added `fts` (tsvector) column and GIN index `idx_graph_objects_fts` plus placeholder `embedding BYTEA` and `embedding_updated_at TIMESTAMPTZ` columns. Inline lexical FTS vector populated on object create / patch / delete (tombstone) / restore using simple configuration over (type, key, serialized properties). Embedding column intentionally left null pending async embedding worker slice.
- Search scaffolding: Establishes baseline for future hybrid lexical + vector ranking without altering current search API surface.
- Telemetry: Added `graph.expand` in-memory telemetry emission mirroring existing traversal pagination event pattern.
- Tests: Added unit tests for `diffProperties` (added/removed/updated detection, large value hashing, truncation elision) and expand telemetry event shape & filter propagation.
- Relationship search ordering parity: `GET /graph/relationships/search` now supports `order=asc|desc` matching object search semantics (cursor remains created_at of last item in returned page regardless of direction).
- OpenAPI annotations (`@ApiQuery`) added for `order` parameter on object and relationship search endpoints.
- Stability: Branching spec marked sequential to eliminate rare PostgreSQL deadlock during parallel test runs involving advisory locks.
- OpenAPI golden scopes: Added `GET /graph/objects/{id}` to scope contract test (covers both graph:write and graph:read sentinel endpoints now).
- Developer utility: `print:openapi:scopes` script outputs sorted map of `method path -> scopes` to aid intentional updates of golden tests.
- OpenAPI full scope contract freeze: Added `tests/openapi-scope-golden-full.spec.ts` asserting exact mapping of every secured endpoint -> scopes (41 endpoints). Update this only with intentional, documented auth changes.
- Branch merge dry-run relationship parity: `POST /graph/branches/:targetBranchId/merge` now reports relationship diffs alongside objects with per-relationship status: `added`, `unchanged`, `fast_forward`, `conflict`. Summary counts (`relationships_total`, `_unchanged/_added/_fast_forward/_conflict`) added to response schema. Fast-forward detection uses target subset-of-source changed path heuristic mirroring object logic. Conflicts surface overlapping changed path segments with differing terminal hashes.

### Tests

- Added descending and ascending relationship ordering pagination tests ensuring deterministic head selection and cursor paging across directions.
- Updated OpenAPI regression hash after intentional spec surface change (ordering query params). Hash: `1332872eec1ff2abf82f961486b8f77f9d9c0b91b143964d1797f961b95ee9ca`.
- Updated OpenAPI regression hash after restoring deterministic top-level tags (normalization in generation script). New hash: `8fc5d404f141fe752c16f6d5c781db560ed9c69b029e43187e144d9e9203a025`.

### Added

- Graph: Branch merge dry-run endpoint `POST /graph/branches/:targetBranchId/merge` (MVP). Provides classification of divergent objects (unchanged, added, fast_forward, conflict) using content hashes & path overlap heuristic. Execution (write) path intentionally omitted in this phase.
- Feature flag env var: `GRAPH_MERGE_ENUM_HARD_LIMIT` (default 500) limits enumeration of divergent canonical objects during dry-run.

### Notes

- Conflict detection currently treats any overlapping changed path between source and target with differing final content hash as conflict (no LCA path reduction yet). Future iteration will incorporate ancestor-aware diff narrowing.

### Added

- Graph traversal: expanded E2E coverage (direction in/out/both, multi-root dedupe, truncation, filtering) for `POST /graph/traverse`.
- Documentation: Updated `docs/spec/19-dynamic-object-graph.md` with current minimal traversal API (`/graph/traverse`) vs planned `/graph/expand` comparison.

### Added

- Database readiness interceptor returning 503 `upstream-unavailable` when DB reachable but schema incomplete.
- UUID route param validation pipe converting invalid UUIDs to 400 `bad-request` instead of 500 errors.

### Changed

- Tightened `SKIP_DB` semantics: only explicit `true`/`1` values honored to prevent accidental schema skips.
- Standardized validation error envelope across endpoints: `{ error: { code: 'validation-failed', message, details } }`.
- E2E minimal schema path now includes lightweight upgrade pass to create newly introduced membership tables without full drop.
- Ingestion edge cases now map to structured 4xx codes instead of generic 500s.

### Removed

- Temporary self-healing membership table creation logic from `PermissionService` after stabilizing deterministic schema upgrade path.

### Fixed

- Missing membership table errors (42P01) under `E2E_MINIMAL_DB` re-run path resolved via upgrade + ensured extension ordering.
- User profile phone validation test aligned with standardized error envelope (no reliance on deprecated top-level `message`).

### 2025-09-07

- Removed Passkey / WebAuthn custom flow (frontend helpers, backend routes, env vars). Consolidated on Zitadel hosted OIDC only.
- Stubbed then scheduled deletion of legacy `src/zitadel/passwordless.ts` (no runtime imports remain).
- Added tombstone note in `docs/spec/15-passkey-auth.md`.

### 2025-08 (Earlier)

- Initial ingestion server, embeddings, Zitadel OIDC integration.
