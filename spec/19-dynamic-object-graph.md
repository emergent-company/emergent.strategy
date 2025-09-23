# Dynamic Object Graph & Extensible Type System

Status: Draft
Owners: Data / Backend Architecture
Last Updated: 2025-09-23
Related Specs: `04-data-model.md`, `03-architecture.md`, `12-ai-chat.md`

## 1. Problem Statement
Current model supports a predefined taxonomy (Requirements, Decisions, Meetings, etc.) plus generic `Entity` / `Relation` tables. We need to: (a) allow tenants (orgs/projects) to introduce custom object types and custom properties without DDL churn, (b) uniformly model relationships between heterogeneous objects, and (c) efficiently query arbitrarily deep relationship expansions ("give me the Decision with all related People through Meetings where it was made"). We want to defer introducing a dedicated external graph database until clear scale / query complexity thresholds are hit, maintaining ACID, RLS, and operational simplicity.

## 2. Goals & Requirements
### Functional
- Create/read/update versioned objects of core + tenant-defined types.
- Attach arbitrary typed properties (primitive, enum, array, object) validated by a JSON Schema per object type version.
- Express directed relationships with typed edges including metadata (weight, role labels, evidence references, temporal validity).
- Fetch object(s) with N-level relationship expansion filtered by edge types, node types, direction, and property predicates.
- Support multi-hop queries like: Decision → (decides)<- Meeting → (attended_by) -> Person.
- Support path constraints (maxDepth, distinct nodes, cycle handling) and field projection (which node properties to include).
- Provide deterministic ordering and pagination for large expansions.
- Support soft delete & historical version retrieval (time-travel per object version chain).

### Non-Functional
- Multi-tenancy enforcement (tenant/org/project scoping) via single datastore (Postgres) with RLS.
- Strong consistency (single transaction for object + relationships creation where needed).
- Horizontal scalability: initial target < 50M objects, < 250M edges; design to evolve to > 500M edges with partitioning.
- Query latency p50 < 150ms and p95 < 500ms for depth ≤ 3 expansions with ≤ 5K returned nodes in warm cache.
- Extensible without downtime: adding new type schema or relationship type does not require DB migrations (aside from optional indexes).
- Observability: log cardinality, depth, rows scanned, fallback strategies.

### Security & Governance
- Enforce that expansions cannot traverse outside caller's tenant/org/project context.
- Per-type & per-edge read restrictions (future) via policy table.
- Quotas: limit maxDepth (e.g., 6) and maxNodeCount per request to mitigate explosion.

## 3. Option Evaluation
| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Postgres adjacency (objects + relationships tables, JSONB props) | Single system (RLS, transactions), low ops, leverages existing indexes, incremental adoption | Complex pattern queries require recursive CTEs; very deep traversals slower than native graph | Adopt Phase 1 |
| Postgres + Apache AGE (openCypher) | Rich pattern syntax, indexes reuse PG storage | Extension maturity, potential operational complexity, limited RLS docs, adds dependency | Evaluate after Phase 2 KPIs |
| External Graph (Neo4j/Memgraph) | Native graph performance, Cypher, built-in path functions | Dual writes / eventual consistency, separate auth + backups, costly, RLS gap | Defer (Phase >=3 trigger) |
| EAV (entity-attribute-value) for dynamic props | Flexible | Harder querying/aggregation, verbose, join explosion | Reject (JSONB + schema registry preferred) |
| Document DB (Mongo) sidecar | Schemaless, easy custom types | Separate system, no joins/FTS integration, complexity | Reject |

## 4. Recommended Architecture (Phase 1)
Use enhanced generic tables:

