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

### 5.17 Change Summary & Field-Level Diff Representation
To enable precise merge conflict detection, richer audit trails, and future semantic merge strategies, each new object (and relationship) version may carry a precomputed structured diff of its property changes relative to the immediately preceding visible version (branch-local prior head or ancestor fallback). This avoids on-demand diffing and standardizes conflict evaluation.

#### 5.17.1 Goals
- Fast identification of overlapping changed fields across divergent branches (path set intersection).
- Human-friendly audit (what changed) without re-diffing large JSON.
- Basis for semantic merges (array union rules, additive paths) later.
- Support analytics (e.g., which fields churn most) via aggregated path stats.

#### 5.17.2 Column Additions
Tables (future refactoring will relocate from legacy `kb.objects` model to versioned tables if/when we separate):
- `object_versions` (future) / currently `kb.objects`: `change_summary JSONB NULL`, `content_hash BYTEA NULL`.
- `relationship_versions` (future) / optionally `kb.relationships`: `change_summary JSONB NULL`, `content_hash BYTEA NULL` (only if `properties` meaningful).

`content_hash` = SHA256 of canonical serialized `properties` (deterministic key ordering) used for potential dedupe and integrity checks.

#### 5.17.3 JSON Structure
```json
{
  "added": { "/lifecycle/state": "approved", "/metrics/count": 42 },
  "removed": ["/deprecatedField"],
  "updated": {
    "/title": { "from": "Old Title", "to": "New Title" },
    "/description": { "from_hash": "sha256:9af3...", "to_hash": "sha256:ab44...", "truncated": true }
  },
  "paths": ["/title","/description","/lifecycle/state","/metrics/count","/deprecatedField"],
  "meta": {"added": 2, "removed": 1, "updated": 2, "propBytesBefore": 731, "propBytesAfter": 812}
}
```
Notes:
- Paths use RFC 6901 JSON Pointer syntax (leading slash, escaped `~` and `/`).
- Large scalar or structured values exceed thresholds → hashed (`from_hash`/`to_hash`) with `truncated=true`.
- `paths` is the *union* of all changed paths for quick overlap tests (set intersection in conflict detection).
- `propBytes*` allow churn metrics without separate size reads later.

#### 5.17.4 Generation Algorithm (Pseudo)
```
function diff(oldObj, newObj, basePath=""):
  if both scalar:
    if oldObj != newObj: recordUpdated(basePath, oldObj, newObj)
    return
  if types differ: recordUpdated(basePath, summarize(oldObj), summarize(newObj)); return
  if object:
    for k in (keys(old) ∪ keys(new)) sorted:
      path = basePath + '/' + escape(k)
      if k not in new: recordRemoved(path)
      else if k not in old: recordAdded(path, new[k])
      else diff(old[k], new[k], path)
  if array:
    for i in 0..maxLen-1:
      path = basePath + '/' + i
      if i ≥ newLen: recordRemoved(path)
      else if i ≥ oldLen: recordAdded(path, new[i])
      else diff(old[i], new[i], path)
```
`summarize(value)`: if serialized length > thresholds (string > 256 chars, JSON > 2048 bytes) → `{ from_hash|to_hash, truncated: true }`.

#### 5.17.5 Size & Compaction Rules
- Hard cap serialized `change_summary` at 16KB; if exceeded: replace `updated` with `{ "count": N, "elided": true }` (retain `paths`).
- If no property changes *and* no semantic flags (e.g., deletion) changed → skip inserting a new version (or mark `meta.noOp = true`).

#### 5.17.6 Conflict Detection (Future Merge)
Given two candidate versions Vt (target) and Vs (source) with base Vb:
1. Overlap: `intersect(Vt.paths, Vs.paths)` → candidate conflicting paths.
2. For each overlapped path P: if values in both differ from base (3-way divergence) and merge strategy for P ≠ additive → conflict.
3. Strategies (future schema metadata): scalar: source-wins|target-wins|fail; array: union|concat|replace; object: recursive.

#### 5.17.7 Optional Generated Column (Deferred)
To accelerate overlap queries without JSON extraction cost, we MAY add later:
```sql
ALTER TABLE kb.objects
  ADD COLUMN change_paths text[] GENERATED ALWAYS AS (
    (SELECT array_agg(e::text) FROM jsonb_array_elements_text(change_summary->'paths') e)
  ) STORED;
-- GIN index:
-- CREATE INDEX idx_objects_change_paths ON kb.objects USING GIN (change_paths);
```
Introduced only if merge/diff workloads show JSON extraction as bottleneck.

#### 5.17.8 API Exposure
- Default expansion & object GET omit `change_summary`.
- Version history endpoint (`GET /graph/objects/:canonicalId/versions`) accepts `?includeChangeSummary=true` to embed it.
- Audit log events include `change_summary.meta` and the path list (not full updated values) to reduce log volume.

#### 5.17.9 Telemetry
Metrics:
- `change.paths.count` distribution.
- `change.summary.size_bytes` histogram.
- `change.truncated.count` counter (elided summaries).

#### 5.17.10 Edge Cases & Rules
- Arrays treated positionally; semantic set-like behavior can be layered later (store per-element id keys for recognized array types to enable key-based diffing).
- Floating point near-equality tolerance: optionally ignore differences where `abs(a-b) < 1e-9` (config flag, default off).
- Ignored paths: future `ignored_paths` array in schema registry to suppress noisy ephemeral fields (timestamps, volatile metrics).

#### 5.17.11 Rationale for Custom Structure vs RFC 6902
- RFC 6902 (JSON Patch) is compact but requires scanning ops for path union and does not differentiate added vs updated scalar in aggregated counts without interpretation.
- Our structure provides O(1) access to union path set and immediate counts, trading modest extra bytes for simpler merge logic.

#### 5.17.12 Acceptance Tests (Additions)
- AT-P0-DIFF-1 (UT): Added/removed/updated classification correct for nested objects & arrays.
- AT-P0-DIFF-2 (UT): Large field hashed with `truncated=true`.
- AT-P0-DIFF-3 (UT): No-op update (identical properties) does not create new version.
- AT-P0-DIFF-4 (IT): Conflict path overlap detection returns expected path set (scaffold for future merge).
Link these to P0 scope once diff utility implemented.

#### 5.17.13 Open Questions
- Should we pre-hash all scalar values to speed diff equality on large documents? (Likely premature.)
- Do we need per-path change frequencies aggregated incrementally (materialized stats) vs offline analytics? (Defer.)
- Should deletion-only versions always record a synthetic `change_summary` listing all previously existing paths as `removed`? (Probably yes for full audit; cost acceptable.)


This delivers Git-like powered evolution (branches, merges, tagged releases) while reusing existing per-row version fields and keeping storage linear per change.


## 6. Relationship Semantics
- Directional: semantics encoded in `type` string (active voice from src → dst). Reverse traversals rely on specifying direction in query.
- Temporal: consumer may filter edges valid for a timestamp: `WHERE (valid_from IS NULL OR valid_from <= $ts) AND (valid_to IS NULL OR valid_to > $ts)`.
- Evidence: freeform JSON referencing chunk ids; same format as object evidence for consistency.

## 7. Query & Traversal API (Phase 1)
Expose a server endpoint (Nest Module: `GraphModule`) with a controlled JSON query descriptor (avoid arbitrary SQL or Cypher). Example endpoint: `POST /graph/expand`.

### 7.0 Current Minimal Implementation (Delivered)
The codebase currently ships a narrower traversal endpoint: `POST /graph/traverse`.

Purpose: Bounded breadth‑first search (BFS) starting from one or more root object ids, returning encountered nodes and directed edges subject to guardrails.

Request DTO (implemented):
```jsonc
{
  "root_ids": ["<uuid>"],          // 1..50 roots, required
  "direction": "out"|"in"|"both", // default "both"
  "max_depth": 0..8,               // default 2 (0 returns only roots)
  "max_nodes": 1..5000,            // default 200 (safety cap)
  "max_edges": 1..10000,           // default 400 (safety cap)
  "relationship_types": ["r1", "r2"], // optional allow‑list
  "object_types": ["TypeA","TypeB"],  // optional allow‑list for INCLUDED nodes
  "labels": ["alpha","beta"]          // optional: node must have at least one
}
```

Semantics & Algorithm:
* Iterative queue (BFS) seeded with each `root_id` depth 0.
* On dequeue: fetch latest object version by id; skip if deleted or fails `object_types` / `labels` filters.
* Record node (depth) and update `max_depth_reached`.
* If depth < `max_depth`, select adjacent relationship heads (versioned table) in the specified `direction` applying `relationship_types` filter if provided.
  * Head selection pattern: `DISTINCT ON (canonical_id) ORDER BY version DESC` inside subquery, then outer filter to exclude tombstoned heads. This avoids resurfacing stale pre‑delete versions.
* Each acceptable edge enqueues the opposite endpoint id (unless already visited) with depth+1.
* Termination when queue empty or any safety cap (`max_nodes`, `max_edges`) reached (sets `truncated = true`).

Response DTO (implemented):
```jsonc
{
  "roots": ["<uuid>"],
  "nodes": [ { "id": "<uuid>", "depth": 0, "type": "X", "key": "optional", "labels": ["l1"] } ],
  "edges": [ { "id": "<rel_uuid>", "type": "edgeType", "src_id": "<uuid>", "dst_id": "<uuid>" } ],
  "truncated": false,               // true if any cap hit
  "max_depth_reached": 2            // deepest dequeued node depth
}
```

Notably Absent (future `/graph/expand` vs current):
| Feature | `/graph/traverse` Today | Planned `/graph/expand` |
|---------|-------------------------|-------------------------|
| Property projection | Fixed minimal node fields | Selective include paths |
| Edge / node property filters | Type + label only | Arbitrary JSON/property predicates |
| Phased traversal | Not supported | Supported via `phases[]` array |
| Path enumeration | Not supported | Optional `returnPaths` |
| Temporal filtering | Not supported | Planned `time` parameter |
| Dedupe modes | Single visited‑set strategy | Configurable (`node|edge|path`) |
| Telemetry richness | Basic (count, truncated flag) | Extended (executionMs, scans, branching) |

Guards & Limits (current enforcement):
* Hard validator caps (`max_depth <= 8`, root array ≤ 50, `relationship_types` ≤ 32, `object_types` ≤ 64, `labels` ≤ 64) via `class-validator` annotations.
* Runtime caps: stops when `nodes.length >= max_nodes` OR `edges.length >= max_edges` → sets `truncated` and halts BFS loop.
* Cycle prevention: in‑memory `seen` Set (canonical id semantics not yet applied – currently per row id since traversal roots expect current head ids).

Rationale for Minimal Start:
* Establish versioned head‑selection correctness (avoid stale resurrect) before layering richer predicates.
* Keep latency predictable while gathering baseline metrics (target p95 < 150ms for depth ≤ 2 on modest fanout). Early E2E tests confirm functional correctness of depth, direction, multi‑root union, filter pruning, and truncation signaling.

Future Migration Path:
1. Introduce new `/graph/expand` endpoint rather than expanding surface of `/graph/traverse` to preserve backward compatibility of minimal contract.
2. Internally refactor traversal loop into reusable iterator supporting phase boundaries and richer pruning strategies.
3. Deprecation window: keep `/graph/traverse` for ≥ 1 release after `/graph/expand` GA, returning deprecation header.

Testing Status:
* E2E coverage: depth limiting, type+relationship+label filters, truncation flag, directionality (in/out/both), multi‑root dedupe.
* Pending: performance benchmarks & temporal validity scenarios (post temporal fields integration).

---

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

### 8A. Semantic Retrieval & Embedding Strategy

Goal: enable hybrid (lexical + vector) relevance over graph objects without forcing every object to carry an embedding eagerly. This supports supplying richer contextual object neighborhoods to AI answers alongside (or instead of) document chunks.

#### A.1 Embedding Storage Model
Add nullable columns to `kb.graph_objects` (head rows only – old/historical or tombstoned versions do not require embeddings):

```sql
ALTER TABLE kb.graph_objects
  ADD COLUMN embedding vector(1536),             -- pgvector column (dimension matches provider model)
  ADD COLUMN fts tsvector,                       -- materialized lexical representation
  ADD COLUMN embedding_error TEXT,               -- last error message (optional)
  ADD COLUMN embedding_retry_after TIMESTAMPTZ;  -- backoff control
```

Indexes (created after a minimum row threshold to avoid expensive build too early):
```sql
-- Lexical
CREATE INDEX IF NOT EXISTS idx_graph_objects_fts
  ON kb.graph_objects USING GIN (fts) WHERE deleted_at IS NULL;

-- Vector (use IVFFLAT after ANALYZE and enough rows; lists tuned per scale)
CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding
  ON kb.graph_objects USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100) WHERE deleted_at IS NULL;
```

#### A.2 Eligibility & Policies
Each object type schema can declare an `embedding_policy` (`required | optional | disabled`) and optional `embedding_relevant_paths` (JSON Pointer array) plus `fts_enabled` (bool, default true).

