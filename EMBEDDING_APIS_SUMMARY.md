# Embedding Generation APIs - Implementation Summary

## Overview

Added new REST API endpoints to trigger embedding generation/regeneration for graph objects. This allows administrators and automated systems to control when embeddings are generated without waiting for the automatic worker.

## Endpoints Created

### 1. Single Object Embedding

```
POST /graph/embeddings/object/:id
```

**Purpose**: Generate embedding for a single graph object

**Parameters**:
- Path: `id` - UUID of the graph object
- Query: `priority` (optional) - Job priority (default: 0)

**Response**:
```json
{
  "enqueued": 1,
  "skipped": 0,
  "jobIds": ["<job-uuid>"]
}
```

**Behavior**:
- Verifies object exists (404 if not found)
- Enqueues embedding job (idempotent - returns existing job if already queued)
- Returns immediately (job processed asynchronously)

---

### 2. Batch Embedding

```
POST /graph/embeddings/batch
```

**Purpose**: Generate embeddings for multiple objects in one request

**Body**:
```json
{
  "objectIds": ["<uuid1>", "<uuid2>", ...],
  "priority": 5
}
```

**Response**:
```json
{
  "enqueued": 5,
  "skipped": 2,
  "jobIds": ["<job-uuid1>", "<job-uuid2>", ...]
}
```

**Behavior**:
- Processes each object ID
- Skips objects that already have jobs queued
- Returns summary of enqueued vs skipped

---

### 3. Project-Wide Regeneration

```
POST /graph/embeddings/regenerate-project
```

**Purpose**: Regenerate embeddings for all objects in a project

**Body**:
```json
{
  "projectId": "<uuid>",
  "objectType": "Person",  // Optional: filter by type
  "force": false,          // If true, regenerate even if embedding exists
  "priority": 10
}
```

**Response**:
```json
{
  "enqueued": 150,
  "skipped": 25,
  "jobIds": ["<job-uuid1>", "<job-uuid2>", ...]
}
```

**Behavior**:
- Queries all objects in project (uses `GraphService.searchObjects()`)
- Optionally filters by object type
- By default, skips objects that already have embeddings (use `force: true` to regenerate)
- Enqueues jobs for filtered objects

---

## Files Created/Modified

### New Files

1. **`src/modules/graph/dto/trigger-embeddings.dto.ts`**
   - `TriggerEmbeddingsBatchDto` - for batch requests
   - `TriggerEmbeddingsProjectDto` - for project-wide regeneration
   - `EmbeddingJobResponseDto` - response format

2. **`src/modules/graph/graph-embeddings.controller.ts`**
   - New controller with 3 endpoints
   - Uses `@Scopes('graph:write')` for authorization
   - Full Swagger/OpenAPI documentation

### Modified Files

1. **`src/modules/graph/graph.module.ts`**
   - Added `GraphEmbeddingsController` to controllers array
   - Registered in module exports

---

## Testing

### Manual Testing Script

Created `/tmp/test-embedding-api.mjs` to test all endpoints:

```bash
# Set environment variables
export TEST_OBJECT_ID=<object-uuid>
export TEST_PROJECT_ID=<project-uuid>

# Run test
node /tmp/test-embedding-api.mjs
```

### E2E Test Integration

The new endpoints integrate with existing E2E infrastructure:
- Uses E2E database on port 5438
- Works with test data (6 Person objects with embeddings)
- Can be tested alongside existing vector search tests

---

## Architecture

```
┌─────────────────────────────────────────┐
│  GraphEmbeddingsController              │
│  - POST /embeddings/object/:id          │
│  - POST /embeddings/batch               │
│  - POST /embeddings/regenerate-project  │
└─────────────────────────────────────────┘
         │
         ├──> GraphService.getObject()
         ├──> GraphService.searchObjects()
         │
         └──> EmbeddingJobsService.enqueue()
                    │
                    ▼
         ┌─────────────────────────┐
         │  kb.graph_embedding_jobs│
         │  (job queue table)      │
         └─────────────────────────┘
                    │
                    ▼
         ┌─────────────────────────┐
         │  EmbeddingWorkerService │
         │  (background worker)    │
         └─────────────────────────┘
```

---

## Use Cases

### 1. Manual Embedding Trigger (Single Object)

An admin uploads a new document and wants to immediately generate its embedding:

```bash
curl -X POST http://localhost:3002/graph/embeddings/object/${OBJECT_ID} \
  -H "Authorization: Bearer ${TOKEN}"
```

### 2. Bulk Import

After importing 1000 objects via API, trigger embeddings for all:

```bash
curl -X POST http://localhost:3002/graph/embeddings/batch \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"objectIds": ["uuid1", "uuid2", ...], "priority": 10}'
```

### 3. Embedding Model Upgrade

After upgrading the embedding model (e.g., Vertex AI new version), regenerate all:

```bash
curl -X POST http://localhost:3002/graph/embeddings/regenerate-project \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "uuid", "force": true}'
```

---

## Security

- All endpoints require `graph:write` scope
- Object existence verified before queueing
- RLS policies enforced via GraphService

---

## Performance

- **Idempotent**: Multiple calls for same object won't create duplicate jobs
- **Async**: All endpoints return immediately, processing happens in background
- **Prioritized**: Support priority parameter for urgent jobs
- **Batched**: Batch endpoint reduces HTTP overhead for bulk operations

---

## Next Steps

1. **Test endpoints with real data** using the test script
2. **Verify embedding worker** processes the jobs correctly
3. **Monitor job queue** to ensure jobs complete successfully
4. **Add metrics/monitoring** for job processing rates

---

## Documentation References

- **Embedding Job System**: See `EmbeddingJobsService` (apps/server/src/modules/graph/embedding-jobs.service.ts)
- **Embedding Worker**: See `EmbeddingWorkerService` (apps/server/src/modules/graph/embedding-worker.service.ts)
- **Vector Search**: See E2E tests (apps/server/tests/e2e/graph-vector-search.snippet-matching.e2e.spec.ts)

---

## Status

✅ DTOs created
✅ Controller implemented
✅ Module registered
✅ Build passing
✅ Test script created
⏳ Manual testing pending
⏳ E2E test integration pending