### 4.1 Tables
```sql
-- Unified Objects
CREATE TABLE kb.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  type TEXT NOT NULL,                 -- e.g., 'Meeting','Decision','Goal','Custom:RiskRegisterItem'
  subtype TEXT,                       -- optional refinement / variant
  title TEXT NOT NULL,
  status TEXT,                        -- optional status taxonomy
  version INT NOT NULL DEFAULT 1,
  supersedes_id UUID,                 -- previous version id (same logical identity)
  canonical_id UUID GENERATED ALWAYS AS (
    COALESCE(supersedes_id, id)
  ) STORED,                           -- chain root (for logical grouping)
  properties JSONB NOT NULL DEFAULT '{}',
  labels TEXT[] DEFAULT '{}',
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  evidence JSONB,                     -- same evidence structure described earlier
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Directed Relationships
CREATE TABLE kb.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  type TEXT NOT NULL,                 -- e.g., 'decides','attended_by','relates_to','custom:*'
  src_object_id UUID NOT NULL REFERENCES kb.objects(id) ON DELETE CASCADE,
  dst_object_id UUID NOT NULL REFERENCES kb.objects(id) ON DELETE CASCADE,
  weight REAL,                        -- ranking / confidence
  role_src TEXT,                      -- optional role labels
  role_dst TEXT,
  properties JSONB NOT NULL DEFAULT '{}',
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  evidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 Supporting Tables
```sql
-- Type Schema Registry
CREATE TABLE kb.object_type_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,                     -- NULL => global/core
  type TEXT NOT NULL,                 -- logical type name
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  json_schema JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, type, version)
);

-- Relationship Type Registry
CREATE TABLE kb.relationship_type_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  type TEXT NOT NULL,
  allowed_src_types TEXT[] NOT NULL,
  allowed_dst_types TEXT[] NOT NULL,
  multiplicity JSONB,                 -- { "src": "many|one", "dst": "many|one" }
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, type)
);
```

### 4.3 Key Indexes & Constraints (initial)
```sql
CREATE INDEX ON kb.objects (tenant_id, project_id, type);
CREATE INDEX ON kb.objects (canonical_id);
CREATE INDEX ON kb.objects (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX ON kb.objects USING GIN (labels);
CREATE INDEX ON kb.objects USING GIN ((properties jsonb_path_ops));
CREATE UNIQUE INDEX ON kb.relationships (tenant_id, src_object_id, type, dst_object_id);
CREATE INDEX ON kb.relationships (tenant_id, project_id, type);
CREATE INDEX ON kb.relationships (src_object_id);
CREATE INDEX ON kb.relationships (dst_object_id);
CREATE INDEX ON kb.relationships ((valid_to)) WHERE valid_to IS NULL;
```

Optional specialized: partial index for unique single-valued edges (e.g., each Decision has at most one owning Meeting) implemented by inserting a row into `relationship_type_schemas.multiplicity` and generating a partial unique index offline.

## 5. Object Versioning Strategy
- Each new edit that changes semantic content creates a new row with `supersedes_id = previous.id`, incremented `version`.
- `canonical_id` points at the earliest ancestor (root) allowing queries for current vs historical: `WHERE canonical_id = ? ORDER BY version DESC LIMIT 1`.
- Soft delete sets `deleted_at`; expansions exclude by default.

### 5.1 Motivation for Git‑like Semantics
Linear per-object version chains are sufficient for audit & history, but product development often requires:
1. Parallel evolution (feature being redesigned for a future release while a patch is applied to current release).
2. Release snapshots (freeze a coherent set of object versions for software version 1.1 vs 1.2).
3. Easy diff between releases (which features/requirements/decisions changed?).
4. Backporting (apply change from future branch to current maintenance branch).
5. Optional merge provenance (which versions contributed to a merged version).

We introduce lightweight branching + release snapshotting without fully replicating Git’s tree/commit model (to avoid complexity & storage explosion). Objects remain the atomic versioned unit; branches and snapshots organize sets of object heads.

### 5.2 Concepts
| Concept | Analogue | Description |
|---------|----------|-------------|
| Branch | Git branch | Logical lane of evolution. Each object version belongs to exactly one branch. Default branch = `main`. |
| Branch Head | Git HEAD per file | Latest (highest `version`) row for an object’s `canonical_id` within a branch. |
| Merge | Git merge commit | New object version on target branch referencing prior target head + one or more source versions (merge parents). |
| Release Snapshot | Git tag (annotated) | Immutable mapping from logical objects (`canonical_id`) to chosen version rows at release time. Represents product version (e.g. `1.2.0`). |
| Tag | Lightweight tag | Alias referencing a release snapshot. |

### 5.3 Schema Extensions
Add columns / new tables (namespaced `kb.`):
```sql
ALTER TABLE kb.objects
  ADD COLUMN branch_id UUID NOT NULL DEFAULT gen_random_uuid(); -- (see note below)

-- Branch registry (one row per branch per project)
CREATE TABLE kb.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  name TEXT NOT NULL,                 -- e.g. 'main','feature/epic-x','release/1.2'
  parent_branch_id UUID,              -- origin branch (null for root)
  created_from_branch_head_at TIMESTAMPTZ, -- timestamp of snapshot moment
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

-- Optional ancestry cache for fast containment / fallback (populated on branch creation)
CREATE TABLE kb.branch_lineage (
  branch_id UUID NOT NULL,
  ancestor_branch_id UUID NOT NULL,
  depth INT NOT NULL,
  PRIMARY KEY (branch_id, ancestor_branch_id)
);

-- Merge provenance (alternative to array column for analytics friendliness)
CREATE TABLE kb.object_merge_parents (
  object_id UUID NOT NULL REFERENCES kb.objects(id) ON DELETE CASCADE,
  parent_object_id UUID NOT NULL REFERENCES kb.objects(id) ON DELETE CASCADE,
  PRIMARY KEY (object_id, parent_object_id)
);

-- Release snapshot (immutable)
CREATE TABLE kb.product_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES kb.branches(id),
  name TEXT NOT NULL,                  -- '1.2.0'
  semantic_version TEXT,               -- optional separate semver string if name is friendly label
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  frozen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  base_product_version_id UUID         -- for diff / lineage
);
CREATE UNIQUE INDEX ON kb.product_versions (project_id, name);