| Policy | Behavior |
|--------|----------|
| required | Object is not considered for vector retrieval until embedding present (search may still return via lexical unless `allow_unembedded=false`). |
| optional | Best-effort embedding; lexical only fallback if missing. (Default) |
| disabled | Never embed; excluded from vector phase; optional lexical retained if `fts_enabled=true`. |

Schema registry table extension (conceptual):
```sql
ALTER TABLE kb.object_type_schemas
  ADD COLUMN embedding_policy TEXT NOT NULL DEFAULT 'optional',
  ADD COLUMN embedding_relevant_paths TEXT[] DEFAULT NULL,  -- NULL => entire properties blob
  ADD COLUMN fts_enabled BOOLEAN NOT NULL DEFAULT true;
```

#### A.3 Lifecycle & Triggers
Event | Action
------|-------
Create head | Inline compute FTS (`fts = to_tsvector('simple', coalesce(title,'') || ' ' || properties::text)`) if enabled; enqueue async embedding job when policy != disabled.
Patch (new version) | Recompute FTS; enqueue embedding only if (policy != disabled) AND (changed fields intersect `embedding_relevant_paths` OR size delta > threshold). Old head embedding persists (no rewrite) but not used for search after superseded.
Delete (tombstone) | No embedding action; tombstoned head excluded by WHERE predicate.
Restore | Treat as new head – recompute FTS + enqueue embedding.

Embeddings always tied to the *current* (latest non-deleted) version only. Historical rows may retain stale embedding but are not indexed by IVFFLAT scope (optional cleanup job can NULL them out later).

#### A.4 Background Backfill Worker
Periodic job (e.g., every 60s) selects up to N rows where:
```
embedding IS NULL
AND deleted_at IS NULL
AND embedding_policy IN ('required','optional')
AND (embedding_retry_after IS NULL OR now() >= embedding_retry_after)
```
Rate limits via `EMBEDDING_QPS` (default 10). On provider failure sets `embedding_error` and `embedding_retry_after = now() + interval 'power_of_two_minutes'` (exponential backoff up to a max, e.g., 1h).

#### A.5 Query Fusion (High-Level)
1. Build lexical tsquery from user query (`plainto_tsquery` or weighted `to_tsquery` if advanced syntax allowed).
2. If at least one embedding exists (fast EXISTS check) generate query embedding.
3. Retrieve candidate pools:
   * Lexical Top L (`GRAPH_SEARCH_TOP_L`, default 100) using `ts_rank_cd`.
   * Vector Top V (`GRAPH_SEARCH_TOP_V`, default 100) using cosine distance if any embeddings present.
4. Normalize scores:
   * `lex_norm = rank_lex / max_rank_lex` (0 if only one result).
   * `vec_norm = 1 - (distance / max_distance)` (distance ∈ [0,2] for cosine, clamp).
5. Fuse (default weighted sum): `final = w_lex * lex_norm + w_vec * vec_norm` (defaults 0.5/0.5). If only one channel available use that channel score alone.
6. Optional Neighbor Expansion: for each top object, pull up to `GRAPH_SEARCH_NEIGHBOR_LIMIT` relationship heads (filtered) and include neighbor objects (without re-ranking them independently). Apply additive boost: `neighbor_boost = base_final * (GRAPH_SEARCH_NEIGHBOR_WEIGHT / (1 + degree))` accumulating but cap total score at 1.0.

Alternate fusion (configurable later): Reciprocal Rank Fusion (RRF) across lexical & vector rank positions; expose `fusion=rrf` flag.

#### A.6 Handling Unembedded Objects
If an object is in lexical candidates but `embedding IS NULL`, treat vector component as 0 and proceed. If *no* embeddings exist globally (cold start) skip vector phase; return `meta.channels=["lexical"]`.

#### A.7 API Metadata Additions
Search response `meta` (draft):
```json
{
  "channels": ["lexical","vector"],
  "fusion": "weighted_sum:v0",
  "lexical_considered": 100,
  "vector_considered": 100,
  "skipped_unembedded": 12,
  "neighbor_expanded": 47,
  "embedding_model": "text-embedding-3-large",
  "elapsed_ms": 83
}
```

#### A.8 Configuration (Env / DB)
| Key | Default | Purpose |
|-----|---------|---------|
| EMBEDDING_DIM | 1536 | pgvector dimension guard |
| EMBEDDING_PROVIDER | local-fallback | Provider selection |
| EMBEDDING_QPS | 10 | Backfill throughput limit |
| GRAPH_SEARCH_TOP_L | 100 | Lexical candidate pool size |
| GRAPH_SEARCH_TOP_V | 100 | Vector candidate pool size |
| GRAPH_SEARCH_RESULT_LIMIT | 40 | Final response cap |
| GRAPH_SEARCH_NEIGHBOR_LIMIT | 3 | Max neighbors per head object |
| GRAPH_SEARCH_NEIGHBOR_WEIGHT | 0.15 | Boost factor |
| GRAPH_SEARCH_FUSION | weighted_sum | Fusion strategy (`weighted_sum|rrf`) |

#### A.9 Failure Modes
| Failure | Strategy |
|---------|----------|
| Provider timeout | Log, set error & retry_after (exponential backoff) |
| Dimension mismatch | Fail fast at service start (abort boot) |
| Zero embeddings (cold start) | Lexical-only fallback with meta.channels updated |
| High error rate | Circuit breaker: temporarily pause new embedding jobs when failures > threshold over window |

#### A.10 Security & RLS
Embeddings and FTS columns inherit existing RLS on `graph_objects`; no new policy required. Ensure IVFFLAT index predicate matches RLS filters (exclude deleted rows) to avoid accidental leakage.

#### A.11 Backfill Migration Steps
1. Add columns (NULLable) & FTS index.
2. Populate `fts` in batches (e.g., 1000 rows per transaction) for existing heads.
3. Once sufficient rows (e.g., > 5000) analyze & create IVFFLAT index with `lists=100` (tune later).
4. Enable embedding worker feature flag.
5. Monitor coverage: `% objects with embedding` and stale backlog size; scale QPS if backlog > target.

#### A.12 KPIs
| Metric | Target |
|--------|--------|
| Required object embedding coverage | ≥ 99% |
| Median embedding staleness | < 2 min |
| Cold start fallback correctness | 100% (no 500s) |
| Fusion uplift (MRR vs lexical-only) | +≥10% after labeled eval set |

#### A.13 Justification for Selective Embeddings
Storing embeddings only for meaningful or high-value object types reduces storage and external model bill. Lexical-only objects still contribute contextual lexical recall and can become embedding candidates later if access frequency or importance grows (promote by updating schema policy to `optional` or `required`).

> NOTE: Full AI context assembly can merge these object results with existing document chunk search via RRF or weighted blending. That fusion happens at the application layer; this section scopes *object-space* retrieval.

---

#### 8A Addendum: Indexing & Embedding Pipeline (Detailed)

This addendum specifies the concrete operational model for generating and maintaining FTS (`fts`) and `embedding` columns, including queue schema, triggers, worker leasing, backoff strategies, metrics, and rollout safeguards.

##### 8A.D1 Components Overview
| Component | Responsibility | Tech |
|-----------|---------------|------|
| FTS Inline Builder | Populate / update `fts` tsvector at write time | SQL function + BEFORE/AFTER trigger |
| Embedding Enqueue Trigger | Creates or updates job rows when head object needs (re)embedding | AFTER INSERT/UPDATE trigger |
| Embedding Job Queue Table | Durable pending work & retry metadata | `kb.embedding_jobs` |
| Embedding Worker | Batch fetches jobs, calls provider, updates objects, records metrics | Nest cron / separate worker process |
| Circuit Breaker | Pauses new job leasing under sustained failure | In-memory + DB flag |
| Coverage Monitor | Tracks % of objects with embeddings by policy & staleness | Periodic SQL + metrics emit |

##### 8A.D2 Schema Additions
```sql
CREATE TABLE kb.embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL,
  policy TEXT NOT NULL,                -- 'required' | 'optional'
  attempt INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (object_id)                   -- 1 row per object head
);

-- Optional: secondary index for ready jobs
CREATE INDEX idx_embedding_jobs_ready ON kb.embedding_jobs (next_attempt_after NULLS FIRST, attempt) WHERE next_attempt_after IS NULL OR next_attempt_after <= now();
```

Rationale: Using a dedicated table (vs NOTIFY/listen) provides durable backlog visibility, supports retries, and allows ad-hoc analytics.

##### 8A.D3 Head Change Trigger Logic
Pseudo (plpgsql or application layer on successful commit):
```
IF NEW.deleted_at IS NOT NULL THEN
  -- Do NOT enqueue (tombstoned).
  RETURN;
END IF;

policy := lookup_policy(NEW.type);  -- join object_type_schemas
IF policy = 'disabled' THEN RETURN; END IF;

IF embedding still current AND NOT significant_change(OLD, NEW) THEN
  RETURN; -- Skip enqueue to reduce churn
END IF;

INSERT INTO kb.embedding_jobs(object_id, tenant_id, project_id, policy)
  VALUES (NEW.id, NEW.tenant_id, NEW.project_id, policy)
  ON CONFLICT (object_id) DO UPDATE SET attempt = 0, last_error = NULL, next_attempt_after = NULL, updated_at = now();
```

`significant_change` criteria:
1. Any field in `embedding_relevant_paths` changed (diff intersection).
2. Title changed OR labels changed.
3. Properties size delta > `EMBED_SIGNIFICANT_SIZE_DELTA_BYTES` (default 256 bytes).

##### 8A.D4 Worker Leasing Algorithm
```
function lease(batchSize):
  now = current_timestamp
  SELECT id, object_id, policy FROM kb.embedding_jobs
  WHERE (next_attempt_after IS NULL OR next_attempt_after <= now)
  ORDER BY policy DESC, attempt ASC, id ASC
  LIMIT batchSize FOR UPDATE SKIP LOCKED;
  -- Mark as in-progress (optional: add lease_until column if multi-step)
  return rows

function process(job):
  row = SELECT * FROM kb.graph_objects WHERE id = job.object_id AND deleted_at IS NULL;
  IF NOT FOUND: DELETE FROM kb.embedding_jobs WHERE id=job.id; return;
  content = build_embedding_input(row, embedding_relevant_paths(row.type));
  vector = provider.embed(content);
  UPDATE kb.graph_objects SET embedding = vector WHERE id = row.id;
  DELETE FROM kb.embedding_jobs WHERE id = job.id;
  metrics.increment('embedding.success');
catch (err):
  backoff = compute_backoff(job.attempt); -- e.g. min( 2^(attempt) * base, maxBackoff )
  UPDATE kb.embedding_jobs
    SET attempt = attempt + 1,
        last_error = truncate(err.message, 500),
        next_attempt_after = now + backoff,
        updated_at = now
    WHERE id = job.id;
  metrics.increment('embedding.failure');
```

Backoff sequence (minutes) default: 0.5, 2, 5, 15, 30, 60 (cap). After cap, attempts continue every 60 min.

##### 8A.D5 Circuit Breaker
Sample policy: if failure rate (rolling 5 min) > 40% AND total attempts ≥ 30 → set `EMBEDDING_BREAKER_OPEN=true` (in-memory + optionally persist in `kb.system_flags`). While open, worker only logs “breaker-open” and sleeps; every `BREAKER_HALF_OPEN_INTERVAL` (default 2 min) tries a small probe batch (≤3 jobs). Success resets breaker.

##### 8A.D6 Metrics & Telemetry
Metric | Type | Tags
|------|------|-----|
| embedding.jobs.pending | Gauge | tenant, project, policy |
| embedding.jobs.attempt | Counter | attempt_number |
| embedding.duration.ms | Histogram | model, policy |
| embedding.failure.rate | Gauge (calc) | policy |
| embedding.coverage.pct | Gauge | policy |
| embedding.staleness.seconds | Histogram | policy |
| fts.update.ms | Histogram | n_chars_bucket |

Computed coverage query (head rows only):
```sql
SELECT policy,
  100.0 * SUM( (embedding IS NOT NULL)::int ) / COUNT(*) AS pct
FROM (
  SELECT o.id, s.embedding_policy AS policy, o.embedding
  FROM kb.graph_objects o
  JOIN kb.object_type_schemas s ON s.type = o.type AND s.tenant_id IS NULL -- head schema
  WHERE o.deleted_at IS NULL
) t
GROUP BY policy;
```

Staleness (if we track `embedding_updated_at` – add column if missing):
```sql
SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY age(now(), embedding_updated_at)) AS p50,
       percentile_disc(0.9) WITHIN GROUP (ORDER BY age(now(), embedding_updated_at)) AS p90
FROM kb.graph_objects WHERE embedding IS NOT NULL;
```

##### 8A.D7 Provider Abstraction
Interface (TypeScript sketch):
```ts
interface EmbeddingProvider {
  model(): string;
  embedBatch(payloads: string[]): Promise<number[][]>; // returns array of vectors
  maxBatchSize(): number; // e.g. 32
}
```
Batching strategy: group leased jobs by policy priority then slice into provider `maxBatchSize` sub-batches.

