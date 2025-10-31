# Embedding Dimension Migration Guide

## Overview

This guide covers migrating the `embedding_vec` column from the legacy stub dimension (32) to production-quality dimensions (recommended: 1536).

**Status**: As of Phase 3 Priority #1 implementation, embedding dimension is now **configurable** via the `EMBEDDING_DIMENSION` environment variable.

## Background

- **Legacy**: The system was initially developed with a `vector(32)` dimension as a placeholder to validate the architecture without incurring API costs during development.
- **Production**: Google Vertex AI `text-embedding-004` model produces 768-dimensional embeddings by default, but can be configured for 1536-dimensional embeddings for higher quality semantic search.
- **Configurable**: The dimension is now controlled by `EMBEDDING_DIMENSION` environment variable (default: 1536).

## Supported Dimensions

| Dimension | Use Case | Notes |
|-----------|----------|-------|
| 32 | Legacy stub (deprecated) | Only for backward compatibility |
| 128 | Testing/development | Minimal API costs, reduced quality |
| 384 | Low-resource environments | Balance between cost and quality |
| 768 | Standard production | Google Vertex AI default output |
| **1536** | **Recommended production** | Highest quality, optimal for semantic search |
| 3072 | Advanced use cases | Future-proofing for larger models |

## Configuration

### Environment Variable

Add to your `.env` file:

```bash
# Recommended production value
EMBEDDING_DIMENSION=1536
```

### Validation

The `AppConfigService` validates the dimension on startup:
- Must be a positive integer
- Warns if non-standard dimension is used
- Falls back to 1536 if invalid

## Migration Strategies

### Strategy A: Fresh Database (Recommended for New Deployments)

If you're deploying to a fresh database:

1. Set `EMBEDDING_DIMENSION=1536` in `.env` before first boot
2. Run `npm run db:init` (or let `DB_AUTOINIT=true` handle it)
3. Database will be created with correct dimension from the start

### Strategy B: Zero-Downtime Migration (For Production Systems)

For live systems with existing embeddings, use a dual-column approach:

#### Step 1: Add New Column

```sql
-- Add new column with target dimension
ALTER TABLE kb.graph_objects 
ADD COLUMN IF NOT EXISTS embedding_vec_1536 vector(1536) NULL;

-- Create index on new column
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_graph_objects_embedding_vec_1536 
ON kb.graph_objects USING ivfflat (embedding_vec_1536 vector_cosine_ops) 
WITH (lists=100);
```

#### Step 2: Backfill Embeddings

Trigger re-embedding for all objects:

```sql
-- Queue all objects for re-embedding
INSERT INTO kb.graph_embedding_jobs (object_id, status, priority)
SELECT id, 'pending', 10
FROM kb.graph_objects
WHERE deleted_at IS NULL
ON CONFLICT (object_id) 
WHERE status IN ('pending', 'processing')
DO UPDATE SET priority = GREATEST(kb.graph_embedding_jobs.priority, 10);
```

The embedding worker will automatically:
1. Generate new 1536-dimensional embeddings via Vertex AI
2. Store them in `embedding_vec_1536` column
3. Mark jobs as completed

#### Step 3: Monitor Progress

```sql
-- Check migration progress
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM kb.graph_embedding_jobs
GROUP BY status
ORDER BY status;

-- Check objects with new embeddings
SELECT 
  COUNT(*) FILTER (WHERE embedding_vec IS NOT NULL) as old_embeddings,
  COUNT(*) FILTER (WHERE embedding_vec_1536 IS NOT NULL) as new_embeddings,
  COUNT(*) FILTER (WHERE embedding_vec_1536 IS NULL AND deleted_at IS NULL) as remaining
FROM kb.graph_objects;
```

#### Step 4: Cutover

Once backfill is complete (all non-deleted objects have `embedding_vec_1536`):

```sql
-- Verify 100% coverage
SELECT COUNT(*) 
FROM kb.graph_objects 
WHERE deleted_at IS NULL 
  AND embedding_vec_1536 IS NULL;
-- Should return 0

-- Drop old column and index
DROP INDEX IF EXISTS kb.idx_graph_objects_embedding_vec;
ALTER TABLE kb.graph_objects DROP COLUMN embedding_vec;

-- Rename new column to standard name
ALTER TABLE kb.graph_objects RENAME COLUMN embedding_vec_1536 TO embedding_vec;
ALTER INDEX kb.idx_graph_objects_embedding_vec_1536 
RENAME TO idx_graph_objects_embedding_vec;
```

