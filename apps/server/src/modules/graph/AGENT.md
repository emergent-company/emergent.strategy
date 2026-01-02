# Graph Module Patterns for AI Assistants

> **AI Assistants**: Read this BEFORE modifying the graph module. This is the most complex module in the server codebase (60+ files). Understand these patterns thoroughly.

## Module Overview

The Graph module implements a **versioned knowledge graph** with full audit trail, multi-tenant isolation, and vector similarity search. It manages objects (nodes) and relationships (edges) with sophisticated versioning semantics.

```
apps/server/src/modules/graph/
├── AGENT.md                           # This file
├── graph.module.ts                    # Module definition
├── graph.controller.ts                # Main REST endpoints
├── graph.service.ts                   # Core CRUD operations (~2000 lines)
├── graph.types.ts                     # Type definitions
├── graph-vector-search.service.ts     # Vector similarity search
├── graph-embeddings.controller.ts     # Embedding endpoints
│
├── branch.controller.ts               # Branch management endpoints
├── branch.service.ts                  # Branch operations with lineage
├── tag.controller.ts                  # Tag management endpoints
├── tag.service.ts                     # Tag operations
├── product-version.controller.ts      # Product version endpoints
├── product-version.service.ts         # Product version operations
│
├── object-merge.service.ts            # Object merging with provenance
├── schema-registry.service.ts         # Schema validation (delegated)
├── embedding-policy.service.ts        # Embedding policy CRUD
├── embedding-policy.entity.ts         # Policy TypeORM entity
├── embedding-policy.dto.ts            # Policy DTOs
├── embedding-jobs.service.ts          # Embedding job management
│
├── embedding-worker.service.ts        # Background embedding worker
├── tag-cleanup-worker.service.ts      # Orphan tag cleanup worker
├── revision-count-refresh-worker.service.ts  # Materialized view refresh
│
├── embedding.provider.ts              # Embedding provider abstraction
├── google-vertex-embedding.provider.ts # Vertex AI embeddings
│
├── redaction.interceptor.ts           # Response redaction
├── utils/
│   ├── field-pruning.util.ts          # Field pruning for responses
│   └── redaction.util.ts              # Redaction utilities
│
├── predicate-evaluator.ts             # JSON Pointer predicate evaluation
├── temporal-filter.util.ts            # Time-based filtering SQL builder
├── traverse-cursor.util.ts            # Traversal cursor encode/decode
├── merge.util.ts                      # Merge utilities
├── diff.util.ts                       # Object diffing
│
└── dto/                               # 20 DTOs
    ├── create-graph-object.dto.ts
    ├── patch-graph-object.dto.ts
    ├── create-graph-relationship.dto.ts
    ├── patch-graph-relationship.dto.ts
    ├── traverse-graph.dto.ts
    ├── vector-search.dto.ts
    ├── similar-vector-search.dto.ts
    ├── search-with-neighbors.dto.ts
    ├── expand-graph.dto.ts
    ├── predicate.dto.ts
    ├── temporal-filter.dto.ts
    ├── bulk-update-status.dto.ts
    ├── edge-phase.dto.ts
    ├── history.dto.ts
    ├── object-version.dto.ts
    ├── merge.dto.ts
    ├── trigger-embeddings.dto.ts
    ├── create-tag.dto.ts
    ├── update-tag.dto.ts
    └── create-product-version.dto.ts
```

## Core Concepts

### 1. Versioning Model (CRITICAL)

Every object and relationship has these identity fields:

| Field           | Purpose                                         |
| --------------- | ----------------------------------------------- |
| `id`            | Physical row ID (UUID, changes on every edit)   |
| `canonical_id`  | Logical identity (UUID, stable across versions) |
| `version`       | Monotonic version number (1, 2, 3...)           |
| `supersedes_id` | Links to previous version's `id` (nullable)     |
| `deleted_at`    | Tombstone timestamp for soft delete             |
| `content_hash`  | SHA256 of sorted JSON properties                |

**Version chain example:**

```
Version 1: id=A, canonical_id=X, version=1, supersedes_id=NULL
Version 2: id=B, canonical_id=X, version=2, supersedes_id=A
Version 3: id=C, canonical_id=X, version=3, supersedes_id=B (soft-deleted)
```