##### 8A.D8 Input Construction & Truncation
`build_embedding_input` steps:
1. Collect paths in `embedding_relevant_paths` else fallback (title + first N salient property values).
2. Concatenate with delimiters:
```
TITLE: <title>\nTYPE: <type>\nFIELD:<path>=<value>\n...
```
3. Token limit guard: if estimated tokens > `EMBED_INPUT_MAX_TOKENS` (default 800) drop lowest-salience fields until within limit.

##### 8A.D9 Idempotency & Concurrency
Multiple workers can run concurrently – `FOR UPDATE SKIP LOCKED` ensures each job is processed once. If embedding update races with a new version creation (new head), the new version trigger re-enqueues anyway; old embedding is acceptable transiently.

##### 8A.D10 Cleanup & Reconciliation
Nightly job:
1. Remove orphan jobs referencing deleted objects.
2. Re-enqueue required-policy objects missing embeddings & not present in queue.
3. Optionally NULL out embeddings for tombstoned objects older than retention threshold (e.g., 30 days) to reclaim disk.

##### 8A.D11 Failure Scenarios
Scenario | Handling
|--------|---------|
| Provider 429 / rate limit | Backoff; optionally jitter backoff by ±20% |
| Transient network error | Retry (counts as failure) |
| Model dimension mismatch | Abort boot (fatal) |
| Payload too large | Truncate input aggressively; log warning |
| High sustained backlog | Emit alert if `pending_required > BACKLOG_ALERT_THRESHOLD` (e.g., 500) |
| FTS trigger slowdown | Monitor `fts.update.ms`; if p95 > threshold (e.g., 30ms) consider async FTS refresh strategy |

##### 8A.D12 Feature Flags & Rollout
Flag | Purpose
|-----|--------|
| `embedding.queue.enabled` | Enables trigger enqueue writes |
| `embedding.worker.enabled` | Starts worker lease loop |
| `embedding.provider.primary` | Select provider alias (openai, local, mock) |
| `embedding.coverage.enforce` | If true, required-policy object read path can 503 when coverage < MIN_REQUIRED_COVERAGE (optional) |

Rollout Steps:
1. Deploy schema + triggers with `embedding.queue.enabled=false` (dry run: manual enqueue script).
2. Turn on queue, keep worker disabled – verify job accumulation & diff-based suppression works.
3. Enable worker for optional objects only (filter query policy='optional').
4. After backlog < target threshold (e.g., < 2 * maxBatchSize), enable required objects.
5. Set IVF index creation (if not present) once `embedding` coverage passes MIN_ROWS_FOR_IVF (e.g., 10K) & ANALYZE.
6. Monitor KPIs; open breaker on elevated failure; rollback by disabling worker.

##### 8A.D13 Configuration Keys (Extended)
| Key | Default | Description |
|-----|---------|-------------|
| EMBED_BATCH_SIZE | 16 | Requested lease size per cycle |
| EMBED_POLL_INTERVAL_MS | 1000 | Worker sleep between lease cycles |
| EMBED_INPUT_MAX_TOKENS | 800 | Max tokens before truncating inputs |
| EMBED_SIGNIFICANT_SIZE_DELTA_BYTES | 256 | Size delta threshold for change significance |
| EMBED_BACKLOG_ALERT_THRESHOLD | 500 | Alert threshold for required-policy backlog |
| EMBED_FAILURE_RATE_BREAKER | 0.4 | Failure rate threshold to open breaker |
| EMBED_BREAKER_MIN_ATTEMPTS | 30 | Minimum attempts before evaluating breaker |
| EMBED_BREAKER_HALF_OPEN_INTERVAL_MS | 120000 | Probe interval while open |
| EMBED_STALENESS_TARGET_MINUTES | 5 | p50 staleness target |

##### 8A.D14 Acceptance Tests (Pipeline)
ID | Description | Type
|---|------------|-----|
| AT-EMB-1 | Creating required-policy object enqueues job | IT |
| AT-EMB-2 | Non-significant patch does not enqueue new job | IT |
| AT-EMB-3 | Worker processes batch and removes jobs | IT |
| AT-EMB-4 | Failure sets backoff & increments attempt | UT/IT |
| AT-EMB-5 | Circuit breaker opens on high failure rate | UT |
| AT-EMB-6 | Nightly reconciliation re-enqueues missing required embeddings | IT |
| AT-EMB-7 | Token truncation kicks in for large object properties | UT |
| AT-EMB-8 | Coverage metric query returns ≥ expected % after backfill | IT |

##### 8A.D15 Observability Dashboards
Panels:
- Backlog trend (required vs optional)
- Success vs failure rate stacked area
- Staleness distribution (p50/p90)
- Embedding duration histogram
- Breaker state timeline
- Coverage gauge per policy

##### 8A.D16 Security & Privacy
- Ensure embedding input builder redacts fields matching configured patterns (e.g., `/apiKey|secret|token/i`).
- Add `kb.embedding_redaction_patterns` table (regex list) loaded at worker start; redact matches with `[REDACTED]` and record redaction count for auditing.
- Audit log entry for each redaction event (aggregate daily summary to avoid noise).

##### 8A.D17 Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Queue bloat due to repeated rapid edits | Debounce logic: suppress enqueue if last enqueue < MIN_REEMBED_INTERVAL (e.g., 30s) unless policy='required' AND semantic diff high |
| Provider cost spike | Dynamic scaling: reduce EMBED_BATCH_SIZE or restrict to required only when daily spend near threshold |
| Stale objects due to frequent small changes | Aggressive diff path filter; accept transient staleness (FTS still updated inline) |
| Lock contention on embedding_jobs | Keep rows small; add covering index; consider sharding queue by hash if > 1M pending |

---

### 8B. Adaptive Multi-Stage Retrieval & Context Assembly (Recommended Method)

This section formalizes the improved retrieval & context delivery approach (multi-channel candidate pools, normalization, path summaries, salience pruning, explanation metadata, token budgeting) that supersedes a naive single-pass hybrid fusion. It focuses on surfacing **high-signal, token‑efficient, explainable** object context for downstream AI consumption.

#### 8B.1 Objectives
| Objective | Description | KPI |
|-----------|-------------|-----|
| Precision | Reduce generic/high-degree noise and prioritize semantically + structurally pertinent objects | +≥10% NDCG@20 vs 8A baseline |
| Token Efficiency | Cut average raw object token payload passed to LLM | −40–70% median tokens/query |
| Explainability | Provide per-item reason breakdown for audit/tuning | 100% items have ≥1 reason |
| Determinism | Stable ordering under identical inputs (within tolerance) | Score variance < 1e-6 (float rounding excluded) |
| Adaptability | Intent-aware weighting templates impact ordering | Template A/B uplift measurable |

#### 8B.2 Retrieval Pipeline (Phase 1–3)
Stage | Phase | Action | Notes
------|-------|--------|------
1 | P1 | Intent detection (simple rule / keyword) | Output `intent` (nullable) used later once classifier matures
2 | P1 | Build candidate pools: lexical (L) & vector (V) | Use existing 8A candidate logic
3 | P1 | Score normalization per channel | z-score (or min-max fallback if <5 docs)
4 | P1 | Weighted fusion (configurable) | `final_v1 = w_lex * L' + w_vec * V'`
5 | P1 | Degree & type filtering for expansion | Relationship-type allowlist + degree cap (default 200)
6 | P2 | Path extraction + summarization | Generate 1–2 line natural-language summaries for top K paths
7 | P2 | Salience-based field pruning | TF-IDF heuristic over field names + value length; keep top N (per object type)
8 | P3 | Marginal concept gain allocator | Stop adding objects when incremental concept coverage < threshold
9 | P3 | Intent template weighting | Different weight sets & neighbor treatment per intent
10 | P3+ | Session working set integration | Avoid repeat full dumps; references instead

#### 8B.3 Channel Score Normalization
For each channel C in {lexical, vector, structural(optional)} with raw scores S = {s₁..sₙ}:
```
if n >= 5:
  mean = avg(S)
  std  = stddev_pop(S)
  norm_i = clamp( (s_i - mean) / (std + 1e-9), -4, +4 )
  # Shift & scale to [0,1]
  norm_i = (norm_i + 4) / 8
else:
  # Fallback min-max
  minS = min(S); maxS = max(S)
  denom = (maxS - minS) or 1
  norm_i = (s_i - minS)/denom
```
Maintain per-channel distribution diagnostics in `meta.debug.normalization` (debug mode only) for tuning.

#### 8B.4 Fusion Strategies
Configurable via `GRAPH_SEARCH_FUSION_STRATEGY`:
1. `weighted_sum:v2` (default):
```
final = Σ (w_channel * norm_channel)
```
2. `rrf:k` Reciprocal Rank Fusion:
```
final = Σ (1 / (k + rank_channel_i))
```
3. Future: learned linear model (offline-trained) — deferred; requires feature logging.

Weights may be *intent template* dependent (see 8B.9).

#### 8B.5 Neighbor & Path Summaries
Instead of embedding full neighbor objects directly, we build **path summaries**:
Format:
```
{"path_id":"<uuid>",
 "summary":"Meeting 'Sprint 34 Review' (2025-09-12) decided Decision 'Adopt Feature Flagging'",
 "nodes":[{"id":"m1","type":"Meeting"},{"id":"d1","type":"Decision"}],
 "relationships":[{"type":"decides","id":"r1"}],
 "reasons":[{"channel":"primary_neighbor","score":0.15}]}
```
Generation algorithm (P2): enumerate top M primary objects (post-fusion), collect up to N relationship hops (depth=1 by default) respecting relationship-type whitelist & degree cap. For each edge produce summary template using canonical node titles; if second hop retained (optional future), chain templates.

#### 8B.6 Salience-Based Field Pruning
Per object type maintain (cached) field salience = `tfidf(field_name)` + usage frequency weighting. Keep:
```
retain_fields = (explicitly requested via include[]) ∪ topK(salience) ∪ mandatory_core(title,type,status)
```
K default = 6. Large text fields truncated to `FIELD_TOKEN_MAX` (e.g., 128 tokens) with hash suffix for integrity.

#### 8B.7 Marginal Concept Gain (Phase 3)
Maintain a set of covered normalized terms & embedding cluster ids. Before adding candidate i (sorted by preliminary final score):
```
new_terms = terms(object_i) - covered_terms
gain = token_weighted(new_terms) / est_tokens(object_i)
if gain < MARGINAL_GAIN_MIN (default 0.02) -> skip unless safety floor (#objects < MIN_RESULTS)
else accept and update covered_terms
```

#### 8B.8 Session Working Set (Deferred)
Maintain per-session cache of `context_object_ids`. If candidate object already delivered in previous response within window (e.g., last 10 mins), send abbreviated form:
```
{"id": "...", "title": "...", "ref": true}
```
Reduces repeated token use; full object can be “pinned” by client request.

#### 8B.9 Intent Templates (Phase 3)
Intent → weight vector example:
| Intent | w_lex | w_vec | neighbor_weight | recency_decay | notes |
|--------|-------|-------|-----------------|---------------|-------|
| explain | 0.4 | 0.5 | 0.1 | low | Prioritize semantic coverage |
| locate_config | 0.7 | 0.3 | 0.0 | medium | Config keys lexical heavy |
| debug_error | 0.5 | 0.3 | 0.2 | high | Recent changes matter |
| roadmap | 0.3 | 0.5 | 0.2 | low | Broader semantic + structural |

Recency decay formula (if enabled):
```
decay = exp(- max(0, now - updated_at) / RECENCY_HALF_LIFE )
final = final * (λ * decay + (1-λ))    # λ intent-specific (0..0.4)
```

#### 8B.10 Expanded `/graph/search` Response Schema (Draft)
```jsonc
{
  "query": "text",
  "intent": "explain|locate_config|debug_error|null",
  "items": [
    {
      "object_id": "<uuid>",
      "score": 0.87,
      "role": "primary|neighbor|reference",
      "fields": {"title":"...","type":"Decision","status":"active","summary":"..."},
      "reasons": [
        {"channel":"lexical","score":0.53},
        {"channel":"vector","score":0.29},
        {"channel":"neighbor_boost","score":0.05}
      ],
      "truncated_fields": ["description"],
      "explanation": "High lexical match on 'feature flagging'; semantic similarity 0.78; boosted by related Meeting"
    }
  ],
  "path_summaries": [ {"path_id":"...","summary":"...","reasons":[{"channel":"primary_neighbor","score":0.12}] } ],
  "meta": {
    "channels": ["lexical","vector"],
    "fusion": "weighted_sum:v2",
    "lexical_considered": 100,
    "vector_considered": 100,
    "skipped_unembedded": 12,
    "neighbor_expanded": 47,
    "normalization": {"lexical": {"mean":0.42,"std":0.11}, "vector": {"mean":0.31,"std":0.07}},
    "token_estimate": 1450,
    "truncation_notice": false,
    "elapsed_ms": 92
  },
  "debug": {"gain_rejections": 5, "marginal_gain_min": 0.02}
}
```
`debug` object only returned if `?debug=true` and user has appropriate scope.