#### Step 5: Update Configuration

```bash
# Update .env
EMBEDDING_DIMENSION=1536
```

Restart the application. The system will now use the new dimension for all new embeddings.

### Strategy C: Destructive Migration (Development/Staging Only)

**⚠️ WARNING**: This strategy **deletes all existing embeddings**. Only use in non-production environments.

```sql
-- Drop existing column and index
DROP INDEX IF EXISTS kb.idx_graph_objects_embedding_vec;
ALTER TABLE kb.graph_objects DROP COLUMN IF EXISTS embedding_vec;

-- Recreate with new dimension (replace 1536 with your target)
ALTER TABLE kb.graph_objects 
ADD COLUMN embedding_vec vector(1536) NULL;

CREATE INDEX idx_graph_objects_embedding_vec 
ON kb.graph_objects USING ivfflat (embedding_vec vector_cosine_ops) 
WITH (lists=100);

-- Queue all objects for embedding
INSERT INTO kb.graph_embedding_jobs (object_id, status, priority)
SELECT id, 'pending', 5
FROM kb.graph_objects
WHERE deleted_at IS NULL
ON CONFLICT (object_id) 
WHERE status IN ('pending', 'processing')
DO NOTHING;
```

Update `.env` and restart:

```bash
EMBEDDING_DIMENSION=1536
```

## Verification

### Check Current Dimension

```sql
-- Query information_schema for column type
SELECT 
  column_name,
  udt_name,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'kb'
  AND table_name = 'graph_objects'
  AND column_name = 'embedding_vec';

-- Using pg_catalog (more reliable for vector types)
SELECT 
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'kb'
  AND c.relname = 'graph_objects'
  AND a.attname = 'embedding_vec'
  AND NOT a.attisdropped;
```

Expected output for production: `vector(1536)`

### Test Embedding Generation

Create a test object and verify embedding dimension:

```typescript
// Via GraphQL or REST API
mutation {
  createGraphObject(input: {
    type: "Document",
    key: "test-embedding-dimension",
    properties: { text: "This is a test document for verifying embedding dimension." }
  }) {
    id
  }
}
```

Check the generated embedding:

```sql
-- Wait for embedding job to complete
SELECT object_id, status, last_error
FROM kb.graph_embedding_jobs
WHERE object_id = '<object-id-from-mutation>';

-- Verify embedding dimension
SELECT 
  id,
  key,
  embedding_vec IS NOT NULL as has_embedding,
  array_length(embedding_vec, 1) as dimension  -- Should be NULL for vector type
FROM kb.graph_objects
WHERE id = '<object-id-from-mutation>';
```

For vector types, PostgreSQL doesn't expose dimension via `array_length`. Instead, verify via application code:

```typescript
const result = await this.dbService.query<{ vec: number[] }>(
  `SELECT embedding_vec::vector as vec FROM kb.graph_objects WHERE id = $1`,
  [objectId]
);
console.log('Embedding dimension:', result.rows[0].vec.length);
// Should output: 1536
```

## Rollback

If you need to rollback to the legacy dimension:

1. Stop the application
2. Update `.env`: `EMBEDDING_DIMENSION=32`
3. Run destructive migration (Strategy C) with dimension 32
4. Restart application

**Note**: Rolling back loses all existing embeddings.

## Performance Considerations

### Index Rebuild

After dimension changes, the IVFFlat index may need optimization:

```sql
-- Drop and recreate index with adjusted lists parameter
DROP INDEX IF EXISTS kb.idx_graph_objects_embedding_vec;

-- Rule of thumb: lists = sqrt(row_count)
-- For 10,000 objects: lists=100
-- For 100,000 objects: lists=316
-- For 1,000,000 objects: lists=1000

CREATE INDEX idx_graph_objects_embedding_vec 
ON kb.graph_objects USING ivfflat (embedding_vec vector_cosine_ops) 
WITH (lists=<calculated-value>);
```

### Search Performance