-- Explicit snapshot membership (full snapshot strategy)
CREATE TABLE kb.product_version_members (
  product_version_id UUID NOT NULL REFERENCES kb.product_versions(id) ON DELETE CASCADE,
  object_canonical_id UUID NOT NULL,  -- logical identity root
  object_id UUID NOT NULL REFERENCES kb.objects(id) ON DELETE RESTRICT,
  PRIMARY KEY (product_version_id, object_canonical_id)
);

-- Lightweight tags bound to product versions
CREATE TABLE kb.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  product_version_id UUID NOT NULL REFERENCES kb.product_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                 -- 'stable','rc','LTS'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
```

**Branch Id Default Note:** Instead of generating a new UUID per inserted object row (which would fragment branch identity), we will: (a) create the `main` branch at project bootstrap, and (b) alter default to that static id (migration step). Pseudocode migration: look up or insert main branch id -> alter column default -> update existing objects set branch_id = main id.

### 5.4 Object Version Row Semantics on Branches
- A new version on the same branch: create row with `supersedes_id` referencing prior head in that branch (NOT necessarily global latest across all branches).
- Branch creation: either **Copy-on-Write Lazy** (preferred) or **Eager Clone**.
  - Lazy: At branch creation do NOT duplicate rows. First modification of an object on the branch forks: create new row with `supersedes_id` pointing to HEAD on parent branch; set `branch_id` to new branch. Lookup of object on branch: search for row in branch; if absent, fall back to parent lineage (join `branch_lineage` minimal depth). Cache result (optional) in `branch_heads` view.
  - Eager (simpler but heavier): duplicate all current heads from parent into branch (batch insert). Chosen only if lazy complexity proves high. We start with Lazy.

### 5.5 Release Snapshot Strategy
When freezing release `1.2.0` from branch `release/1.2`:
1. Collect all *visible* heads for that branch (lazy fallback logic applied per object).
2. Insert `product_versions` row.
3. Bulk insert each `(canonical_id, object_id)` into `product_version_members`.
4. (Optional) attach a tag (e.g., `latest`, `stable`).

This yields O(N) snapshot creation relative to number of active logical objects. Queries for a specific release become single joins with no recursive fallback.

### 5.6 Retrieval Algorithms
#### 5.6.1 Get Object HEAD on Branch
```sql
-- Given canonical_id, branch_id
WITH RECURSIVE lineage AS (
  SELECT b.id, 0 AS depth FROM kb.branches b WHERE b.id = $branch
  UNION ALL
  SELECT bl.ancestor_branch_id, depth + 1
  FROM lineage l
  JOIN kb.branch_lineage bl ON bl.branch_id = l.id
)
SELECT o.*
FROM lineage l
JOIN kb.objects o ON o.branch_id = l.id AND o.canonical_id = $canonical
WHERE o.deleted_at IS NULL
ORDER BY l.depth ASC, o.version DESC
LIMIT 1;
```
Lazy fallback picks earliest depth (closest branch) then highest version. Index hint: `(branch_id, canonical_id, version DESC)`.

#### 5.6.2 Resolve Object for Release Version
```sql
SELECT o.*
FROM kb.product_version_members m
JOIN kb.objects o ON o.id = m.object_id
WHERE m.product_version_id = $release AND m.object_canonical_id = $canonical;
```

#### 5.6.3 Diff Two Releases
```sql
SELECT COALESCE(a.object_canonical_id, b.object_canonical_id) AS canonical_id,
       a.object_id AS release_a_object,
       b.object_id AS release_b_object,
       CASE
         WHEN a.object_id IS NULL THEN 'added'
         WHEN b.object_id IS NULL THEN 'removed'
         WHEN a.object_id <> b.object_id THEN 'modified'
         ELSE 'unchanged'
       END AS change_type