### 2. Head Selection (CRITICAL)

The **head** of a canonical object is the most recent non-deleted version. This is implemented with a specific SQL pattern.

#### Head-First Filtering Pattern

```sql
-- CORRECT: Get true head first, THEN filter deleted
SELECT * FROM (
  SELECT DISTINCT ON (canonical_id) *
  FROM kb.graph_objects
  WHERE project_id = $1  -- tenant filter OK before DISTINCT ON
  ORDER BY canonical_id, version DESC
) t
WHERE t.deleted_at IS NULL  -- filter AFTER head selection

-- WRONG: Filtering deleted_at BEFORE DISTINCT ON resurfaces old versions!
SELECT DISTINCT ON (canonical_id) *
FROM kb.graph_objects
WHERE project_id = $1
  AND deleted_at IS NULL  -- WRONG POSITION!
ORDER BY canonical_id, version DESC
```

**Why this matters:**

- If version 3 is soft-deleted, the WRONG query returns version 2
- The CORRECT query returns nothing (head is deleted = object doesn't exist)
- This prevents "zombie resurrection" of old versions

### 3. Tenant Context (RLS)

The graph module uses PostgreSQL GUCs for Row-Level Security:

```typescript
// Setting tenant context via GUCs
await client.query(`SET LOCAL app.current_organization_id = $1`, [orgId]);
await client.query(`SET LOCAL app.current_project_id = $1`, [projectId]);

// Wrapper pattern in GraphService
async runWithRequestContext<T>(
  request: RequestLike,
  callback: () => Promise<T>
): Promise<T> {
  // Sets GUCs from request headers (x-org-id, x-project-id)
  // Restores previous context after callback
}
```

### 4. Advisory Locks

Concurrent modifications to the same logical object use PostgreSQL advisory locks:

```typescript
// Lock on canonical_id to serialize concurrent patches
await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
  `obj|${canonical_id}`,
]);
// Lock automatically released at transaction end (COMMIT/ROLLBACK)
```

**Use cases:**

- `PATCH /graph/objects/:id` - Prevent concurrent version creation
- Object merge operations - Prevent conflicting merges
- Relationship updates affecting same source/target

### 5. Content Hashing

Used for change detection and merge conflict classification:

```typescript
// SHA256 of sorted, normalized JSON properties
const hash = crypto
  .createHash('sha256')
  .update(JSON.stringify(sortedProperties))
  .digest();

// Stored as bytea in database
@Column({ name: 'content_hash', type: 'bytea', nullable: true })
contentHash!: Buffer | null;
```

## SQL Patterns

### Standard Head Query

```sql
-- Get head versions of all objects in a project
WITH heads AS (
  SELECT DISTINCT ON (canonical_id) *
  FROM kb.graph_objects
  WHERE project_id = $1
  ORDER BY canonical_id, version DESC
)
SELECT * FROM heads WHERE deleted_at IS NULL;
```

### History Query

```sql
-- Get all versions of a specific canonical object
SELECT *
FROM kb.graph_objects
WHERE canonical_id = $1
  AND project_id = $2
ORDER BY version DESC;
```

### Branch-Aware Query

```sql
-- Get head per canonical, respecting branch hierarchy
WITH heads AS (
  SELECT DISTINCT ON (canonical_id) *
  FROM kb.graph_objects
  WHERE project_id = $1
    AND (branch_id = $2 OR branch_id IN (
      SELECT ancestor_branch_id FROM kb.branch_lineage WHERE branch_id = $2
    ))
  ORDER BY canonical_id, version DESC
)
SELECT * FROM heads WHERE deleted_at IS NULL;
```

### Transaction with Advisory Lock

```typescript
async patchObject(id: string, patch: PatchDto, ctx: RequestContext) {
  const client = await this.db.getClient();
  try {
    await client.query('BEGIN');

    // 1. Find current head
    const current = await client.query(
      'SELECT * FROM kb.graph_objects WHERE id = $1',
      [id]
    );

    // 2. Lock on canonical_id
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
      [`obj|${current.rows[0].canonical_id}`]
    );

    // 3. Re-verify head hasn't changed (optimistic concurrency)
    const recheck = await client.query(
      `SELECT id FROM kb.graph_objects
       WHERE canonical_id = $1
       ORDER BY version DESC LIMIT 1`,
      [current.rows[0].canonical_id]
    );
    if (recheck.rows[0].id !== id) {
      throw new ConflictException('Object was modified concurrently');
    }

    // 4. Insert new version
    const newVersion = await client.query(
      `INSERT INTO kb.graph_objects (...) VALUES (...) RETURNING *`,
      [/* new version data */]
    );

    await client.query('COMMIT');
    return newVersion.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

## Service Responsibilities

### GraphService (graph.service.ts)

The main service (~2000 lines) handling:

| Method                 | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `createObject()`       | Create new object (canonical_id = id, version = 1) |
| `patchObject()`        | Create new version with advisory lock              |
| `deleteObject()`       | Soft delete (set deleted_at on head)               |
| `getObject()`          | Get current head by ID or canonical_id             |
| `listObjects()`        | List heads with filters, cursor pagination         |
| `getHistory()`         | Get all versions of a canonical object             |
| `createRelationship()` | Create edge between objects                        |
| `patchRelationship()`  | Update relationship properties                     |
| `deleteRelationship()` | Soft delete relationship                           |
| `traverse()`           | BFS traversal from root objects                    |
| `search()`             | Hybrid lexical + vector search                     |
| `mergeBranchDryRun()`  | Classify differences between branches              |

### GraphVectorSearchService

Vector similarity search using pgvector:

```typescript
// Uses embedding_v2 column (vector(768)) for Gemini embeddings
// Cosine distance operator: <=>
const result = await this.db.query(
  `
  SELECT *, embedding_v2 <=> $1 as distance
  FROM kb.graph_objects
  WHERE embedding_v2 IS NOT NULL
    AND project_id = $2
  ORDER BY distance
  LIMIT $3
`,
  [queryEmbedding, projectId, limit]
);
```

### BranchService

Manages branches and lineage:

```typescript
// Lineage table structure (for efficient ancestry queries)
// branch_id | ancestor_branch_id | depth
// C         | C                  | 0     (self)
// C         | B                  | 1     (parent)
// C         | A                  | 2     (grandparent)

// Create branch with lineage population
async create(dto: CreateBranchDto): Promise<BranchRow> {
  // Uses raw SQL for:
  // 1. IS NOT DISTINCT FROM null-safe comparison
  // 2. Recursive lineage copy with depth+1
  // 3. Transaction consistency
}
```

### ObjectMergeService

Handles object merging with provenance tracking:

```typescript
// Merge strategies
type MergeStrategy = 'source-wins' | 'target-wins';

// Merge two canonical objects
async mergeObjects(
  sourceCanonicalId: string,
  targetCanonicalId: string,
  strategy: MergeStrategy,
  ctx: RequestContext
): Promise<MergeResult> {
  // 1. Lock both objects
  // 2. Deep merge properties
  // 3. Redirect relationships from source to target
  // 4. Soft delete source
  // 5. Record merge provenance
}
```

## Background Workers

### EmbeddingWorkerService

Polls for pending embedding jobs and processes them:

```typescript
@Injectable()
export class EmbeddingWorkerService implements OnModuleInit, OnModuleDestroy {
  // Interval-based polling (configurable via EMBEDDING_WORKER_INTERVAL_MS)
  // Default: 30 seconds

  async processBatch(): Promise<void> {
    // 1. Find pending jobs (status = 'pending')
    // 2. Generate embeddings via Vertex AI
    // 3. Update embedding_v2 column
    // 4. Mark job completed
    // 5. Emit real-time event
  }
}
```

### TagCleanupWorkerService

Removes orphaned tags not referenced by any objects:

```typescript
// Runs every 5 minutes (configurable via TAG_CLEANUP_INTERVAL_MS)
async cleanupUnusedTags(): Promise<void> {
  // Delete tags not referenced in any graph_objects.properties->'tags'
  // Uses JSONB ? operator for containment check
}
```

### RevisionCountRefreshWorkerService

Refreshes materialized view for revision statistics:

```typescript
// Runs every 5 minutes (configurable via REVISION_COUNT_REFRESH_INTERVAL_MS)
async refreshRevisionCounts(): Promise<number> {
  // REFRESH MATERIALIZED VIEW CONCURRENTLY kb.graph_object_revision_counts
}
```

**Worker configuration:**

| Env Var                              | Default | Purpose                     |
| ------------------------------------ | ------- | --------------------------- |
| `EMBEDDING_WORKER_INTERVAL_MS`       | 30000   | Embedding job poll interval |
| `TAG_CLEANUP_INTERVAL_MS`            | 300000  | Tag cleanup interval        |
| `REVISION_COUNT_REFRESH_INTERVAL_MS` | 300000  | Stats refresh interval      |
| `ENABLE_WORKERS_IN_TESTS`            | false   | Enable workers in test mode |

## DTOs Reference

### Object DTOs

```typescript
// Create new object
interface CreateGraphObjectDto {
  type: string; // Required: object type
  key?: string; // Optional: unique key within type
  properties: Record<string, any>; // Required: JSONB properties
  branch_id?: string; // Optional: target branch
  labels?: string[]; // Optional: labels for filtering
}

// Patch existing object (creates new version)
interface PatchGraphObjectDto {
  type?: string; // Optional: change type
  key?: string; // Optional: change key
  properties?: Record<string, any>; // Optional: full replacement
  patch?: Record<string, any>; // Optional: deep merge
  labels?: string[]; // Optional: replace labels
}
```

### Traversal DTOs

```typescript
interface TraverseGraphDto {
  root_ids: string[]; // Starting canonical_ids
  depth?: number; // Max depth (default: 3)
  direction?: 'outgoing' | 'incoming' | 'both';
  edge_types?: string[]; // Filter by relationship type
  node_types?: string[]; // Filter by object type
  limit?: number; // Max nodes per level
  predicates?: PredicateDto[]; // Property filters
  temporal?: TemporalFilterDto; // Time-based filtering
}
```

### Predicate DTO

```typescript
interface PredicateDto {
  path: string; // JSON Pointer (e.g., "/status", "/metadata/priority")
  operator: PredicateOperator; // equals, notEquals, contains, etc.
  value?: any; // Comparison value
}

type PredicateOperator =
  | 'exists'
  | 'notExists'
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'in'
  | 'notIn'
  | 'matches'; // Regex
```

### Temporal Filter DTO

```typescript
interface TemporalFilterDto {
  asOf: string; // ISO timestamp
  field?: 'valid_from' | 'created_at' | 'updated_at';
}
```

## Utilities

### Predicate Evaluator

Evaluates JSON Pointer predicates against objects:

```typescript
// Resolve JSON Pointer path
resolveJsonPointer(obj, '/metadata/priority'); // Returns obj.metadata.priority

// Evaluate single predicate
evaluatePredicate(obj, {
  path: '/status',
  operator: 'equals',
  value: 'active',
});

// Evaluate multiple predicates (AND logic)
evaluatePredicates(obj, predicates);
```

### Temporal Filter Builder

Generates SQL WHERE clauses for time-based queries:

```typescript
const { sqlClause, params } = buildTemporalFilterClause(
  { asOf: '2024-01-01T00:00:00Z', field: 'valid_from' },
  'o' // table alias
);
// sqlClause: "o.valid_from <= $1 AND (o.valid_to IS NULL OR o.valid_to > $1)"
```

### Traverse Cursor

Encodes/decodes traversal pagination cursors:

```typescript
// Encode
const cursor = encodeTraverseCursor(2, 'object-id-123');
// "eyJkIjoyLCJpZCI6Im9iamVjdC1pZC0xMjMifQ"

// Decode
const payload = decodeTraverseCursor(cursor);
// { d: 2, id: 'object-id-123' }
```

## Common Operations

### Creating an Object

```typescript
// Via controller
POST /graph/objects
{
  "type": "Requirement",
  "key": "REQ-001",
  "properties": {
    "name": "User Authentication",
    "status": "draft",
    "priority": "high"
  },
  "labels": ["security", "core"]
}

// In service
const result = await this.graphService.createObject({
  type: 'Requirement',
  key: 'REQ-001',
  properties: { name: '...', status: 'draft' },
  labels: ['security'],
}, requestContext);
```

### Patching an Object

```typescript
// Via controller (creates new version)
PATCH /graph/objects/:id
{
  "patch": {
    "status": "approved",
    "approvedAt": "2024-01-15T10:00:00Z"
  }
}

// In service
const newVersion = await this.graphService.patchObject(
  objectId,
  { patch: { status: 'approved' } },
  requestContext
);
```

### Traversing the Graph

```typescript
// Via controller
POST /graph/traverse
{
  "root_ids": ["canonical-id-1", "canonical-id-2"],
  "depth": 3,
  "direction": "outgoing",
  "edge_types": ["implements", "depends_on"],
  "node_types": ["Requirement", "Feature"],
  "limit": 100
}

// Response
{
  "nodes": [
    { "id": "...", "canonical_id": "...", "type": "Requirement", ... }
  ],
  "edges": [
    { "id": "...", "source_id": "...", "target_id": "...", "type": "implements" }
  ],
  "meta": { "truncated": false, "depth_reached": 2 }
}
```

### Vector Search

```typescript
// Via controller
POST /graph/search/vector
{
  "query": "user authentication security requirements",
  "limit": 20,
  "type": "Requirement",
  "labels": ["security"]
}

// Response includes distance scores
{
  "items": [
    { "id": "...", "distance": 0.15, ... }
  ]
}
```

## Anti-Patterns (AVOID)

### SQL Anti-Patterns

```sql
-- WRONG: Filter deleted before DISTINCT ON
SELECT DISTINCT ON (canonical_id) *
FROM kb.graph_objects
WHERE deleted_at IS NULL  -- WRONG!
ORDER BY canonical_id, version DESC;

-- WRONG: No advisory lock on concurrent modification
UPDATE kb.graph_objects SET ... WHERE id = $1;

-- WRONG: Hardcoded org/project instead of GUCs
WHERE org_id = 'hardcoded-uuid'
```

### Code Anti-Patterns

```typescript
// WRONG: Not using runWithRequestContext
const result = await this.db.query('SELECT * FROM kb.graph_objects');

// CORRECT: Always use context wrapper for tenant isolation
const result = await this.runWithRequestContext(request, async () => {
  return this.db.query('SELECT * FROM kb.graph_objects WHERE project_id = $1', [
    projectId,
  ]);
});

// WRONG: Direct update without version creation
await this.graphObjectRepo.update(id, { properties: newProps });

// CORRECT: Create new version via patchObject
const newVersion = await this.graphService.patchObject(
  id,
  { properties: newProps },
  ctx
);

// WRONG: Assuming id is canonical_id
const object = await this.getObject(request.params.id); // This is version id!

// CORRECT: Be explicit about which ID type
const object = await this.getObjectByCanonicalId(canonicalId);
const version = await this.getObjectById(versionId);
```

### Testing Anti-Patterns

```typescript
// WRONG: Not waiting for advisory lock release
await service.patchObject(id, patch1, ctx);
await service.patchObject(id, patch2, ctx); // May fail if lock not released

// CORRECT: Use transaction boundaries or wait for completion
await service.patchObject(id, patch1, ctx);
// Lock released at COMMIT
await service.patchObject(id, patch2, ctx);

// WRONG: Asserting on row id instead of canonical_id
expect(result.id).toBe(originalId); // Wrong! ID changes on each version

// CORRECT: Assert on canonical_id for identity
expect(result.canonical_id).toBe(originalCanonicalId);
expect(result.version).toBeGreaterThan(originalVersion);
```

## Testing Patterns

### Using FakeGraphDb

```typescript
import {
  makeFakeGraphDb,
  FakeGraphDb,
} from '../../../tests/helpers/fake-graph-db';

describe('GraphService', () => {
  let fakeDb: FakeGraphDb;

  beforeEach(() => {
    fakeDb = makeFakeGraphDb({ strict: true }); // Throws on unmatched SQL
  });

  it('should create object', async () => {
    // FakeGraphDb emulates head selection, versioning, etc.
    const result = await service.createObject(dto, ctx);
    expect(result.version).toBe(1);
    expect(result.canonical_id).toBe(result.id);
  });
});
```

### Query Recording

```typescript
const fakeDb = makeFakeGraphDb({ recordQueries: true });

// ... execute operations ...

// Assert on SQL patterns
const queries = fakeDb.getRecordedQueries();
expect(queries).toContainEqual(
  expect.objectContaining({ text: expect.stringContaining('DISTINCT ON') })
);
```

## Environment Variables

| Variable                           | Default            | Purpose                              |
| ---------------------------------- | ------------------ | ------------------------------------ |
| `GRAPH_MERGE_ENUM_HARD_LIMIT`      | 500                | Max objects in merge dry-run         |
| `GRAPH_MERGE_TELEMETRY_LOG`        | false              | Log merge summary events             |
| `GRAPH_MERGE_OBJECT_TELEMETRY_LOG` | false              | Log per-object merge events          |
| `GRAPH_MERGE_OBJECT_TELEMETRY_MAX` | 50                 | Max objects for per-object telemetry |
| `EMBEDDING_DIMENSION`              | 768                | Vector embedding dimension           |
| `EMBEDDING_MODEL`                  | text-embedding-004 | Gemini embedding model               |

## Related Documentation

- **Database schema**: `docs/database/schema-context.md`
- **Graph merge spec**: `apps/server/docs/graph-merge.md`
- **Search pagination**: `docs/spec/graph-search-pagination.md`
- **FakeGraphDb**: `apps/server/tests/helpers/README.md`
- **Benchmark scripts**: `apps/server/scripts/graph-benchmark.ts`

## File Index

### Core Services

| File                             | Lines | Purpose                          |
| -------------------------------- | ----- | -------------------------------- |
| `graph.service.ts`               | ~2000 | Main CRUD, versioning, traversal |
| `graph-vector-search.service.ts` | ~220  | Vector similarity search         |
| `branch.service.ts`              | ~310  | Branch management with lineage   |
| `object-merge.service.ts`        | ~500  | Object merging with provenance   |
| `tag.service.ts`                 | ~150  | Tag CRUD operations              |
| `product-version.service.ts`     | ~120  | Product version tracking         |
| `schema-registry.service.ts`     | ~95   | Schema validation (delegated)    |
| `embedding-policy.service.ts`    | ~200  | Embedding policy CRUD            |
| `embedding-jobs.service.ts`      | ~180  | Embedding job management         |

### Controllers

| File                             | Lines | Purpose                   |
| -------------------------------- | ----- | ------------------------- |
| `graph.controller.ts`            | ~915  | Main graph endpoints      |
| `graph-embeddings.controller.ts` | ~120  | Embedding endpoints       |
| `branch.controller.ts`           | ~80   | Branch endpoints          |
| `tag.controller.ts`              | ~90   | Tag endpoints             |
| `product-version.controller.ts`  | ~75   | Product version endpoints |

### Workers

| File                                       | Lines | Purpose                         |
| ------------------------------------------ | ----- | ------------------------------- |
| `embedding-worker.service.ts`              | ~490  | Background embedding generation |
| `tag-cleanup-worker.service.ts`            | ~215  | Orphan tag cleanup              |
| `revision-count-refresh-worker.service.ts` | ~260  | Stats materialized view refresh |

### Utilities

| File                          | Lines | Purpose                           |
| ----------------------------- | ----- | --------------------------------- |
| `predicate-evaluator.ts`      | ~137  | JSON Pointer predicate evaluation |
| `temporal-filter.util.ts`     | ~45   | Temporal SQL clause builder       |
| `traverse-cursor.util.ts`     | ~25   | Traversal cursor encode/decode    |
| `merge.util.ts`               | ~80   | Merge helper utilities            |
| `diff.util.ts`                | ~100  | Object diffing                    |
| `utils/field-pruning.util.ts` | ~60   | Response field pruning            |
| `utils/redaction.util.ts`     | ~80   | Sensitive field redaction         |

### DTOs (20 files in `dto/`)

See "DTOs Reference" section above for key interfaces.