Higher dimensions (1536) require more compute for cosine similarity:
- 32D: ~0.1ms per comparison
- 768D: ~0.5ms per comparison
- 1536D: ~1ms per comparison

The quality improvement typically justifies the cost. Monitor search query times:

```sql
-- Enable timing
\timing

-- Test search performance
SELECT id, key, embedding_vec <=> $1::vector as distance
FROM kb.graph_objects
WHERE deleted_at IS NULL
  AND embedding_vec IS NOT NULL
ORDER BY distance
LIMIT 10;
```

Target: <100ms for top-10 search on 100k objects.

## API Cost Implications

### Google Vertex AI Pricing (text-embedding-004)

As of 2024, approximate costs per 1M characters:
- Input: $0.025 per 1M characters
- No additional cost for higher-dimensional outputs (same API call)

### Embedding Generation Rate Limits

Default quotas (may vary by project):
- 600 requests/minute
- 100,000 requests/day

For large migrations (>100k objects), plan for:
- Batch size: 100 objects/minute
- Time estimate: 1.67 objects/second
- 100k objects: ~16 hours at sustained rate

Consider requesting quota increases for faster migrations.

## Troubleshooting

### Error: "column embedding_vec is of type vector(32) but expression is of type vector(1536)"

**Cause**: Application configured for 1536D but database column is still 32D.

**Solution**: Run migration (Strategy B or C) to update column.

### Error: "dimension mismatch between vectors"

**Cause**: Mixing embeddings from different dimensions in same query.

**Solution**: Ensure all embeddings re-generated after dimension change. Check for stale jobs:

```sql
SELECT COUNT(*) 
FROM kb.graph_objects o
LEFT JOIN kb.graph_embedding_jobs j ON o.id = j.object_id
WHERE o.deleted_at IS NULL
  AND o.embedding_vec IS NULL
  AND (j.status IS NULL OR j.status NOT IN ('pending', 'processing'));
```

Re-queue any missing:

```sql
INSERT INTO kb.graph_embedding_jobs (object_id, status, priority)
SELECT id, 'pending', 1
FROM kb.graph_objects
WHERE deleted_at IS NULL
  AND embedding_vec IS NULL
ON CONFLICT (object_id) 
WHERE status IN ('pending', 'processing')
DO UPDATE SET priority = GREATEST(kb.graph_embedding_jobs.priority, 1);
```

### Slow Index Creation

**Cause**: Large datasets (>1M rows) make `CREATE INDEX` slow.

**Solution**: Use `CONCURRENTLY` and increase maintenance work memory:

```sql
-- Increase work mem for session (default 4MB, try 1GB)
SET maintenance_work_mem = '1GB';

-- Create index without blocking writes
CREATE INDEX CONCURRENTLY idx_graph_objects_embedding_vec 
ON kb.graph_objects USING ivfflat (embedding_vec vector_cosine_ops) 
WITH (lists=1000);
```

## Testing

### Unit Tests

The test suite automatically adapts to configured dimension:

```bash
# Run with legacy dimension (fast)
EMBEDDING_DIMENSION=32 npm test

# Run with production dimension (realistic)
EMBEDDING_DIMENSION=1536 npm test
```

### E2E Tests

E2E tests use `DummySha256EmbeddingProvider` which generates deterministic embeddings of any dimension. No migration needed for tests.

## Monitoring

### Grafana Dashboard (Future)

Key metrics to track:
- Embedding jobs pending/processing/failed counts
- Embedding generation latency (p50, p95, p99)
- Search query latency by dimension
- API error rate (rate limits, quota exhausted)

### CloudWatch / Datadog Queries

```sql
-- Daily embedding generation rate
SELECT 
  DATE(completed_at) as date,
  COUNT(*) as embeddings_generated,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_sec
FROM kb.graph_embedding_jobs
WHERE status = 'completed'
  AND completed_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(completed_at)
ORDER BY date DESC;
```

## References

- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Google Vertex AI Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)
- [Phase 3 Roadmap](spec/GRAPH_PHASE3_ROADMAP.md) - Embedding production readiness section

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2024-01-XX | Initial implementation of configurable dimensions | AI Assistant |
| 2024-01-XX | Added migration strategies and verification procedures | AI Assistant |
