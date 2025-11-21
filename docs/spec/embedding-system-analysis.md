# Embedding System Analysis: Why Chunks Have No Embeddings

**Date:** 2024-11-21  
**Status:** Critical Issue Identified  
**Impact:** 0% of chunks have embeddings (3,422 chunks, all NULL)

## Executive Summary

We discovered that document chunks have **no embeddings** despite being chunked and stored. This is blocking our smart extraction strategy which relies on vector similarity search over chunks.

**Root Cause:** There is **no system to generate embeddings for chunks**. The embedding infrastructure only exists for graph objects, not for document chunks.

## Current State

### What Exists

1. **Chunks Table (`kb.chunks`)**

   - Schema: `id, document_id, chunk_index, text, embedding (vector(768)), tsv, created_at`
   - Chunks ARE being created correctly (3,422 chunks exist)
   - `embedding` column exists but is always NULL
   - Created by `IngestionService.ingestText()`

2. **Graph Object Embeddings (Working)**

   - Table: `kb.graph_embedding_jobs`
   - Columns: `id, object_id, status, attempt_count, priority, ...`
   - Service: `EmbeddingJobsService` + `EmbeddingWorkerService`
   - **Only handles graph objects, NOT chunks**

3. **Embedding Generation Infrastructure**
   - `EmbeddingsService` - Can generate embeddings (Gemini text-embedding-004)
   - `EmbeddingWorkerService` - Background worker that processes jobs
   - `EmbeddingJobsService` - Job queue management
   - **All focused on `graph_objects` table only**

### What's Missing

**No embedding job system for chunks:**

- No `chunk_embedding_jobs` table
- No code to enqueue chunk embedding jobs
- No worker to process chunk embeddings
- Chunks are created with `embedding = NULL` and stay that way forever

## Architecture Gap

```
Document Ingestion Flow (Current):
================================
1. Document created → IngestionService.ingestText()
2. Text chunked → ChunkerService
3. Chunks inserted → INSERT INTO kb.chunks (text, embedding=NULL)
4. ❌ No embedding jobs created
5. ❌ No worker processes chunk embeddings
6. Result: Chunks have text but no embeddings

Graph Object Flow (Working):
============================
1. Extraction job creates objects → GraphObject created
2. EmbeddingPolicyService checks if object needs embedding
3. EmbeddingJobsService.enqueue(objectId) creates job
4. EmbeddingWorkerService processes job
5. Worker generates embedding → Updates graph_objects.embedding
6. Result: Objects have embeddings ✓
```

## Impact on Smart Extraction

Our designed strategy depends on chunk embeddings:

```typescript
// PROPOSED STRATEGY (Currently Impossible):
// ==========================================

// 1. Get document chunks
const chunks = await getChunksForDocument(documentId);

// 2. Search for entities similar to chunks (BLOCKED!)
const relevantEntities = await vectorSearch({
  chunkEmbeddings: chunks.map((c) => c.embedding), // ❌ ALL NULL
  entityType: 'Person',
  limit: 50,
});

// 3. Inject relevant entities into extraction prompt
const prompt = buildExtractionPrompt({
  chunks: chunks.map((c) => c.text),
  existingEntities: relevantEntities, // ❌ Can't find relevant ones
});
```

**Current Reality:**

- Chunks have text ✓
- Chunks have NO embeddings ❌
- Cannot perform vector similarity search ❌
- Cannot identify relevant existing entities ❌
- Must fall back to "dumb" extraction (no context) ❌

## Data Verification

```sql
-- Chunks: 3,422 total, 0 with embeddings
SELECT COUNT(*),
       COUNT(embedding) as with_embeddings,
       (COUNT(embedding) * 100.0 / COUNT(*)) as percentage
FROM kb.chunks;

-- Result:
--  count | with_embeddings | percentage
-- -------+-----------------+------------
--   3422 |               0 |       0.00

-- Graph Objects: 5,995 total, 0 with embeddings (separate issue)
SELECT COUNT(*),
       COUNT(embedding_vec) as with_embeddings
FROM kb.graph_objects;

-- Result:
--  count | with_embeddings
-- -------+-----------------
--   5995 |               0
```

## Solution Options

### Option 1: Extend Existing System (Recommended)

**Approach:** Reuse graph embedding infrastructure for chunks

**Changes Required:**