#### 8B.11 Token Budget Allocation
Budget B (default 3500 tokens) subdivided:
| Segment | % | Contents |
|---------|---|----------|
| Anchors | 20 | Top primary objects (full pruned fields) |
| Path Summaries | 15 | Compressed relationship context |
| Supporting Objects | 40 | Additional primaries passing marginal gain filter |
| References | 10 | Abbreviated previously seen objects |
| Meta / Safety | 15 | System instructions, disclaimers, reserved headroom |

Assembler stops adding segments when cumulative estimated tokens ≥ 0.9 * B (reserve 10% overflow). Overflow triggers `meta.truncation_notice=true`.

#### 8B.12 Configuration Keys (Additions / Overrides to 8A)
| Key | Default | Purpose |
|-----|---------|---------|
| GRAPH_SEARCH_FUSION_STRATEGY | weighted_sum:v2 | Strategy (adds v2 variant w/ z-score) |
| GRAPH_SEARCH_DEGREE_CAP | 200 | Max neighbor degree considered per candidate |
| GRAPH_SEARCH_PATH_SUMMARY_LIMIT | 25 | Max path summaries returned |
| GRAPH_SEARCH_FIELD_SALIENCE_TOP_K | 6 | Fields retained per object |
| GRAPH_SEARCH_MARGINAL_GAIN_MIN | 0.02 | Threshold for marginal concept gain |
| GRAPH_SEARCH_TOKEN_BUDGET | 3500 | Assembly token budget |
| GRAPH_SEARCH_INTENT_ENABLED | true | Toggle intent weighting |

#### 8B.13 Rollout Phases
Phase | Flag | Success Metric | Rollback Trigger
------|------|---------------|-----------------
P1 Normalization + Explanations | `retrieval.v2.norm` | Score variance reduced; stable latency | Latency +>15% baseline
P2 Path Summaries + Salience | `retrieval.v2.paths` | Token reduction ≥40% | Precision drop >5% NDCG
P3 Marginal Gain + Intent | `retrieval.v2.intent` | +≥5% NDCG atop P2 | Classifier precision <70%
P4 Session Working Set | `retrieval.v2.session` | Repeated token volume −30% | Session cache memory > threshold

#### 8B.14 Testing & Evaluation
Test Type | Focus |
|---------|-------|
| UT | Normalization math, marginal gain pruning determinism |
| IT | End-to-end `/graph/search` response schema completeness, path summary correctness |
| PERF | Latency impact of normalization + summarization vs baseline |
| EVAL | Offline labeled query set (≥30 queries) measuring NDCG@20 / MRR |
| REGRESSION | Channel distribution drift detection (if stddev < epsilon for many queries, check scoring bug) |

#### 8B.15 Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Over-pruning removes critical but low-frequency term object | Floor: always keep first N (e.g., 5) primaries regardless of gain |
| Path summary templating errors introduce hallucination risk | Include object ids & disclaimers; keep summaries factual & pattern-bound |
| Intent misclassification degrades ranking | Allow `intent=override` param for clients; track classifier confidence |
| Score drift after adding new channel | Recalibrate weights via eval harness before enabling channel in prod |

#### 8B.16 Future Enhancements (Beyond Scope of Initial Phases)
- Multi-field embeddings (title/body/tags) with per-field channel weights.
- Structural embedding (node2vec/GraphSAGE) as additional channel.
- Learning-to-rank model trained on click / selection feedback.
- Feedback loop: refine request specifying dissatisfaction reason tokens.
- Automatic anchor pinning based on conversation memory (LLM tool invocation).
- Path diversity optimization (maximize relationship-type coverage across summaries).

#### 8B.17 Acceptance Criteria (Section 8B Initial Delivery)
- AC-8B-1: `/graph/search` returns `items[].reasons` with ≥1 reason each when debug off (scores but not distribution). (IT)
- AC-8B-2: With `debug=true`, normalization stats present and sums of `reasons[].score` ≥ primary score - ε. (IT)
- AC-8B-3: Path summary mode reduces token estimate ≥40% vs baseline neighbor full object mode on sample set. (PERF)
- AC-8B-4: No query shows increase in p95 latency >25% after enabling normalization alone. (PERF)
- AC-8B-5: Labeled eval set shows +≥10% NDCG@20 vs baseline after P2.

---

### 8C. Graph Expansion Logic (Neighbor Inclusion & Edge Weighting)

This section specifies deterministic, resource-safe expansion of related objects ("neighbors") used by both:
1. Core `/graph/expand` API (general traversal)
2. Retrieval enrichment (Sections 8A / 8B: neighbor boosts, path summaries)

Goals:
- Predictable latency & bounded cardinality.
- High semantic utility: prefer informative, recent, strongly-typed relations over generic or hub noise.
- Explainability: every included neighbor & path summary carries structured reasons with edge-level contributions.
- Determinism under identical inputs.

#### 8C.1 Edge Classification & Base Weights
Define a registry table (conceptual – can be merged into `relationship_type_schemas` or separate) capturing ranking metadata:
```sql
CREATE TABLE kb.relationship_type_ranking_rules (
  type TEXT PRIMARY KEY REFERENCES kb.relationship_type_schemas(type),
  base_weight REAL NOT NULL DEFAULT 1.0,              -- Prior importance
  allow_neighbor BOOLEAN NOT NULL DEFAULT true,       -- If false, excluded from retrieval expansions
  max_depth_allowed INT NOT NULL DEFAULT 2,           -- Hard cap per relation type
  reciprocal_boost BOOLEAN NOT NULL DEFAULT false,    -- If true, boost when traversing reverse direction
  description TEXT
);
```
Recommended starter weights (tune via eval set):
| Relation Type | Rationale | base_weight |
|---------------|-----------|-------------|
| decides / satisfy / verify | Direct decision or fulfillment linkage | 1.6 |
| trace_to / refine | Hierarchical / traceability context | 1.3 |
| implement / realize | Execution linkage | 1.2 |
| depend_on | Architecture dependency | 1.0 |
| relate_to / custom:* (default) | Generic association (often low signal) | 0.6 |

#### 8C.2 Dynamic Edge Weight Formula
For a candidate edge e (src→dst) considered at expansion depth d (root depth = 0):
```
type_factor      = base_weight(rule.type)
confidence_factor= clamp(weight_column_if_present OR 1.0, 0.25, 2.0)
recency_factor   = exp( - max(0, now - coalesce(e.valid_from, e.created_at)) / EDGE_RECENCY_HALF_LIFE )
direction_factor = ( rule.reciprocal_boost AND traversed_reverse ? 1.15 : 1.0 )
depth_penalty    = 1 / (1 + d)            # depth=1 => 0.5, depth=2 => 0.33
hub_damping      = 1 / (1 + log1p(degree(src)) + log1p(degree(dst)))

raw_edge_score = type_factor * confidence_factor * recency_factor * direction_factor
edge_score     = raw_edge_score * depth_penalty * hub_damping
edge_score_normalized = edge_score / (edge_score + 1)   # squashes to (0,1)
```
Use cached degree estimates if available (fanout stats); otherwise compute lightweight counts with cap (early exit > DEGREE_SAMPLE_CAP).

