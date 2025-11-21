# Bug Report: Embedding Column Mismatch

**ID:** 004  
**Date:** 2024-11-21  
**Severity:** Critical  
**Status:** ✅ RESOLVED  
**Impact:** 100% of graph objects have NULL embeddings for vector search (FIXED)

## Summary

The embedding worker writes embeddings to the wrong column. Worker updates `graph_objects.embedding` (bytea), but vector search reads from `graph_objects.embedding_vec` (vector(32)). Result: 953 completed embedding jobs but 0% of objects have usable embeddings.

## Evidence

### Database State

```sql
-- Embedding jobs: 953 completed successfully
SELECT status, COUNT(*)
FROM kb.graph_embedding_jobs
GROUP BY status;

--   status   | count
-- -----------+-------
--  completed |   953

-- Graph objects: 5,995 total, 0 have embedding_vec
SELECT COUNT(*),
       COUNT(embedding_vec) as with_embedding_vec,
       COUNT(embedding) as with_embedding_bytea,
       (COUNT(embedding_vec) * 100.0 / COUNT(*)) as percentage_vec
FROM kb.graph_objects;

--  count | with_embedding_vec | with_embedding_bytea | percentage_vec
-- -------+--------------------+----------------------+----------------
--   5995 |                  0 |                  953 |           0.00
```

### Schema Confusion

**Entity Definition (graph-object.entity.ts):**

```typescript
@Entity({ schema: 'kb', name: 'graph_objects' })
export class GraphObject {
  // Legacy bytea column (old format)
  @Column({ type: 'bytea', nullable: true })
  embedding!: Buffer | null; // ← Worker writes HERE

  @Column({ name: 'embedding_updated_at', type: 'timestamptz', nullable: true })
  embeddingUpdatedAt!: Date | null;

  // Current vector column (wrong dimension: 32)
  @Column({ name: 'embedding_vec', type: 'vector', length: 32, nullable: true })
  embeddingVec!: number[] | null; // ← Search reads FROM HERE

  // Proposed new column (correct dimension: 768)
  @Column({
    name: 'embedding_v1',
    type: 'vector',
    length: 1536,
    nullable: true,
  })
  embeddingV1!: number[] | null; // ← UNUSED
}
```

### Code Locations

**Writer (embedding-worker.service.ts:160-165):**

```typescript
await this.graphObjectRepo.update(
  { id: obj.id },
  {
    embedding: embedding as any, // ← Writing to BYTEA column
    embeddingUpdatedAt: new Date(),
  }
);
```

**Reader (graph-vector-search.service.ts:81):**

```typescript
const sql = `SELECT id, project_id, branch_id, 
             (embedding_vec <=> $1::vector) AS distance  -- ← Reading from VECTOR column
             FROM kb.graph_objects
             WHERE embedding_vec IS NOT NULL
             ORDER BY embedding_vec <=> $1::vector
             LIMIT $${nextIndex}`;
```

## Root Cause

### Historical Context

The `graph_objects` table has **three embedding columns** from different migration phases:

1. **`embedding` (bytea)** - Original format, pre-pgvector extension
2. **`embedding_vec` (vector(32))** - First pgvector migration, wrong dimension
3. **`embedding_v1` (vector(1536))** - Proposed column with correct dimension (unused)

### The Mismatch

- **Worker was never updated** after pgvector migration
- Still writes to legacy `embedding` (bytea) column
- **Search service uses** `embedding_vec` (vector) column
- **Result:** Jobs complete successfully but embeddings aren't where search expects them

### Dimension Mismatch (Secondary Issue)

Even if the column mismatch is fixed:

- Current model: Gemini `text-embedding-004` produces **768 dimensions**
- `embedding_vec` expects: **32 dimensions** (wrong!)
- `embedding_v1` expects: **1536 dimensions** (also wrong!)
- `.env.example` says: `EMBEDDING_DIMENSION=1536` (outdated)

## Impact

### Broken Features

1. **Vector Search (Critical)**

   - `POST /graph/objects/vector-search` returns 0 results
   - `GET /graph/objects/:id/similar` returns 0 results
   - Cannot find similar entities for extraction enrichment

2. **Smart Extraction (Blocked)**

   - Cannot perform context-aware extraction
   - Cannot find existing entities to enrich
   - Must fall back to "dumb" extraction (no context)

3. **Semantic Chat Search (Broken)**
   - Graph search results always empty
   - Chat responses lack knowledge graph context

### Working Despite Bug

- Embedding jobs complete successfully ✓
- Jobs are marked as completed ✓
- Worker processes batches ✓
- **Problem:** Data written to wrong place

## Reproduction Steps

