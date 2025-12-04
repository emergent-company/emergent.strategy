# Design: Multi-Document Upload

## Context

The current ingestion API (`POST /api/ingest/upload`) processes a single file per request. Users uploading multiple documents must wait for each upload to complete before starting the next. The frontend currently uses a custom drag-and-drop zone with manual file input handling (not FilePond for the main upload flow).

**Constraints:**

- Maximum file size: 10MB per file (existing limit)
- Accepted types: PDF, DOCX, PPTX, XLSX, TXT, MD, HTML (existing)
- Each document requires: chunking, embedding generation, duplicate detection
- API calls to Google Gemini for embeddings are rate-limited

## Goals / Non-Goals

**Goals:**

- Allow users to select and upload multiple files in a single interaction
- Provide clear progress feedback for each file in the batch
- Handle partial failures gracefully (some succeed, some fail)
- Maintain backward compatibility with single-file upload

**Non-Goals:**

- Folder/directory upload (future enhancement)
- Zip file extraction (future enhancement)
- Background/async batch processing with job status polling
- Batch-level metadata tagging (future enhancement)

## Decisions

### 1. API Design: Separate Batch Endpoint vs Extended Single Endpoint

**Decision:** Create a new `POST /api/ingest/upload-batch` endpoint

**Alternatives considered:**

- Extend existing endpoint to accept multiple files: Would require breaking changes to response schema and client handling
- Use existing endpoint in loop from frontend: Already possible but doesn't provide batch-level results

**Rationale:** A dedicated endpoint provides:

- Clean separation of concerns
- Batch-specific response format with per-file results
- Ability to add batch-specific features (parallelism, retries) without affecting single-file flow

### 2. File Processing: Sequential vs Parallel

**Decision:** Process files with configurable parallelism (default: 3 concurrent)

**Rationale:**

- Sequential processing would be too slow for large batches
- Unlimited parallelism could overwhelm embedding API rate limits
- Configurable limit allows tuning based on deployment resources

**Implementation:**

```typescript
// Use p-limit or similar for concurrency control
const limit = pLimit(concurrencyLimit);
const results = await Promise.all(
  files.map((file) => limit(() => processFile(file)))
);
```

### 3. Response Format

**Decision:** Return structured array with per-file status

```typescript
interface BatchUploadResult {
  summary: {
    total: number;
    successful: number;
    duplicates: number;
    failed: number;
  };
  results: Array<{
    filename: string;
    status: 'success' | 'duplicate' | 'error';
    documentId?: string;
    chunks?: number;
    error?: string;
  }>;
}
```

**Rationale:** Enables frontend to display per-file status and summary statistics.

### 4. Frontend: Batch Progress UI

**Decision:** Use inline progress list within existing upload zone

**Alternatives considered:**

- Modal with progress list: Blocks other interactions
- Toast notifications per file: Too noisy for large batches
- Separate "Uploads" panel: Over-engineered for initial implementation

**Rationale:** Inline progress keeps upload status visible without blocking navigation or other actions.

### 5. Batch Size Limits

**Decision:** Limit to 20 files per batch

**Rationale:**

- Prevents accidental upload of entire directories
- Keeps request size reasonable for multipart handling
- Can be increased based on usage patterns

## Risks / Trade-offs

| Risk                                       | Impact | Mitigation                                                |
| ------------------------------------------ | ------ | --------------------------------------------------------- |
| Large batches timeout                      | High   | Enforce file count limit; frontend shows estimated time   |
| Embedding API rate limits exceeded         | Medium | Implement backoff in embedding service; limit parallelism |
| Partial failures confuse users             | Medium | Clear per-file status in UI; allow retry of failed files  |
| Memory pressure from multiple file buffers | Medium | Process files sequentially when memory constrained        |

## Open Questions

1. Should we add a "retry failed" button for partial batch failures?
2. Should batch uploads trigger auto-extraction for all files or let user configure per-batch?
3. Should we add a batch_id column to documents for future batch management features?

## Migration Plan

No migration required - this is a purely additive change. Existing single-file upload endpoint remains unchanged.