FROM (
  SELECT object_canonical_id, object_id FROM kb.product_version_members WHERE product_version_id = $A
) a
FULL OUTER JOIN (
  SELECT object_canonical_id, object_id FROM kb.product_version_members WHERE product_version_id = $B
) b USING (object_canonical_id);
```

### 5.7 Merge Process
1. Identify target branch head version (T) and source branch head (S) for the same canonical object.
2. Compute 3-way merge base: walk `supersedes_id` / merge parents until common ancestor (A) discovered (application logic).
3. Field-wise merge strategies (per schema metadata):
   - Scalar: source-wins | target-wins | fail-on-divergence
   - Array: union | concat | source-wins
   - Object: recursive strategy application.
4. Create new object row M on target branch:
   - `supersedes_id = T.id`
   - Insert two rows into `object_merge_parents` (M,T) and (M,S) (plus additional if multi-way merge).
5. Update caches / invalidate branch head materialization.

Conflicts: if strategy = fail and divergence detected (T.field != S.field != A.field) → return 409 with field list.

### 5.8 Tagging
Tags simply reference `product_version_id`; deleting a tag does not affect the snapshot. Retagging a name forbidden unless explicitly deleted.

### 5.9 Garbage & Retention
- Historical object versions retained until policy triggers archival (move to cold storage table or mark archived flag) referencing older than N releases and not part of last K releases.
- Snapshot immutability: cannot delete rows in `product_version_members`; entire snapshot may be soft-deleted (tag removed) but membership preserved for audit.

### 5.10 Access Control Interactions
- Branch creation & release snapshot require project write scope.
- Read branch fallback respects tenant/org/project; no cross-branch leakage beyond lineage chain.
- Potential future: private branches (flag on branch row) hidden from non-authorized roles.

### 5.11 API Sketch
| Endpoint | Purpose |
|----------|---------|
| `POST /graph/branches` | Create branch from parent (records lineage). |
| `GET /graph/branches/:id/objects/:canonicalId` | Resolve branch head (with fallback). |
| `POST /graph/branches/:target/merge` | Merge from source branch (payload lists object canonical ids or * for all changed). |
| `POST /graph/releases` | Create release snapshot (name, branch, optional base). |
| `GET /graph/releases/:id/diff/:otherId` | Diff two releases. |
| `POST /graph/tags` | Create tag pointing to release snapshot. |

### 5.12 Justification of Snapshot vs Commit DAG
We avoid modeling commits containing *only deltas* because reconstructing a full release state would require replay and complicate queries. Full snapshot membership trades storage for query simplicity and predictable latency. With ~50K objects and 2KB avg JSON per object, a full snapshot ≈ 100MB raw; compressible & acceptable for moderate release cadence. Dedup at TOAST/page level further mitigates actual disk growth.

### 5.13 Observability Metrics
- `branch.fallback.depth` histogram (how often lazy fallback hits parent).
- `release.snapshot.size` (count objects), `release.snapshot.duration_ms`.
- `merge.conflicts.count` per schema field.

### 5.14 Future Optimizations
- **Sparse Snapshot Mode**: store only changed members + MATERIALIZED VIEW that resolves full snapshot on demand; maintain incremental refresh.
- **Pack Table**: periodic compaction rewriting old object versions into columnar storage extension for analytics (optional).
- **Automatic Backport Suggestion**: detect security-critical changes on future branch and surface objects missing on maintenance branch via diff query.

### 5.15 Open Questions
- Should we enforce semantic version parse for `product_versions.name`? (Likely yes via CHECK or app validation.)
- Policy for branch deletion with unmerged changes—mark branch as `inactive` but keep versions?
- Need per-branch object visibility filtering? (e.g., only subset of types branch?). Could add `scope_filter` JSON on branch record.

### 5.16 Implementation Order (Incremental)
1. Create `kb.branches` + seed main; migrate existing objects to main.
2. Add `branch_id` column & indexes.
3. Implement lazy branch fallback read path.
4. Add merge provenance table & APIs (single-object merge first).
5. Introduce release snapshot tables + creation endpoint.
6. Implement diff endpoint + tests.
7. Add tagging endpoint.
8. Optimize with lineage cache & metrics.

This delivers Git-like powered evolution (branches, merges, tagged releases) while reusing existing per-row version fields and keeping storage linear per change.


## 6. Relationship Semantics
- Directional: semantics encoded in `type` string (active voice from src → dst). Reverse traversals rely on specifying direction in query.
- Temporal: consumer may filter edges valid for a timestamp: `WHERE (valid_from IS NULL OR valid_from <= $ts) AND (valid_to IS NULL OR valid_to > $ts)`.
- Evidence: freeform JSON referencing chunk ids; same format as object evidence for consistency.

## 7. Query & Traversal API (Phase 1)
Expose a server endpoint (Nest Module: `GraphModule`) with a controlled JSON query descriptor (avoid arbitrary SQL or Cypher). Example endpoint: `POST /graph/expand`.

### 7.1 Request Shape
```json
{
  "roots": ["<uuid>", "<uuid>"],
  "direction": "outbound|inbound|both",            
  "maxDepth": 3,
  "edgeTypes": ["decides", "attended_by", "relates_to"],
  "nodeTypes": ["Decision", "Meeting", "Person"],
  "filters": {
    "node": { "status": { "in": ["accepted", "active"] } },
    "edge": { "weight": { ">=": 0.5 } }
  },
  "limitNodes": 5000,
  "include": { 
    "object": ["title", "type", "status", "properties.summary", "properties.start_time"],
    "edge": ["type", "weight", "properties.role"]
  },
  "dedupe": "node|edge|path",                      
  "returnPaths": false,
  "time": null                                      
}
```

### 7.2 Response Shape
```json
{
  "nodes": [
    {"id": "...", "type": "Meeting", "title": "Sprint 34 Review", "status": "done", "properties": {"start_time": "..."}},
    {"id": "...", "type": "Decision", "title": "Adopt Feature Flagging"}
  ],
  "edges": [
    {"id": "...", "type": "decides", "src": "meetingUuid", "dst": "decisionUuid", "weight": 0.9}
  ],
  "meta": {"depthReached": 2, "truncated": false, "nodesReturned": 12, "edgesReturned": 22, "executionMs": 87}
}
```

If `returnPaths = true`, add a `paths` array with each path as ordered list of node ids (bounded by `maxDepth * rootCount * branchingFactor`). Provide backend guard.

### 7.3 SQL Pattern (Recursive CTE Skeleton)
```sql
WITH RECURSIVE seed AS (
  SELECT o.id, o.type, 0 AS depth
  FROM kb.objects o
  WHERE o.id = ANY($1::uuid[])
),
traverse AS (
  SELECT s.id AS src_id, r.id AS edge_id, r.dst_object_id AS next_id, r.type AS edge_type, 1 AS depth
  FROM seed s
  JOIN kb.relationships r ON r.src_object_id = s.id
  WHERE r.type = ANY($2::text[])
  UNION ALL
  SELECT t.next_id AS src_id, r.id, r.dst_object_id, r.type, t.depth + 1
  FROM traverse t
  JOIN kb.relationships r ON r.src_object_id = t.next_id
  WHERE t.depth < $3
)
SELECT ...
```
Inbound & both directions implemented via UNION of src->dst and dst->src branches (with a direction flag) while respecting allowed edgeTypes and nodeTypes. Apply node filters in outer node selection to minimize duplicates (optionally early prune via EXISTS filters inside recursion if selective enough).

### 7.4 Cycle & Dedupe Handling
- Maintain an in-memory HashSet (application layer) for visited node ids when `dedupe != path` to cut revisits.
- SQL-level cycle prevention (expensive) avoided initially; recursion relies on app post-filtering; limit Depth × branching factor × roots.

### 7.5 Meeting → Decision → People Example
Retrieve all `Person` objects related to a specific Decision via Meetings that decided it:
1. Root: Decision id.
2. Direction inbound edge type `decides` (Meeting -> Decision) to fetch Meetings.
3. From those Meetings, outbound edge type `attended_by` to Persons.

Two-hop query variant (explicit edge sets): perform first hop to collect Meeting ids, second hop restricted to `attended_by`. Provide a convenience parameter `edgePhases`:
```json
{
  "roots": ["<decision_uuid>"],
  "phases": [
    {"edgeTypes": ["decides"], "direction": "inbound", "nodeTypes": ["Meeting"]},
    {"edgeTypes": ["attended_by"], "direction": "outbound", "nodeTypes": ["Person"]}
  ]
}
```
Backend executes sequentially, unioning nodes/edges, halting if phase returns empty set (short-circuit).

## 8. Indexing & Performance
### 8.1 Immediate
- Composite indexes listed above.
- GIN jsonb_path_ops on properties allows containment and path match: `properties @? '$.summary ? (@ like_regex "release")'`.
- Covering index candidate: `(tenant_id, type, status, updated_at DESC)` for listing.

### 8.2 Mid-term Optimizations
- Materialized view for frequently requested patterns (e.g., Meeting ↔ Decision ↔ Person) refreshed via trigger on relevant relationship inserts.
- Edge fanout stats table: maintain aggregated counts per (type, tenant) to inform query planner + apply dynamic depth guard.
- Closure table (transitive reduction) for high-value hierarchical relation types (e.g., refinement tree) in `kb.object_closure` with `(ancestor_id, descendant_id, depth)`; maintained incrementally.
- Caching layer (Redis) for hot small expansions keyed by (rootId, paramHash) with short TTL (30–120s).

### 8.3 Exploding Result Protections
- Hard server caps: `maxDepth <= 6`, `limitNodes <= 10000`.
- When partial results produced, set `meta.truncated = true` and include `overflowType: 'node'|'edge'`.

## 9. Validation & Schema Enforcement
- Upon object insert/update, fetch active JSON Schema (global or tenant override) for `(type, requestedVersion?)` and validate `properties`. Reject with 422 (validation-failed) on mismatch.
- Relationship insert validates `allowed_src_types` / `allowed_dst_types` membership and multiplicity rules.
- Migration: Introducing new field optional by default; enforce required in new schema version only.

## 10. API & DTOs (Nest)
Module: `GraphModule` with `GraphController`, `GraphService`.

DTO Highlights:
```ts
interface GraphExpandRequest {
  roots: string[];
  direction?: 'outbound' | 'inbound' | 'both';
  maxDepth?: number; // default 2
  edgeTypes?: string[]; // optional filter
  nodeTypes?: string[]; // optional filter
  filters?: { node?: Record<string, unknown>; edge?: Record<string, unknown> };
  limitNodes?: number; // default 2000
  include?: { object?: string[]; edge?: string[] };
  dedupe?: 'node' | 'edge' | 'path';
  returnPaths?: boolean;
  time?: string | null; // ISO timestamp
  phases?: GraphPhase[]; // alternative to single pass
}
```
Validation: `roots` non-empty, `maxDepth` 1..6, `limitNodes` 1..10000.

Response DTO mirrors response shape with typed arrays. Provide OpenAPI schema enumerations for direction/dedupe.

## 11. Multi-Tenancy & RLS Enforcement
- All queries include tenant/org/project predicates inherited from request context (already established in existing architecture). Example predicate snippet appended to recursive CTE anchor and recursion parts: `AND r.tenant_id = $tenant AND r.project_id = $project`.
- Prevent cross-project leakage even if a relationship row were malformed by validating both object endpoints' project/org equality pre-insert.

## 12. Migration & Rollout Plan
Phase | Deliverable | Notes
------|-------------|------
1 | Tables + minimal indexes + CRUD for object/relationship + /graph/expand basic | Feature flag `GRAPH_V1_ENABLED`.
2 | Schema registry validation + phases querying + closure table for refinement relation | Benchmark & tune.
3 | Materialized views + caching + telemetry dashboard | Add adaptive depth guard.
4 | Evaluate Apache AGE prototype (read-only mirror) for complex pattern queries; compare query latency & dev complexity | Decision criterion below.

**Backfill**: Migrate existing `Entity`, `Relation`, and spec objects into `kb.objects` & `kb.relationships` by mapping columns to `properties` (script under `scripts/migrations/backfill_graph_v1.ts`). Preserve original ids if UUID; else generate and create mapping table.

## 13. Telemetry & Observability
Log structured:
```json
{
  "event": "graph.expand",
  "tenant": "...",
  "roots": 3,
  "maxDepth": 3,
  "edgeFilter": 5,
  "nodeFilter": 4,
  "nodes": 120,
  "edges": 240,
  "executionMs": 87,
  "truncated": false
}
```
Metrics: histogram for executionMs, counters for truncated requests, depth distribution, node/edge counts.

## 14. Capacity & Scaling Considerations
- Partition strategy (future): List partition `kb.relationships` by `tenant_id` or hash partition by `(tenant_id, project_id)` when table > ~200M rows to keep index height stable.
- HOT Update avoidance: store mostly immutable objects; prefer new version rows over in-place updates to reduce bloat.
- Autovacuum tuning: lower `vacuum_cost_delay` / custom thresholds for high-write relationships.

## 15. When to Introduce a Graph Extension / External Graph
Introduce Apache AGE (same Postgres cluster) if ALL are true:
- > 10 pattern query feature requests requiring variable-length path constraints (e.g., shortest path, all paths up to K) not expressible efficiently via recursive CTE.
- p95 latency for depth 3 expansions exceeds 800ms after indexing & caching optimizations.
- Developer velocity hindered by complex SQL; Cypher would reduce query code by >40% lines.

Introduce an external graph (Neo4j/Memgraph) if ANY are true:
- Need advanced algorithms (centrality, community detection) on > 500M edges interactive workloads.
- Requirement for multi-tenant isolated compute for heavy analytics conflicting with OLTP workload.
- Need sub-second deep path (depth ≥ 8) traversals not feasible in Postgres even with partitioning.

## 16. Security & Abuse Mitigation
- Rate limit `/graph/expand` (e.g., 30 req/min per user) to prevent expensive BFS floods.
- Enforce `limitNodes * maxDepth` < global cap (e.g., 60K) pre-execution.
- Sanitize include paths: whitelist top-level object fields and dotted `properties.*` paths; reject arbitrary JSONPath to avoid data exfiltration via schema drift.

## 17. Example Queries
### 17.1 Single Pass Depth 2
"Give me Meeting + Person nodes linked to this Decision":
```json
{
  "roots": ["decision-uuid"],
  "maxDepth": 2,
  "direction": "both",
  "edgeTypes": ["decides", "attended_by"],
  "nodeTypes": ["Meeting", "Person"]
}
```

### 17.2 Phased Meeting -> Decision -> Risks
```json
{
  "roots": ["meeting-uuid"],
  "phases": [
    {"edgeTypes": ["decides"], "direction": "outbound", "nodeTypes": ["Decision"]},
    {"edgeTypes": ["addresses"], "direction": "outbound", "nodeTypes": ["Risk"]}
  ]
}
```

### 17.3 Temporal Snapshot
Add `time": "2025-09-10T00:00:00Z"` to request; system appends temporal validity predicates on objects (effective range) and relationships (`valid_from/valid_to`).