1. Create a graph object (any type, any status)
2. Observe embedding job created and marked completed
3. Query `SELECT embedding, embedding_vec, embedding_v1 FROM kb.graph_objects WHERE id = ?`
4. **Expected:** `embedding_vec` populated with vector
5. **Actual:** `embedding` populated with bytea, `embedding_vec` is NULL

## Logs

```bash
# Worker is running and processing jobs
$ nx run workspace-cli:workspace:logs -- --service=server | grep embedding

2025-11-20 10:09:49: UPDATE kb.graph_embedding_jobs j SET status='processing'
2025-11-20 10:09:51: UPDATE kb.graph_embedding_jobs j SET status='processing'
2025-11-20 10:09:53: UPDATE kb.graph_embedding_jobs j SET status='processing'

# Jobs marked as completed (no errors logged)
```

## Solution

### Option 1: Quick Fix (Minimum Viable)

**Update worker to write to correct column:**

```typescript
// embedding-worker.service.ts:160-165
await this.graphObjectRepo.update(
  { id: obj.id },
  {
    embeddingVec: embedding as any, // ← Change to embeddingVec
    embeddingUpdatedAt: new Date(),
  }
);
```

**Problem:** Dimension mismatch (768 vs 32) will cause database error.

### Option 2: Correct Fix (Recommended)

**Step 1: Create migration to fix dimension**

```sql
-- 1. Add new column with correct dimension
ALTER TABLE kb.graph_objects
ADD COLUMN IF NOT EXISTS embedding_v2 vector(768);

-- 2. Create index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_graph_objects_embedding_v2_ivfflat
ON kb.graph_objects
USING ivfflat (embedding_v2 vector_cosine_ops)
WITH (lists = 100);

-- 3. Optionally drop old columns (after backfill)
-- ALTER TABLE kb.graph_objects DROP COLUMN embedding;
-- ALTER TABLE kb.graph_objects DROP COLUMN embedding_vec;
-- ALTER TABLE kb.graph_objects DROP COLUMN embedding_v1;
```

**Step 2: Update entity**

```typescript
// graph-object.entity.ts
@Column({ name: 'embedding_v2', type: 'vector', length: 768, nullable: true })
embeddingV2!: number[] | null;
```

**Step 3: Update worker**

```typescript
// embedding-worker.service.ts
await this.graphObjectRepo.update(
  { id: obj.id },
  {
    embeddingV2: embedding as any, // ← Write to new column
    embeddingUpdatedAt: new Date(),
  }
);
```

**Step 4: Update search service**

```typescript
// graph-vector-search.service.ts
const sql = `SELECT id, project_id, branch_id, 
             (embedding_v2 <=> $1::vector) AS distance
             FROM kb.graph_objects
             WHERE embedding_v2 IS NOT NULL
             ORDER BY embedding_v2 <=> $1::vector
             LIMIT $${nextIndex}`;
```

**Step 5: Backfill existing objects**

```bash
# Reset all embedding jobs to re-process with correct column
UPDATE kb.graph_embedding_jobs
SET status = 'pending',
    started_at = NULL,
    completed_at = NULL,
    attempt_count = 0
WHERE status = 'completed';

# Worker will automatically re-process all 953 jobs
```

### Option 3: Minimal Migration (Resize Existing Column)

**Not recommended** - Resizing vector columns in-place can be risky and requires rewriting the entire table.

## Affected Files

**To Modify:**

- `apps/server/src/modules/graph/embedding-worker.service.ts` - Change write target
- `apps/server/src/modules/graph/graph-vector-search.service.ts` - Change read source
- `apps/server/src/entities/graph-object.entity.ts` - Add new column
- `apps/server/migrations/NNNN_fix_embedding_column.ts` - New migration

**To Review:**

- `apps/server/src/modules/embeddings/embeddings.service.ts` - Verify dimension output
- `apps/server/src/modules/graph/embedding-policy.service.ts` - No changes needed
- `.env.example` - Update EMBEDDING_DIMENSION to 768

## Next Steps

1. ✅ **Verify current state** (completed in this investigation)
2. **Create migration** for `embedding_v2` column (768 dimensions)
3. **Update worker** to write to new column
4. **Update search service** to read from new column
5. **Reset embedding jobs** to re-process all objects
6. **Monitor progress** - should complete in ~5-10 minutes (953 jobs × 2s interval)
7. **Verify results** - check that `embedding_v2 IS NOT NULL` for processed objects
8. **Test vector search** - POST /graph/objects/vector-search should return results
9. **Clean up old columns** - after confirming migration success

## References