#### 8C.3 Node Accumulation & Neighbor Score Contribution
When an edge qualifies, the neighbor object receives an additive reason:
```
neighbor_increment = head_object_final_score * EDGE_NEIGHBOR_WEIGHT * edge_score_normalized
```
Where `EDGE_NEIGHBOR_WEIGHT` comes from intent template (8B.9) or global default (`GRAPH_SEARCH_NEIGHBOR_WEIGHT`). Multiple edges from different primaries aggregate (sum) but final neighbor boost is capped at `NEIGHBOR_MAX_TOTAL_BOOST` (default 0.35 of primary's base score to avoid overshadowing primaries).

#### 8C.4 Expansion Selection Algorithm (Depth ≤ 2 for Retrieval)
Inputs:
- `primary_ids[]`
- `relationship_type_allowlist[]` (nullable -> use ranking table where `allow_neighbor=true`)
- `node_type_blocklist[]`
- `per_primary_neighbor_limit` (default 3 – retrieval), `global_neighbor_limit` (default 50), `max_depth` (default 1 retrieval, 2 API)

Algorithm (retrieval mode pseudocode):
```
for each primary in primary_ids (ordered by final retrieval score):
  fetched=0
  edges = select edges where primary is src OR dst
          and rel.type in allowlist
          and rel.created_at >= now() - EDGE_MAX_AGE
          order by (computed edge_score) desc
  for edge in edges:
     if fetched >= per_primary_neighbor_limit: break
     neighbor_id = other endpoint
     if neighbor.type in node_type_blocklist: continue
     if depth(edge) > max_depth_for_relation(edge.type): continue
     if isHighDegreePrimary(primary) AND sampledOut(edge): continue   # degree sampling
     apply neighbor_increment (Section 8C.3)
     record reason: {channel:"neighbor_edge", relation:edge.type, edge_score, contribution}
     fetched++
     if total_neighbors() >= global_neighbor_limit: goto END
END
```
High-degree sampling (when degree(primary) > DEGREE_HUB_THRESHOLD, e.g., 500):
1. Partition edges by relation type.
2. For each type keep top N = ceil( per_primary_neighbor_limit * TYPE_STRATIFIED_MULTIPLIER / distinct_types ) sorted by edge_score.
3. Record `meta.hub_sampled=true` and `meta.hub_degree=degree` in debug output.

#### 8C.5 Equivalence & De-duplication
If multiple primaries point to same neighbor via different edges:
- Aggregate contributions (sum, still cap by `NEIGHBOR_MAX_TOTAL_BOOST`).
- Keep highest individual edge_score for `reasons[].edge_score_max`.
- Maintain `reasons[].sources[]` listing contributing primary ids & relation types.

#### 8C.6 Depth >1 (General Expand API)
For `/graph/expand` (non-retrieval):
- Support BFS layering with early-stop when node count would exceed `limitNodes`.
- Maintain visited set per canonical_id to avoid cycles.
- Option `distinctNodes=true` prevents revisiting even if different relation types appear; if false, can attach multiple edges referencing same pair (client may want full edge list).
- Provide `meta.truncated=true` when depth or node limits reached.

#### 8C.7 Configuration Keys (Additions)
| Key | Default | Purpose |
|-----|---------|---------|
| GRAPH_EXPANSION_MAX_DEPTH | 2 | Hard upper bound for retrieval neighbor depth |
| GRAPH_EXPANSION_API_MAX_DEPTH | 6 | Absolute limit for `/graph/expand` |
| GRAPH_EXPANSION_PER_PRIMARY_LIMIT | 3 | Neighbor cap per primary (retrieval) |
| GRAPH_EXPANSION_GLOBAL_LIMIT | 50 | Total neighbor cap (retrieval) |
| GRAPH_EXPANSION_HUB_DEGREE_THRESHOLD | 500 | Degree above which sampling triggers |
| GRAPH_EXPANSION_DEGREE_SAMPLE_CAP | 2000 | Early-exit count when computing degree |
| GRAPH_EXPANSION_TYPE_STRATIFIED_MULT | 1.4 | Multiplier distributing slots across relation types |
| GRAPH_EXPANSION_NEIGHBOR_MAX_TOTAL_BOOST | 0.35 | Cap on aggregated neighbor boost relative to primary score |
| GRAPH_EXPANSION_EDGE_RECENCY_HALF_LIFE | 30d | Half-life parameter for recency_factor |
| GRAPH_EXPANSION_EDGE_MAX_AGE | 365d | Ignore edges older than this (unless explicitly requested) |

#### 8C.8 Metrics
| Metric | Type | Tags |
|--------|------|------|
| expansion.neighbors.count | Histogram | intent, depth |
| expansion.hub.sampled | Counter | relation_type |
| expansion.edge.score.mean | Gauge | relation_type |
| expansion.edge.recency.distribution | Histogram | relation_type |
| expansion.truncated | Counter | reason=global_limit|per_primary|depth |
| expansion.boost.total | Histogram | intent |
| expansion.duplicate.neighbor_collapsed | Counter |  |

#### 8C.9 Debug Metadata Additions
When `debug=true` include:
```jsonc
{
  "expansion": {
    "neighbors": 42,
    "truncated": false,
    "hub_sampled": true,
    "hub_degree": 1342,
    "duplicate_neighbors_collapsed": 5
  }
}
```

#### 8C.10 Acceptance Tests (Expansion Logic)
| ID | Description | Type |
|----|-------------|------|
| AT-EXP-1 | Per-primary neighbor limit respected (no primary returns > configured) | IT |
| AT-EXP-2 | Global neighbor cap triggers `meta.truncated` and stops further expansion | IT |
| AT-EXP-3 | High-degree node triggers sampling (`hub_sampled=true`) | UT/IT |
| AT-EXP-4 | Edge score ordering: higher base_weight relation outranks lower weight given equal other factors | UT |
| AT-EXP-5 | Recency half-life reduces score for stale edges (older edge < fresh edge) | UT |
| AT-EXP-6 | Duplicate neighbor via multiple primaries collapsed with aggregated reasons | IT |
| AT-EXP-7 | Depth constraint excludes edges beyond `max_depth_allowed` for that relation type | UT |
| AT-EXP-8 | Neighbor boost capped at `NEIGHBOR_MAX_TOTAL_BOOST` | UT |

#### 8C.11 Future Enhancements
- Adaptive per-relation degree caps based on historical utility (eval feedback loop).
- Edge embedding channel (structural embedding) feeding into edge_score.
- Learned edge scoring model (features: type, recency, degree metrics, object semantic similarity).
- Partial path diversity optimization: ensure selected edges cover ≥ M distinct relation types.

#### 8C.12 Rationale & Trade-offs
- **Hub Damping** curbs explosion and semantic dilution from large generic linking nodes.
- **Stratified Sampling** preserves relation type diversity vs naive top-N by raw score (which might bias toward a single high-frequency type).
- **Normalized Squash** (edge_score/(edge_score+1)) stabilizes contribution scaling, preventing extreme boosts from outlier confidence weights.
- Choosing depth=1 for retrieval keeps latency predictable; deeper paths are represented via *path summaries* (8B.5) rather than raw object flood.

#### 8C.13 Interplay With Path Summaries
Path summary generation operates on the same ordered edge list post-filtering. Summaries keep top `GRAPH_SEARCH_PATH_SUMMARY_LIMIT` distinct (primary, relation, neighbor) triples by `edge_score_normalized`. If a neighbor is skipped by marginal gain (8B.7), its path summary may still appear flagged with `role="summary_only"` but without adding object tokens.

---

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
- [x] Create tables & base indexes. *(Done – `graph_objects`, `graph_relationships` plus schema tables `object_type_schemas`, `relationship_type_schemas`; head uniqueness & canonical version indexes added (`idx_graph_objects_head_identity`, `idx_graph_relationships_head_identity`, canonical + version DESC for fast head selection). Legacy table renaming/unification deferred.)*
- [x] Implement object CRUD with schema validation (schema optional initially; if absent, accept properties as-is). *(Done – create & patch paths invoke schema registry validators; if no schema registered for a type, properties are accepted. Unit tests cover required property enforcement.)*
- [x] Implement relationship CRUD with multiplicity constraints (app-layer first). *(Done – relationship create/patch + uniqueness via advisory lock; multiplicity beyond uniqueness not yet enforced.)*
- [~] Implement `/graph/expand` single-pass recursion. *(Deferred – minimal `/graph/traverse` endpoint delivered instead; richer expand API pending.)*
- [x] Enforce depth & node limits. *(Done – traversal DTO validators + runtime truncation logic.)*
- [ ] Add telemetry logging. *(Not started – no structured traversal metrics emitted yet beyond test assertions.)*
- [ ] Backfill existing `Entity/Relation` into new tables (script). *(Not started.)*
- [x] Documentation & OpenAPI additions. *(Done – spec section 7.0 added; endpoint in OpenAPI.)*
- [ ] Benchmarks (seed synthetic graph, measure depth 1–3 latencies, capture baseline). *(Not started.)*

### 20.1 Current Implementation Status (2025-09-25)
| Capability | Status | Notes |
|------------|--------|-------|
| Versioned object storage | Partial | Implemented via `graph_objects` with per-version rows; unified naming refactor deferred. |
| Relationship storage & CRUD | Complete | Create/patch/delete with versioning semantics, schema validation, head selection pattern (advanced multiplicity deferred). |
| Schema registry & validator caching | Complete | `object_type_schemas` / `relationship_type_schemas` tables; AJV compilation & in-memory cache of head schema per (project_id, type). |
| Object JSON Schema validation | Complete | Validators enforced on create/patch; unit tests (positive + missing required property) passing. |
| Relationship multiplicity (beyond uniqueness) | Not started | Only uniqueness (type, src, dst) enforced logically; multiplicity rules table absent. |
| Traversal API | Minimal | `/graph/traverse` (BFS, filters, direction, multi-root, limits) implemented; `/graph/expand` richer features pending. |
| Depth / node / edge safety caps | Complete | DTO validation + runtime truncation flag. |
| Telemetry & metrics | Not started | No emitted execution timing or cardinality metrics yet. |
| Backfill script | Not started | Migration from legacy entities not executed. |
| Benchmarks | Not started | No synthetic performance baselines captured. |
| Documentation | Complete | Spec updated; CHANGELOG entry added. |
| OpenAPI exposure | Complete | Traverse endpoint documented and returning 200. |

Legend: [x] = complete, [~] = partial/in progress, [ ] = not started.

## 21. Summary
This design keeps us in Postgres for the near to mid-term, maximizing operational simplicity and leveraging existing multi-tenancy + RLS patterns. We introduce a schema registry for dynamic validation, a controlled expansion API with resource guards, and a path to scale (indexes, closure tables, eventual partitioning). Future adoption of Apache AGE or an external graph is gated by explicit performance and capability triggers, preventing premature complexity.

## 22. Template Packs (Built‑In Schema Collections)
We will ship curated **Template Packs** – signed, versioned collections of object type schemas, relationship type schemas, and optional derived views/materialized projections. A pack accelerates onboarding for a methodology or framework while allowing tenant overrides.

### 22.1 Template Pack Anatomy
```json
{
  "name": "togaf-core",
  "version": "1.0.0",
  "description": "Baseline TOGAF architecture artifact object & relationship definitions",
  "objectTypes": [ { "type": "Capability", "schemaVersion": 1, "jsonSchema": { ... } }, ... ],
  "relationshipTypes": [ { "type": "trace_to", "allowed_src_types": ["Requirement"], "allowed_dst_types": ["Goal","Objective"], "multiplicity": {"src": "many","dst": "many"}}, ... ],
  "views": [ { "name": "capability_map", "sql": "CREATE MATERIALIZED VIEW ..." } ],
  "tags": { "domain": "architecture", "framework": "TOGAF" },
  "signature": "<ed25519>"               
}
```

### 22.2 Installation Lifecycle
1. Tenant admin selects a pack (UI or API `POST /graph/templates/install`).
2. Server validates signature and compatibility (engine version ≥ minVersion).
3. Insert schemas into `object_type_schemas` / `relationship_type_schemas` with `tenant_id = NULL` (global) OR copy to tenant-specific rows if pack marked *tenant-scoped*.
4. Create optional materialized views (idempotent) guarded by feature flag.
5. Record installation in `graph_template_installs` table for traceability.

### 22.3 Override / Extension Rules
- Tenant can add new optional properties via creating a *higher* schema version for same type with `tenant_id = <tenant>`; inheritance merges base + override (only additive unless explicit override flag allowed later).
- Relationship multiplicity cannot be relaxed (only equal or stricter) in tenant override.
- Pack updates (e.g., 1.1.0) installed via migration endpoint; detect breaking changes (removal / required field addition) -> require explicit force flag.

### 22.4 Governance & Signing
- Pack manifest canonicalized (sorted keys) then signed; public key baked into config.
- Unsigned (custom) packs allowed only if `ALLOW_UNVERIFIED_TEMPLATE=true` (dev mode).

## 23. TOGAF Template Implementation Plan
We leverage the existing taxonomy in `04-data-model.md` and formalize it as the first template pack (`togaf-core`).

### 23.1 Scope of v1 TOGAF Pack
Included Object Types (subset prioritized for value):
- Capability, Driver, Goal, Objective
- ArchitecturePrinciple, Requirement (with category variants)
- BusinessProcess, BusinessService
- Decision (ADR), Risk, Assumption
- ApplicationComponent, ApplicationService, Interface/APIContract
- DataEntity, Event, Standard
- WorkPackage, Plateau, Gap, RoadmapItem, ChangeRequest, Release

Included Relationship Types:
- trace_to, refine, satisfy, verify, implement, realize, serve, depend_on, conform_to, deliver, migrate_to, address, derive_from, own

### 23.2 Object Schema Pattern Example
```json
{
  "$id": "Capability.schema.json", "type": "object",
  "required": ["title","status"],
  "properties": {
    "title": {"type": "string","maxLength": 256},
    "status": {"type": "string","enum": ["proposed","active","retired"]},
    "description": {"type": "string"},
    "business_value": {"type": "number","minimum": 0},
    "kpis": {"type": "array", "items": {"type":"string"}}
  },
  "additionalProperties": false
}
```

### 23.3 Phased Delivery Timeline
Phase | Deliverable | Notes
------|-------------|------
P0 | Core dynamic infra (Sections 4–11) | Tables, expansion API, validation engine
P1 | Template pack loader + registry | `graph_templates` tables & install endpoint
P2 | TOGAF pack 1.0.0 schemas & relationship definitions | Signed manifest
P3 | Materialized views: capability_map, requirements_trace_matrix | Refresh strategy
P4 | Override support (tenant additive schema) | Merge + precedence rules
P5 | Pack upgrade workflow (diff + apply) | Detect breaking changes
P6 | Analytics: release diff vs TOGAF baseline KPIs | Derived metrics

### 23.4 Data Structures for Pack Management
```sql
CREATE TABLE kb.graph_template_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest JSONB NOT NULL,
  signature TEXT,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE kb.graph_template_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  organization_id UUID,
  project_id UUID,
  template_pack_id UUID NOT NULL REFERENCES kb.graph_template_packs(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 23.5 API Endpoints (Additions)
| Endpoint | Purpose |
|----------|---------|
| `GET /graph/templates` | List available packs & versions |
| `POST /graph/templates/install` | Install specified pack (tenant context) |
| `GET /graph/templates/:name/:version/manifest` | Retrieve raw manifest |
| `POST /graph/templates/upgrade` | Apply newer version (with dry-run diff) |
| `GET /graph/templates/diff?name=togaf-core&from=1.0.0&to=1.1.0` | Show schema & relationship changes |

### 23.6 Validation Flow With Packs
1. Request to create object of type T.
2. Resolver loads merged schema stack: [core pack schema T] + [tenant override schema T (if any)].
3. Compose with rule: required = union(all required), properties = union (if conflicts, tenant wins only if additive / same type).
4. Validate payload; on fail return `422 validation-failed` with field errors.

### 23.7 Materialized Views (Examples)
Capability Map:
```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS kb.view_capability_map AS
SELECT o.id, o.title, o.status, o.properties->>'business_value' AS business_value
FROM kb.objects o
WHERE o.type = 'Capability' AND o.deleted_at IS NULL;
```
Refresh triggered by NOTIFY or periodic job if write frequency high.

Requirements Traceability Matrix (Requirement ↔ Goal / Objective):
```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS kb.view_requirements_trace AS
SELECT r.id AS requirement_id, trg.id AS target_id, trg.type AS target_type
FROM kb.objects r
JOIN kb.relationships rel ON rel.src_object_id = r.id AND rel.type = 'trace_to'
JOIN kb.objects trg ON trg.id = rel.dst_object_id
WHERE r.type = 'Requirement' AND r.deleted_at IS NULL;
```

### 23.8 Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Pack drift from runtime schema (manual edits) | Disallow direct edits to core types when pack installed; enforce via trigger |
| Upgrade breaking changes | Dry-run diff + explicit `force=true` flag |
| Explosion of tenant overrides | Quotas & metrics; encourage consolidation |
| Large snapshot time with many objects | Parallel snapshot insertion + COPY path |

### 23.9 Success Metrics
- Time to first TOGAF-compliant model for new tenant < 2 minutes.
- 95% of object creations in tenants with pack use validated schemas (vs custom freeform).
- Pack upgrade diff generation p95 < 1s for ≤ 500 schemas.
- Materialized view refresh p95 < 2s for 100K capabilities / requirements combined.

### 23.10 Open Questions
- Should packs define UI hints (form layouts) embedded in manifest? (Probably store but keep client optional.)
- Need dependency graph between packs (e.g., togaf-core + risk-extension)? Add `dependencies` array to manifest.
- Should we expose pack-supplied sample data seeding? (Optional future.)

### 23.11 Implementation Checklist (Template Focus)
- [ ] Pack manifest format finalization & signature verification utility
- [ ] Template pack tables & install endpoints
- [ ] Import/registration of `togaf-core` schemas & relationships
- [ ] Schema resolver merge logic with override semantics
- [ ] Validation pipeline integration
- [ ] Materialized views & refresh job
- [ ] Diff & upgrade endpoints
- [ ] Metrics & dashboards (pack adoption, validation success rate)

## 24. Roadmap & Milestone Checklist (Executable Plan)
This section is a living checklist. Each milestone has: *Scope*, *Deliverables*, *Acceptance Tests* (AT), *Exit Criteria*. Update status marks ( [ ] → [x] ) as work completes; add links to PRs / test reports.

Legend of Test Types: UT = Unit Test, IT = Integration Test (API + DB), E2E = End-to-End (through Admin UI or scripted client), PERF = Performance benchmark, MIG = Migration/backfill test, SEC = Security/RLS test.

### P0 – Core Dynamic Infrastructure
Scope: Foundational tables (`kb.objects`, `kb.relationships`, schema registry), CRUD, basic JSON Schema validation, `/graph/expand` (single pass), telemetry.
Checklist:
- [ ] Create tables & base indexes
- [ ] Object CRUD (create/read/update version row, soft delete)
- [ ] Relationship CRUD + unique constraint & multiplicity enforcement (app layer)
- [ ] JSON Schema validation (global only)
- [ ] `/graph/expand` endpoint (direction, depth, filters, limitNodes)
- [ ] Telemetry logging (`graph.expand`)
- [ ] RLS policies updated for new tables
- [ ] Backfill existing `Entity/Relation` (script) **(MIG)**
- [ ] OpenAPI schemas published
Acceptance Tests:
- AT-P0-1 (UT): Create object with valid vs invalid schema (422 on invalid)
- AT-P0-2 (IT): Insert relationship violating multiplicity returns 409
- AT-P0-3 (IT): Depth=2 expansion returns expected node/edge counts deterministically
- AT-P0-4 (SEC): Cross-tenant object fetch denied (403/empty)
- AT-P0-5 (MIG): Backfill script idempotency (double run: second run no-op)
- AT-P0-6 (PERF): Depth 2 expansion p95 < 300ms on seeded 100K nodes / 300K edges
Exit Criteria: All ATs pass; OpenAPI merged; instrumentation visible in metrics dashboard.

### P1 – Template Pack Framework
Scope: Pack & install tables, signature verification, list/install APIs, manifest ingestion (no TOGAF yet), audit entries.
Checklist:
- [ ] `graph_template_packs` & `graph_template_installs` tables
- [ ] Signature verification utility (ed25519)
- [ ] `GET /graph/templates`, `POST /graph/templates/install`
- [ ] Manifest schema validation (pack format)
- [ ] Install writes schemas into registry
- [ ] Prevent duplicate install of same version (idempotent)
Acceptance Tests:
- AT-P1-1 (UT): Pack manifest JSON schema validation rejects malformed manifest
- AT-P1-2 (IT): Install unsigned pack fails unless flag enabled
- AT-P1-3 (IT): Re-install same pack/version returns 200 idempotent
- AT-P1-4 (SEC): Tenant cannot install pack for another tenant (403)
Exit Criteria: Template listing/installation stable; unauthorized or malformed manifests rejected.

### P2 – TOGAF Core Pack v1.0.0
Scope: Provide first signed pack with defined object & relationship schemas; enable validation using pack.
Checklist:
- [ ] Author schemas for prioritized TOGAF types
- [ ] Relationship types & multiplicity encoded
- [ ] Signed `togaf-core` manifest stored
- [ ] Install & create test objects enforcing constraints
- [ ] Documentation section referencing pack usage
Acceptance Tests:
- AT-P2-1 (IT): Installing `togaf-core` registers all expected types (count matches manifest)
- AT-P2-2 (UT): Object creation for type with missing required field fails
- AT-P2-3 (IT): Relationship not in pack (unknown type) rejected
- AT-P2-4 (IT): Multiplicity rule (e.g., one `own` relation) enforced
Exit Criteria: 100% schema coverage for scoped types; pack validation active in production mode.

### P3 – Derived Views & Refresh
Scope: Capability map + requirements traceability materialized views, refresh job, monitoring.
Checklist:
- [ ] Create materialized views (capability_map, requirements_trace)
- [ ] Refresh function + NOTIFY OR scheduled job
- [ ] Metrics: refresh duration & staleness
- [ ] Query API `GET /graph/views/:name` (optional) or leverage direct SQL through internal services
Acceptance Tests:
- AT-P3-1 (IT): Capability inserted → after refresh appears in view
- AT-P3-2 (IT): Requirements trace view row count matches underlying relationships
- AT-P3-3 (PERF): View refresh time p95 < 2s at scale target
Exit Criteria: Views available and stable under simulated write load.

### P4 – Tenant Overrides
Scope: Add tenant-scoped schema version layering (additive only), merge resolution, override precedence.
Checklist:
- [ ] Tenant override insertion endpoint / CLI
- [ ] Merge engine: combine core + tenant schema
- [ ] Enforcement: cannot remove required fields or relax multiplicity
- [ ] Audit log of overrides
Acceptance Tests:
- AT-P4-1 (UT): Override adding optional property allows new field usage
- AT-P4-2 (IT): Override attempting to remove required field rejected
- AT-P4-3 (IT): Object validation uses merged schema (both sets of fields accepted)
Exit Criteria: Overrides functional & safe; regression tests for base pack still pass.

### P5 – Pack Upgrade & Diff
Scope: Upgrade endpoint, diff computation (added/removed/changed fields & relationships), force flag for breaking changes.
Checklist:
- [ ] `GET /graph/templates/diff` endpoint
- [ ] `POST /graph/templates/upgrade` with dry-run flag
- [ ] Breaking change detection rules
- [ ] Migration doc updated
Acceptance Tests:
- AT-P5-1 (UT): Diff correctly identifies added property
- AT-P5-2 (UT): Diff flags required field addition as breaking
- AT-P5-3 (IT): Dry-run returns no state mutation
- AT-P5-4 (IT): Upgrade with breaking change requires `force=true`
Exit Criteria: Safe upgrade flow; audit entries for each upgrade.

### P6 – Release Snapshots & Branch Integration
Scope: Branching, snapshots (`product_versions`), tag support, diff endpoints (object delta, release diff), integration with template validation.
Checklist:
- [ ] `kb.branches`, `kb.product_versions`, `kb.product_version_members`, `kb.tags` tables
- [ ] Branch create (lazy CoW), object resolution fallback
- [ ] Snapshot creation & membership population
- [ ] Release diff endpoint
- [ ] Tag create/list
- [ ] Merge workflow (single-object) + conflict detection
Acceptance Tests:
- AT-P6-1 (IT): Branch fallback returns parent object when not modified
- AT-P6-2 (IT): Editing object on branch isolates version (parent unaffected)
- AT-P6-3 (IT): Snapshot membership count equals number of visible canonical heads
- AT-P6-4 (IT): Release diff returns correct change types (added/removed/modified)
- AT-P6-5 (IT): Tag creation references existing snapshot only
- AT-P6-6 (UT): Merge conflict detection triggers on divergent same field
- AT-P6-7 (PERF): Snapshot build time < 60s for 100K objects
Exit Criteria: Branching + release mgmt stable; performance within targets.

### P7 – Performance & Scale Hardening (Optional)
Scope: Closure tables for hierarchical relations, caching, partition readiness.
Checklist:
- [ ] Closure table for `refine` relation
- [ ] Redis/TTL cache for small expansions
- [ ] Partitioning plan doc (tenancy hash) drafted
Acceptance Tests:
- AT-P7-1 (PERF): Hierarchical depth 5 query improvement vs baseline (>40% faster)
- AT-P7-2 (IT): Cache hit returns same payload hash as DB query
Exit Criteria: Documented performance uplift; readiness for larger datasets.

### Cross-Cutting Quality Gates
- [ ] All new tables have RLS policies & tests
- [ ] Migrations idempotent (apply twice safe)
- [ ] OpenAPI updated each milestone
- [ ] Observability: logs + metrics dashboards for each new subsystem
- [ ] Security review for pack ingestion & signature verification

### Traceability Matrix
| Milestone | Primary Risks | Mitigations |
|-----------|--------------|-------------|
| P0 | Recursive explosion | Depth & node caps + truncation flag |
| P2 | Schema drift | Read-only core + override layering |
| P4 | Override abuse | Additive-only rule + audit | 
| P5 | Breaking upgrade | Diff & force flag |
| P6 | Snapshot latency | Parallel insertion & batch COPY |

### Maintenance Instructions
- Update this checklist in every PR touching a milestone: mark items `[x]`, append PR link `(PR #123)`.
- Append new AT IDs if new edge cases added; do not repurpose IDs (stable references for test reports).



## 25. External Integration & Enhancement Backlog
This section synthesizes insights from comparative analysis (LangExtract structured extraction, LightRAG multi-mode retrieval/reranking, other modern RAG frameworks) into concrete, specification-scoped additions. It is partitioned into: (a) Concrete Spec Additions (immediately incorporable structural/API changes), (b) Valuable Elements to Borrow (medium/long-term design borrowables with rationale), (c) Immediate Actionable Low‑Lift Items (fast wins to implement this iteration), and (d) Additional Acceptance Tests to lock behavior. Each item references earlier sections (8A/8B/8C/etc.) for cohesion.

### 25.1 Concrete Spec Additions (Amendments To Core Sections)
These are explicit spec deltas to incorporate now (no fundamental architectural upheaval, backward-compatible if gated by flags):

1. Embedding Versioning (Add to 8A / 8A.D):
  - Add columns on `kb.graph_objects`: `embedding_model TEXT`, `embedding_version INT DEFAULT 1`, `embedding_updated_at TIMESTAMPTZ` (referenced already implicitly in staleness metrics). 
  - Add config: `EMBEDDING_ACTIVE_MODEL`, `EMBEDDING_ACTIVE_VERSION`.
  - Worker rule: if stored `(embedding_model, embedding_version) != (ACTIVE_MODEL, ACTIVE_VERSION)` object re-enqueued with priority (policy weight bump) unless job already pending.
  - Circuit breaker excludes re-version backlog from breaker-open skip (still processes a trickle to age out old versions).
  - Search response `meta.embedding_model` becomes `{ "model": "text-embedding-3-large", "version": 2, "coverage_pct": 91.4 }`.

2. Reranker Layer (Add Section 8B between fusion and marginal gain; optional flag):
  - Config: `GRAPH_SEARCH_RERANK_ENABLED` (bool), `GRAPH_SEARCH_RERANK_POOL` (default 60), `GRAPH_SEARCH_RERANK_MODEL` (string), `GRAPH_SEARCH_RERANK_TIMEOUT_MS` (default 300), `GRAPH_SEARCH_RERANK_TOP_K` (final items considered for rerank scoring, default 40).
  - Algorithm insertion point: After initial fusion & neighbor aggregation but BEFORE marginal gain pruning (so pruning uses reranked ordering). If timeout occurs, fallback returns pre-rerank ordering with `meta.rerank_timeout=true`.
  - Scoring: Reranker produces relevance probabilities p_i; update final score: `final = (1 - α) * final + α * p_i` (α configurable per intent; default 0.35). Record reason `{channel:"reranker", score: contribution}`.
  - Debug metrics: `meta.rerank = { model, latency_ms, applied: true|false, pool: n }`.

3. Evidence / Citation Span Capture (Add to 8B.10 response schema):
  - For each item optionally include `citations[]`: `[{ "span": "sentence excerpt...", "source_object_id": "...", "confidence": 0.82 }]`.
  - Derived via lightweight sentence-level lexical overlap or embedding similarity within object textual fields (only fields retained after salience pruning). Config flag: `GRAPH_SEARCH_CITATIONS_ENABLED`.
  - Token budget allocation: citations share Path Summaries bucket (counts toward Path Summaries %); capped by `GRAPH_SEARCH_CITATION_MAX` (default 8) and `GRAPH_SEARCH_CITATION_SENTENCE_MAX_TOKENS` (default 60).

4. Readiness Endpoint & Readiness Gate (New small ops addition):
  - Endpoint: `GET /graph/search/readiness` returning coverage & staleness metrics: `{ "embedding": { "required_coverage_pct": 99.2, "optional_coverage_pct": 72.4, "p50_staleness_s": 48, "version_mismatch_backlog": 312 }, "queues": { "embedding_pending": 540 } }`.
  - Clients (Admin UI) show warning banner if required coverage < `EMBEDDING_REQUIRED_MIN_READINESS` (default 95%) OR version mismatch backlog > threshold (configurable).

5. Search API Contract Adjustment (Finalize `/graph/search` request):
  - Add query parameters / body fields:
    * `intentOverride` (string) – bypass classifier.
    * `maxTokenBudget` (int) – client-supplied budget override (capped by server global; cannot exceed 1.5 * server default).
    * `channels` (array) – restrict to subset of `["lexical","vector"]`; if empty uses auto.
    * `includeCitations` (bool) – explicit gating independent of server default.
    * `rerank` (bool|null) – tri-state: true force on; false force off; null use default flag.
  - Response add `meta.request`: echo sanitized parameters for debugging.

6. Debug Security Scoping (Add to 8B.10 / Section 16):
  - Return of `debug` object requires scope `graph:search:debug`. Deny with 403 if missing while `debug=true`. Log attempt count metric `search.debug.denied`.

7. Normalization Version Tagging:
  - Add `meta.normalization_version: "zscore_v1"` (switch to `zscore_v2` if formula or clamp changes) for downstream eval reproducibility.

8. Failure Mode Extension (Section 18):
  - Add failure: `rerank_timeout` → sets `meta.rerank_timeout=true`; partial results still sorted by pre-rerank fusion.
  - Add failure: `embedding_version_backlog` – not a hard failure; add warning array: `meta.warnings: ["embedding_version_backlog"]` if > threshold.

### 25.2 Valuable Elements to Borrow (Strategic Enhancements – Later Phases)
These are deliberate borrowables from external systems, queued for future phases; not all will be implemented immediately.

| Element | Source Inspiration | Value | Planned Phase | Notes |
|---------|-------------------|-------|---------------|-------|
| Multi-Mode Retrieval Modes (local/global/hybrid/mix) | LightRAG | Declarative control over candidate sources (e.g., object-only vs object+doc) | P3+ (post baseline stability) | Represent via `mode` param enumerating object/doc blend presets. |
| Storage Abstraction Layer | LightRAG | Future pluggability (alt vector stores) | P4+ | Maintain provider interface; current PG fine; defer until scale triggers. |
| Evaluation Harness (labeled query pipeline) | LightRAG | Continuous quality regression detection | P2 (retrieval v2 rollout) | Scripted job producing NDCG / MRR dashboards nightly. |
| Reranker Model Rotation & Canary | LightRAG | Safe upgrade path for reranker models | After initial reranker GA | Experiment flag splitting % of traffic. |
| Evidence Span Highlighting | LangExtract grounding spans | Improves explanation & user trust | Already partially via citations (25.1.3) | Later expansion: multi-span per field. |
| Structured Extraction Feedback Loop | LangExtract multi-pass | Enhances object enrichment & retrieval signals | P4 | Feed extracted canonical facts as additional weighted fields. |
| Structural Embeddings Channel | Research (graph ML) | Additional semantic signal for link-based relevance | P5 | Node2Vec/GraphSAGE precompute job; gating flag. |
| Learned-to-Rank Model | Industry standard | Increased relevance beyond heuristic fusion | P6 | Requires logged features & label curation. |
| Conversation Memory Working Set | LightRAG session concept | Token savings & continuity | P3 (session working set from 8B.8) | Soft launch behind feature flag. |
| Embedding Degradation / Rollback Strategy | Operational best practice | Fast revert of faulty model version | With embedding versioning initial rollout | Keep previous vectors until health validated (dual index window). |

### 25.3 Immediate Actionable Items (Low Lift – Next Sprint Candidates)
Ordered by impact/effort ratio (highest first):

1. Add `embedding_model`, `embedding_version`, `embedding_updated_at` columns + worker upgrade logic (schema + migration + metrics) – unlocks future safe model upgrades.
2. Implement readiness endpoint (`/graph/search/readiness`) returning coverage & backlog counts.
3. Add `meta.normalization_version` + adjust existing response serialization; trivial change but improves evaluation reproducibility.
4. Add debug scope enforcement & metric (`search.debug.denied`).
5. Extend `/graph/search` request to accept `intentOverride`, `channels`, `rerank` (ignored until reranker flag on). Document in OpenAPI.
6. Introduce warnings array in `meta` and populate `embedding_version_backlog` when mismatch backlog percentage > `EMBED_VERSION_BACKLOG_WARN_PCT` (new config, default 15%).
7. Pre-wire reranker config keys & no-op stub (returns null) so runtime toggle later is a config flip rather than code deploy.
8. Add acceptance tests for normalization determinism & version tagging (see 25.4 AT-RET-DET-*). 

Stretch (still low risk):
9. Add `includeCitations` flag (returns empty array while disabled) so clients integrate early.
10. Emit nightly evaluation harness scaffold (script placeholder) capturing raw result JSON & computing simple lexical baseline diff (foundation for later LTR).

### 25.4 Additional Acceptance Tests (New / Augmented)
ID | Category | Description | Type | Success Criteria
---|----------|-------------|------|-----------------
AT-EMB-VERS-1 | Embedding Versioning | Object with legacy embedding version triggers re-enqueue and updates to active version | IT | After worker run, `embedding_version` matches active.
AT-EMB-VERS-2 | Embedding Versioning | Readiness endpoint reports version mismatch backlog decreases after processing | IT | Backlog count drops >0 after cycle.
AT-RERANK-1 | Reranker | When enabled, rerank reason appears and final ordering differs from baseline for synthetic test (deterministic stub) | IT | Response `items[0].reasons` contains channel reranker.
AT-RERANK-2 | Reranker Timeout | Forced timeout sets `meta.rerank_timeout=true` and preserves pre-rerank ordering hash | IT | Hash comparison equal.
AT-SEARCH-CIT-1 | Citations | With `includeCitations=true` returns ≤ configured max citations and each has span + confidence | IT | Count <= `GRAPH_SEARCH_CITATION_MAX`.
AT-READINESS-1 | Readiness | `/graph/search/readiness` returns expected keys & 200 | IT | JSON schema validation passes.
AT-READINESS-2 | Readiness | Required coverage below threshold sets warning flag in readiness response | IT | Response contains `warnings` array.
AT-DET-NORM-1 | Determinism | Repeated identical query returns identical ordered item id list & scores within ε | IT | Max abs delta < 1e-6.
AT-DET-NORM-2 | Determinism | Normalization version surfaced `zscore_v1` | IT | Meta field present & equals constant.
AT-SEC-DEBUG-1 | Security | `debug=true` without scope returns 403 and does not include debug payload | SEC | HTTP 403.
AT-META-WARN-1 | Warnings | Embedding version backlog > threshold adds `embedding_version_backlog` warning | IT | Warning present.
AT-CONFIG-CHAN-1 | Channels Filter | Request with `channels=["lexical"]` excludes vector channel metadata | IT | `meta.channels` array only lexical.
AT-INTENT-OVR-1 | Intent Override | `intentOverride=locate_config` sets `intent` in response & applies template weights | IT | Response.intent == locate_config.

### 25.5 Config Additions Summary
| Key | Default | Purpose |
|-----|---------|---------|
| EMBEDDING_ACTIVE_MODEL | text-embedding-3-large | Current canonical model id |
| EMBEDDING_ACTIVE_VERSION | 1 | Current embedding version integer |
| EMBED_VERSION_BACKLOG_WARN_PCT | 15 | % mismatch triggering warning |
| GRAPH_SEARCH_RERANK_ENABLED | false | Enable reranker blending |
| GRAPH_SEARCH_RERANK_MODEL | null | Reranker model identifier |
| GRAPH_SEARCH_RERANK_POOL | 60 | Candidate pool size for reranker |
| GRAPH_SEARCH_RERANK_TOP_K | 40 | Top K retained after rerank blending |
| GRAPH_SEARCH_RERANK_TIMEOUT_MS | 300 | Timeout for reranker inference |
| GRAPH_SEARCH_CITATIONS_ENABLED | false | Enable citation span extraction |
| GRAPH_SEARCH_CITATION_MAX | 8 | Max citations per response |
| GRAPH_SEARCH_CITATION_SENTENCE_MAX_TOKENS | 60 | Max tokens per citation sentence |
| EMBEDDING_REQUIRED_MIN_READINESS | 95 | Coverage threshold for readiness OK |

### 25.6 Risk & Mitigation (New Items)
| Risk | Description | Mitigation |
|------|-------------|-----------|
| Reranker Latency Inflation | Reranker adds >25% to p95 | Timeout + adaptive pool shrink (halve pool on two consecutive timeouts) |
| Embedding Version Backlog Starvation | New version rollout stalls due to breaker open | Priority lane for version mismatch jobs independent of main breaker state |
| Citation Hallucination | Extracted spans misrepresent content | Strict span must be verbatim substring; no generative paraphrasing |
| Debug Data Leakage | Elevated scoring internals exposed without auth | Scope gate + explicit audit log on denied attempts |

### 25.7 Implementation Ordering Recommendation (Micro-Roadmap)
1. Schema migration: embedding version columns + readiness endpoint (foundation for safe future changes).
2. Meta normalization version tagging + debug scope (small surface, improves observability & safety).
3. Request/response contract updates (channels, intentOverride, rerank toggles) – ship behind doc updates.
4. Reranker scaffolding (no-op provider returning null) + config keys.
5. Warnings array + backlog warning logic.
6. Citation flag + skeleton (returns empty list until full extraction implemented).
7. Actual reranker integration (model inference) + acceptance tests.
8. Citation extraction implementation (span detection algorithm) + ATs.

### 25.8 Traceability Links
| Enhancement | Spec Section Reference | Acceptance Tests |
|-------------|------------------------|------------------|
| Embedding Versioning | 8A.D (extend) | AT-EMB-VERS-* |
| Reranker Layer | 8B (fusion pipeline) | AT-RERANK-* |
| Citations | 8B.10 (response), 25.1.3 | AT-SEARCH-CIT-* |
| Readiness Endpoint | 25.1.4 | AT-READINESS-* |
| Determinism & Normalization Version | 8B.3 / 25.1.7 | AT-DET-NORM-* |
| Debug Scope | 25.1.6 / Section 16 | AT-SEC-DEBUG-1 |
| Warnings Meta | 25.1.8 | AT-META-WARN-1 |
| Channel Filtering | 25.1.5 | AT-CONFIG-CHAN-1 |
| Intent Override | 8B.9, 25.1.5 | AT-INTENT-OVR-1 |

### 25.9 Open Questions (New)
1. Do we store dual embeddings (old + new version) concurrently for a grace period to avoid search quality dip during model transition? (Proposal: yes – keep old column `embedding_prev` until mismatch backlog <5% then drop.)
2. Should reranker operate on enriched textual serialization (object + top path summaries) or raw object fields only? (Benchmark both; start with pruned fields + neighbor titles.)
3. Citation extraction algorithm baseline: lexical sentence overlap vs small local embedding similarity – which yields better precision with acceptable latency? (Run eval harness once citations implemented.)
4. Do we need per-intent reranker α blending values or single global? (Likely per-intent tuned after initial data.)
5. Should readiness endpoint include percentile distribution for embedding staleness beyond p50/p95? (Add p90 if trivial.)

### 25.10 Sunset / Deletion Policy for Versioned Embeddings
After embedding version change reaches ≥ 99% coverage and passes evaluation criteria (no regression >2% NDCG), schedule a job to NULL out stale `embedding_prev` values older than `EMBED_VERSION_RETENTION_DAYS` (config, default 14) to reclaim disk. Provide metric `embedding.version.dual_coverage_pct` during dual-phase.

---
This section (25) operationalizes external learnings into the evolving retrieval & graph spec with a bias toward safe, incremental adoption. Items marked Immediate Actionable enable future complex layers (reranker, LTR, structural embeddings) without forcing breaking interface changes.

## 26. Comprehensive Testing Strategy
Purpose: Provide a unified, multi-layer test architecture ensuring correctness, relevance quality, performance SLO adherence, security isolation, determinism, and safe evolution for the dynamic object graph, retrieval, embedding, expansion, and forthcoming reranker/citation features.

### 26.1 Test Layer Taxonomy
| Layer | Scope | Tooling | Frequency | Owners |
|-------|-------|---------|-----------|--------|
| Unit (UT) | Pure functions: diff generation, normalization, edge scoring, marginal gain, salience ranking, path summarizer templates | Vitest / Jest (server) | On each commit | Engineering (Backend) |
| Component Integration (CIT) | Repository-layer SQL + service logic (embedding queue worker, traversal service) with real Postgres (test DB) | Vitest + testcontainers / docker-compose | On each commit (parallelizable) | Backend |
| API Integration (IT) | HTTP endpoints (`/graph/traverse`, `/graph/expand` future, `/graph/search`, readiness, template install) exercising middleware, RLS, validation | Supertest / Pact (consumer-driven subsections) | On each commit & nightly | Backend |
| Relevance / Retrieval Evaluation (EVAL) | Offline scoring of labeled query set (NDCG, MRR, Recall@K) across baseline vs candidate pipeline versions | Node script + Python metrics util | Nightly + pre-flag enable | Retrieval Guild |
| Performance (PERF) | Latency percentiles, throughput under load, memory, connection usage | k6 / Locust + pg_stat_statements captures | Nightly + Pre-release gates | DevOps + Backend |
| Determinism (DET) | Stability of ordering & scores (float epsilon) across runs & seeds | Repeat-run harness | Nightly & on algorithm changes | Retrieval Guild |
| Security / RLS (SEC) | Tenant/org/project isolation, debug scope gating, injection attempts | IT + fuzz harness | On each commit | Security/Backend |
| Migration / Backfill (MIG) | Idempotency of schema & data migrations; snapshot rebuild; embedding version transitions | Scripted migration tests | On migration PRs | Backend |
| Chaos / Fault Injection (CHAOS) | Simulated provider timeouts, DB deadlocks, circuit breaker conditions | Feature-flagged test suite | Weekly / before major rollout | SRE |
| End-to-End (E2E) UI | Admin UI flows consuming graph & search (object create, search context, branch snapshot) | Playwright | CI (Chromium fast), nightly full | Frontend |

### 26.2 Canonical Test Datasets
Define deterministic seed fixtures enabling reproducible assertions (IDs stable via namespace UUID v5 where possible):
1. Mini Graph (G_MINI): ~12 objects (Meeting, Decision, Person x3, Requirement x3, Capability x2) with purposeful relationships (decides, attended_by, trace_to, refine).
2. Medium Graph (G_MED): ~5K objects, 18K edges; controlled degree distribution (Pareto-like) to test hub damping; synthetic titles with embedded keywords to evaluate lexical vs vector channel interplay.
3. Large Graph (G_LARGE): ~100K objects, 300K edges; used for PERF & stress; embedding coverage partial (simulate backlog) plus version mismatch subset.
4. Query Evaluation Set (Q_EVAL): ≥ 50 curated queries with gold-labeled relevant object canonical IDs & graded relevance levels (0..3). Stored in `spec/eval/graph_queries.json` locked; updates require review + diff summary.
5. Reranker Synthetic Set (Q_RERANK_SYN): 15 synthetic ambiguous queries where reranker stub deterministically elevates a known candidate (for proving pipeline wiring before real model integration).
6. Citation Fixture Document (CIT_SRC): Objects containing multi-sentence descriptions with delimiting punctuation; used to validate citation span extraction & verbatim constraints.

### 26.3 Naming & ID Conventions
Use stable prefix tagging to aid filtering in tests & metrics:
| Prefix | Entity | Example |
|--------|--------|---------|
| OBJ_ | Object title slug | OBJ_DECISION_FEATURE_FLAGGING |
| REL_ | Relationship id alias mapping | REL_DECIDES_1 |
| QRY_ | Query id in eval sets | QRY_DEBUG_OUTAGE |

### 26.4 Unit Test Coverage Matrix (Representative)
| Functionality | Cases |
|--------------|-------|
| Diff Generator | nested add/remove/update, large field hashing, array positional changes, no-op | 
| Edge Score (8C.2) | type weight precedence, recency decay boundary (now vs half-life vs >2 half-lives), hub damping with varying degrees, reverse direction reciprocal boost | 
| Normalization (8B.3) | z-score path, min-max fallback (<5 docs), clamp extremes, deterministic ordering invariance | 
| Fusion Strategies | weighted_sum v2 vs RRF; channel absence fallback; weight re-scaling | 
| Marginal Gain | gain below threshold skip vs above accept; safety floor MIN_RESULTS enforcement | 
| Path Summary Template | Title truncation, multi-node formatting, relation type substitution | 
| Field Salience | TF-IDF weighting vs manual override presence; retention of mandatory core fields | 
| Embedding Input Builder | Relevant paths inclusion, token truncation, redaction patterns | 
| Reranker Blending (stub) | α=0 (no effect), α=1 (full replacement), timeout fallback | 
| Citation Extractor (stub) | Sentence boundary detection, verbatim substring assertion, max token cap | 

### 26.5 Integration Tests (CIT / IT) Focus
| Scenario | Assertions |
|----------|------------|
| Embedding enqueue trigger on create | Job row present, attempt=0 | 
| Non-significant object patch | No new job (UNIQUE row unchanged) | 
| Backoff escalation | attempt increments; next_attempt_after increases exponentially | 
| Circuit breaker open condition | New leases skipped; probe after interval processes limited set | 
| `/graph/traverse` depth & truncation | Returned maxDepthReached correct; truncated flag behavior | 
| `/graph/search` lexical-only cold start | `meta.channels=["lexical"]`; no vector reasons | 
| Neighbor expansion per-primary limit | Limit enforced; no overflow | 
| Hub sampling | `meta.expansion.hub_sampled=true` when degree threshold exceeded | 
| Embedding version mismatch requeue | Legacy version triggers job with priority ordering (policy DESC then version mismatch) | 
| Readiness endpoint | Schema keys present; coverage percentages numeric; warnings conditional | 
| Debug scope denial | 403 & metric increment | 
| Intent override | Response.intent == provided; weight pattern alters ordering (hash diff) | 
| Channels filter | meta.channels subset & absent channel reasons | 
| Rerank enabled (stub) | Additional reranker reason appears; applied true | 
| Rerank timeout | meta.rerank_timeout true; ordering hash unchanged vs baseline | 
| Citations enabled (stub) | `citations` array present but empty (pre-implementation) | 

### 26.6 Relevance Evaluation Harness
Process Pipeline (nightly):
1. Load Q_EVAL queries & gold judgments.
2. Run baseline strategy (current prod flags) and candidate (feature branch / new weights).
3. Compute metrics: NDCG@10, NDCG@20, MRR@20, Recall@50, Precision@10.
4. Diff thresholds: Reject candidate if NDCG@20 < baseline - 0.02 absolute OR MRR@20 < baseline - 0.02 unless manual override label.
5. Produce artifact JSON: `eval_report_<timestamp>.json` with per-query breakdown and aggregated stats; store under `logs/eval/` (gitignored) and optionally upload to dashboard.
6. Track metric trendline; if drift > 5% degrade over 3 consecutive runs, open alert issue.

### 26.7 Determinism & Float Stability
Test Harness Strategy:
```
for i in 1..N (default 5):
  run /graph/search on deterministic seed queries with debug=false/true
  record (ordered object_id list, score list)
compare pairwise deltas: max_abs_diff(score) < EPS (1e-6)
```
If determinism fails: output diff triage including random seeds, environment hash (library versions), and channel normalization stats. Add environment fingerprint: model versions, normalization_version, fusion strategy, reranker flag combination.

### 26.8 Performance Testing (PERF)
Tools: k6 scripts using seeded G_MED & G_LARGE datasets.
Workload Profiles:
| Profile | Mix | Target RPS | Notes |
|---------|-----|-----------|-------|
| READ_LIGHT | 70% traverse depth1, 30% search simple | 50 | Warm cache behavior |
| SEARCH_MIX | 60% search (varied query length), 40% traverse depth2 | 30 | Primary retrieval latency |
| HEAVY_RETRIEVAL | 100% search w/ neighbors & path summaries | 15 | Stress path summary pipeline |
| RERANK_ON | 50% search with rerank flag, 50% baseline | 20 | Rerank overhead measurement |

SLO Assertions (auto-fail build if violated):
| Endpoint | p95 Latency | p99 Latency | Error Rate |
|----------|------------|------------|-----------|
| /graph/traverse (depth≤2, ≤5K nodes) | ≤ 500ms | ≤ 800ms | <0.2% |
| /graph/search (no rerank) | ≤ 600ms | ≤ 900ms | <0.5% |
| /graph/search (rerank enabled) | ≤ 750ms | ≤ 1100ms | <0.7% |
| Readiness endpoint | ≤ 150ms | ≤ 300ms | <0.1% |

Resource Guard Metrics: Monitor DB buffer hit ratio (≥ 95%), CPU saturation (< 75% average test window), connection pool wait time (p95 < 20ms). Fail test early if pool exhaustion encountered.

### 26.9 Security & RLS Tests
| Case | Expectation |
|------|-------------|
| Cross-tenant object fetch | 403 or empty result set; never returns foreign object fields |
| Injected filter path not whitelisted | 400 validation error |
| Debug param leakage without scope | 403, no debug field | 
| Reranker model name injection (path traversal) | Sanitized / rejected (400) |
| Citation span request w/ disallowed type (sensitive) | Redacted or omitted spans (when implemented) |

Fuzzing: property filters fuzzed with random JSON shapes (limit depth 4, width 6) – service must reject unsupported operators, never panic.

### 26.10 Migration & Backfill (MIG)
Scenarios:
1. Fresh migration: applying all schema migrations on empty DB → success; readiness coverage initially 0; cold-start search lexical-only.
2. Idempotent migration: re-apply last N migrations → no-op (verified via checksum table & absence of DDL errors).
3. Backfill legacy Entity/Relation script: run twice, second run inserts 0 new rows; mapping table stable.
4. Embedding version rollout: set `ACTIVE_VERSION=2` → measure mismatch backlog curve; ensure dual coverage metrics published; post-rollback set back to 1 ensures no data corruption in previous embeddings.

### 26.11 Chaos / Fault Injection
Injection Points:
| Fault | Mechanism | Expected Handling |
|-------|----------|-------------------|
| Embedding provider timeout | Mock provider delay > timeout | Job failure, backoff applied, breaker potentially opens |
| Provider returns dimension mismatch | Mock wrong vector length | Process abort (fatal test) verifying guard triggers |
| Postgres transient error (serialization failure) | Retry wrapper raising 40001 randomly | Worker retries operation, metrics increment |
| Reranker timeout | Force delay > RERANK_TIMEOUT_MS | meta.rerank_timeout=true, no panic |
| Citation extraction exception | Throw error mid-scan | Citations omitted; warning captured | 

### 26.12 Test Data & Artifact Governance
| Artifact | Location | Versioning Policy |
|----------|----------|------------------|
| Eval queries JSON | `spec/eval/graph_queries.json` | PR must include diff summary & metric re-run |
| Gold judgments | `spec/eval/judgments/*.json` | Same as above; stable IDs; never mutate meaning without major version bump |
| Synthetic seeds | `scripts/seeds/*.ts` | Deterministic random seed constant at top of file |
| Performance scripts | `perf/k6/*.js` | Keep scenario names stable; add new rather than rename |

### 26.13 Tooling & CI Integration
Pipeline Stages (ordered):
1. Lint & Unit Tests
2. Integration Tests (API + DB)
3. Determinism quick check (subset queries)
4. Build Containers
5. Performance Smoke (reduced dataset quick latency sample) – gating optionally non-blocking early
6. Deploy to ephemeral env (feature branch)
7. Nightly: full EVAL + PERF + CHAOS suites
8. Publish metrics to dashboard (Grafana / DataDog) & persist JSON artifacts

Fail-Fast Rules: If determinism or security test fails, abort pipeline (skip expensive perf/eval stages).

### 26.14 Coverage & Quality Gates
| Metric | Target |
|--------|--------|
| Unit test function coverage (core retrieval modules) | ≥ 85% |
| Edge scoring branch coverage | 100% critical branches (type weight precedence, hub sampling path) |
| API integration endpoint coverage | 100% of public endpoints |
| Relevance regression acceptance | NDCG@20 change within ±2% unless intentional improvement | 
| Determinism fail rate | 0 (flakiness tracked separately) |

### 26.15 Flakiness Management
Classification:
| Class | Criteria | Action |
|-------|----------|--------|
| Infra | Network / container startup variability | Increase warmup / retries; tag test to infra dashboard |
| Timing | Race conditions (e.g., async job not awaited) | Add explicit polling with max attempts; avoid fixed sleeps |
| Data | Non-deterministic seed usage | Fix by replacing `Math.random()` with seeded RNG | 

Automated flaky detector: mark a test flaky if it fails >1 and passes on immediate retry; escalate if same test flaky >3 times in 7 days.

### 26.16 Reporting & Dashboards
Dashboards (Grafana / DataDog):
1. Retrieval Quality: NDCG, MRR trendlines, channel weight distribution, reranker adoption.
2. Embedding Health: Coverage, backlog, version mismatch progress, staleness percentiles.
3. Expansion Metrics: neighbors.count histograms, hub sampling trigger rate.
4. Performance: p50/p95/p99 latencies by endpoint & scenario; resource utilization overlays.
5. Determinism: daily max score delta; failures list.
6. Failures: top error codes; circuit breaker state timeline.

### 26.17 Acceptance Tests Mapping (Extended)
This section extends earlier AT matrices; new IDs defined in Section 25 and here reference their layer:
| ID Pattern | Layer | Example |
|-----------|-------|---------|
| AT-EMB-* | CIT/IT | AT-EMB-VERS-1 |
| AT-RERANK-* | IT/EVAL | AT-RERANK-1 |
| AT-READINESS-* | IT | AT-READINESS-1 |
| AT-DET-* | DET | AT-DET-NORM-1 |
| AT-SEARCH-CIT-* | IT | AT-SEARCH-CIT-1 |
| AT-META-WARN-* | IT | AT-META-WARN-1 |
| AT-CONFIG-CHAN-* | IT | AT-CONFIG-CHAN-1 |
| AT-INTENT-OVR-* | IT | AT-INTENT-OVR-1 |

### 26.18 Future Test Enhancements
| Idea | Benefit | Trigger |
|------|---------|--------|
| Differential Graph Snapshot Replay (Prod anonymized sample -> test) | Realistic workload regression detection | Post GA of /graph/search |
| Learned-to-Rank Shadow Eval | Early signal before LTR prod use | LTR prototype ready |
| Structural Embedding Drift Monitor | Detect stale graph embedding semantics | After structural channel added |
| Real-time Query Canary (1% traffic) | Fast revert for reranker misbehavior | Reranker stable for 2 weeks |

### 26.19 Exit Criteria for Major Feature Promotion
Feature (e.g., reranker) may exit beta when: 
1. All associated AT-RERANK-* pass across 7 consecutive nightly runs.
2. Performance overhead within SLO budgets for two successive weekly PERF suites.
3. No determinism failure involving rerank scores in last 14 days.
4. Evaluation set improvement ≥ target uplift (documented) with p-value < 0.05 (two-tailed paired test).

### 26.20 Governance
Any change to weight formulas, normalization, or edge scoring requires:
1. Updating `normalization_version` or `edge_scoring_version` constant.
2. Re-running EVAL harness and attaching diff report to PR.
3. Updating acceptance test expectations where deterministic ordering shifts (gated review from Retrieval Guild).

---
This comprehensive testing strategy ensures resilient evolution while safeguarding precision, performance, and security. It should be treated as normative: deviations or exemptions must be documented in PR descriptions and, if persistent, reflected back into this section.