## 18. Failure Modes & Handling
| Failure | Handling |
|---------|----------|
| Exceeds node cap | Return partial + `meta.truncated=true` |
| Depth recursion infinite due to cycle | Application visited set stops; returns partial |
| Invalid type name (schema missing) | 400 validation error |
| Missing root id | 404 if none found after tenant scoping |
| Schema validation fail on create | 422 validation-failed |

## 19. Open Questions
- How to expose an aggregation API (graph analytics) without overloading expand? (Likely separate `/graph/aggregate` endpoint with pre-defined metrics.)
- Do we need per-edge ordering persistence (ordinal) beyond weight? (If meeting agenda sequences needed, add `ordinal INT`.)
- Should we store inverse edges physically for hot inbound queries? (Monitor inbound query ratio; consider denormalized mirror.)

## 20. Implementation Checklist (Phase 1)
- [ ] Create tables & base indexes.
- [ ] Implement object CRUD with schema validation (schema optional initially; if absent, accept properties as-is).
- [ ] Implement relationship CRUD with multiplicity constraints (app-layer first).
- [ ] Implement `/graph/expand` single-pass recursion.
- [ ] Enforce depth & node limits.
- [ ] Add telemetry logging.
- [ ] Backfill existing `Entity/Relation` into new tables (script).
- [ ] Documentation & OpenAPI additions.
- [ ] Benchmarks (seed synthetic graph, measure depth 1–3 latencies, capture baseline).

## 21. Summary
This design keeps us in Postgres for the near to mid-term, maximizing operational simplicity and leveraging existing multi-tenancy + RLS patterns. We introduce a schema registry for dynamic validation, a controlled expansion API with resource guards, and a path to scale (indexes, closure tables, eventual partitioning). Future adoption of Apache AGE or an external graph is gated by explicit performance and capability triggers, preventing premature complexity.