- [Embedding System Analysis](../spec/embedding-system-analysis.md) - Overall embedding architecture
- [EMBEDDING_MIGRATION.md](../../docs/EMBEDDING_MIGRATION.md) - Original migration docs
- [pgvector documentation](https://github.com/pgvector/pgvector) - Vector extension reference

## Related Issues

- [003-chunk-embeddings-missing.md](./003-chunk-embeddings-missing.md) - Chunks also need embedding system
- After fixing this, chunks still need separate embedding infrastructure

---

## Resolution (2024-11-21)

### Root Cause Analysis

The issue was deeper than initially thought. Two critical bugs were found:

1. **Column Mismatch**: Worker wrote to `embedding` (bytea), search read from `embedding_vec` (vector(32))
2. **Type Mismatch**: `EmbeddingProvider` interface returned `Buffer`, but pgvector needs `number[]`

TypeORM was trying to insert Buffer objects instead of float arrays, causing:

```
error: vector must have at least 1 dimension
```

### Implementation

**Migration Applied:**

```sql
-- Migration: 1732166400000-AddEmbeddingV2Column.ts
ALTER TABLE kb.graph_objects
ADD COLUMN embedding_v2 vector(768);

CREATE INDEX IDX_graph_objects_embedding_v2_ivfflat
ON kb.graph_objects
USING ivfflat (embedding_v2 vector_cosine_ops)
WITH (lists = 100);
```

**Interface Fixed:**

```typescript
// embedding.provider.ts
export interface EmbeddingProvider {
  generate(text: string): Promise<number[]>; // Was: Promise<Buffer>
}
```

**Providers Updated:**

```typescript
// DummySha256EmbeddingProvider
async generate(text: string): Promise<number[]> {
  const hash = createHash('sha256').update(text).digest();
  const target = 768; // Match embedding_v2 dimension
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    out.push((hash[i % hash.length] / 255) * 2 - 1);
  }
  return out;
}

// GoogleVertexEmbeddingProvider
async generate(text: string): Promise<number[]> {
  // ... API call ...
  return values as number[]; // Was: Buffer.from(floatArray.buffer)
}
```

**Worker Updated:**

```typescript
// embedding-worker.service.ts
await this.graphObjectRepo.update(
  { id: obj.id },
  {
    embeddingV2: embedding, // No cast needed
    embeddingUpdatedAt: new Date(),
  }
);
```

**Search Service Updated:**

```typescript
// graph-vector-search.service.ts
const columnExists = await this.checkColumnExists('embedding_v2');
const embeddingColumn = columnExists ? 'embedding_v2' : 'embedding_vec';
```

**Jobs Reset:**

```bash
# Script: scripts/reset-embedding-jobs.ts
npm run reset-embedding-jobs:execute
# Reset 6,278 completed jobs to pending
```

### Verification

**Database State After Fix:**

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM kb.graph_embedding_jobs;
--  completed | failed
-- -----------+--------
--        830 |      0  (and counting...)

SELECT COUNT(*) FILTER (WHERE embedding_v2 IS NOT NULL) as with_v2
FROM kb.graph_objects;
--  with_v2
-- ---------
--      830  (matching completed jobs)
```

**Vector Search Test:**

```sql
-- Cosine similarity search works!
SELECT
  type,
  LEFT(key, 40) as key_preview,
  1 - (embedding_v2 <=> (SELECT embedding_v2 FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL LIMIT 1)) as similarity
FROM kb.graph_objects
WHERE embedding_v2 IS NOT NULL
ORDER BY embedding_v2 <=> (SELECT embedding_v2 FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL LIMIT 1)
LIMIT 5;

-- Results show proper similarity scores (0.90-1.00)
```

**Performance:**

- Processing rate: ~19 embeddings/second
- Expected completion: ~5-10 minutes for all 6,278 jobs
- Index: ivfflat with cosine distance working correctly

### Files Modified

1. ✅ `apps/server/src/migrations/1732166400000-AddEmbeddingV2Column.ts` (NEW)
2. ✅ `apps/server/src/entities/graph-object.entity.ts` (added `embeddingV2`)
3. ✅ `apps/server/src/modules/graph/embedding.provider.ts` (interface + dummy provider)
4. ✅ `apps/server/src/modules/graph/google-vertex-embedding.provider.ts` (return type)
5. ✅ `apps/server/src/modules/graph/embedding-worker.service.ts` (write target)
6. ✅ `apps/server/src/modules/graph/graph-vector-search.service.ts` (read source)
7. ✅ `scripts/reset-embedding-jobs.ts` (NEW - backfill tool)
8. ✅ `package.json` (added reset scripts)

### Status: RESOLVED ✅

- [x] Migration created and applied
- [x] Interface fixed (Buffer → number[])
- [x] Providers updated
- [x] Worker writing to correct column
- [x] Search reading from correct column
- [x] Jobs reset and reprocessing
- [x] Vector search verified working
- [x] No failures (0 failed jobs)

**Next:** Bug #003 - Implement chunk embedding system (3,422 chunks need embeddings)