1. Modify `graph_embedding_jobs` table to support chunks:

   ```sql
   ALTER TABLE kb.graph_embedding_jobs
   ADD COLUMN source_type TEXT DEFAULT 'object';

   ALTER TABLE kb.graph_embedding_jobs
   RENAME COLUMN object_id TO source_id;

   -- source_type: 'object' | 'chunk'
   ```

2. Update `EmbeddingJobsService` to handle chunks
3. Update `EmbeddingWorkerService` to process chunk jobs
4. Trigger job creation in `IngestionService` after chunk insertion

**Pros:**

- Reuses existing infrastructure
- Single worker handles all embeddings
- Consistent job management
- Minimal new code

**Cons:**

- Migration required for existing jobs
- Mixing two concerns in one table

### Option 2: Separate Chunk Embedding System

**Approach:** Create parallel system for chunks

**Changes Required:**

1. New table: `kb.chunk_embedding_jobs`
2. New service: `ChunkEmbeddingJobsService`
3. New worker: `ChunkEmbeddingWorkerService` (or extend existing)
4. Trigger job creation in `IngestionService`

**Pros:**

- Clean separation of concerns
- No migration needed
- Easier to optimize per use case

**Cons:**

- Code duplication
- Two workers to manage
- More complexity

### Option 3: Inline Embedding Generation (Not Recommended)

**Approach:** Generate embeddings during ingestion

**Changes Required:**

1. In `IngestionService.ingestText()`:
   ```typescript
   for (const chunk of chunks) {
     const embedding = await this.embeddings.embedQuery(chunk.text);
     await insertChunk({ text: chunk.text, embedding });
   }
   ```

**Pros:**

- Simple, immediate results
- No job queue needed

**Cons:**

- Blocks ingestion (slow)
- No retry logic
- Not scalable (blocks users)
- No priority management

## Recommendation

**Choose Option 1: Extend Existing System**

**Rationale:**

1. **Proven Infrastructure:** Embedding worker already works for objects
2. **Unified Management:** Single job queue, single worker, one monitoring dashboard
3. **Consistent Behavior:** Same retry logic, priority handling, rate limiting
4. **Scalability:** Same worker can be scaled horizontally
5. **Migration Path:** Clean upgrade path for existing jobs

**Implementation Plan:**

1. Create migration to update `graph_embedding_jobs` schema
2. Update `EmbeddingJobsService` to support `source_type` parameter
3. Update `EmbeddingWorkerService` to fetch from `chunks` or `graph_objects` based on `source_type`
4. Add chunk embedding job creation in `IngestionService`
5. Backfill existing chunks (one-time script)

## Next Steps

1. **Fix Graph Object Embeddings First**

   - Investigate why graph objects also have 0% embeddings
   - Verify embedding worker is running
   - Check for provider configuration issues
   - Test with a single object

2. **Implement Chunk Embedding System**

   - Follow Option 1 recommendation
   - Create migration
   - Update services
   - Test with small dataset

3. **Backfill Existing Data**

   - Create script to enqueue jobs for 3,422 existing chunks
   - Create script to enqueue jobs for 5,995 existing graph objects
   - Monitor progress

4. **Enable Smart Extraction**
   - Once embeddings exist, implement vector search
   - Build context-aware extraction
   - Test with Bible v2 enrichment

## Files Involved

**Existing:**

- `apps/server/src/modules/graph/embedding-jobs.service.ts` - Job queue management
- `apps/server/src/modules/graph/embedding-worker.service.ts` - Background worker
- `apps/server/src/modules/embeddings/embeddings.service.ts` - Embedding generation
- `apps/server/src/modules/ingestion/ingestion.service.ts` - Document chunking
- `apps/server/src/entities/chunk.entity.ts` - Chunk schema
- `apps/server/src/entities/graph-embedding-job.entity.ts` - Job schema

**To Create:**

- Migration: `apps/server/migrations/NNNN_add_chunk_embedding_support.ts`
- Script: `scripts/backfill-chunk-embeddings.ts`
- Script: `scripts/backfill-object-embeddings.ts`

## References

- [Search-Based Context Injection](./search-based-context-injection.md) - Depends on chunk embeddings
- [Smart Extraction Summary](./SMART_EXTRACTION_SUMMARY.md) - Overall strategy
- [Context-Aware Extraction Design](./context-aware-extraction-design.md) - Implementation plan
