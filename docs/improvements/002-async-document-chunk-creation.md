# Async Document Chunk Creation

**Status**: Proposed  
**Category**: Performance, UX  
**Priority**: High  
**Created**: 2025-11-19

## Current State

### Problem

When users upload documents, they experience a delay before the document appears in the table because chunk creation is synchronous:

1. User uploads document via `POST /api/ingest/upload`
2. `IngestionService.ingestText()` creates document + ALL chunks in one transaction
3. User waits for entire operation (can take several seconds for large documents)
4. Document appears in table only after all chunks are created

**Impact**:

- Poor UX: Users wait with no feedback during chunk creation
- Perceived slowness: Upload feels slow even though file transfer is instant
- No visibility into progress: Users don't know if upload succeeded until chunks finish

### Current Implementation

**File**: `apps/server/src/modules/ingestion/ingestion.service.ts:240-676`

The `ingestText` method performs these steps synchronously in a single transaction:

1. Validate project
2. Check for duplicate (hash or content)
3. **INSERT document**
4. **Loop through chunks and INSERT each one** (lines 490-602)
5. **Generate embeddings for each chunk** (optional)
6. COMMIT transaction
7. Create extraction job (if auto-extract enabled)

**Critical Code Path**: Lines 354-624 - Everything happens in one transaction with explicit BEGIN/COMMIT.

## Proposed Improvement

### Goals

- Document appears in table **immediately** after upload
- Chunk creation happens **asynchronously** in background
- User sees **real-time status** of chunk generation
- No breaking changes to existing API contracts

### Solution Design

#### 1. Database Schema Change ✅ DONE

Add `chunk_status` field to track chunk generation state:

```sql
ALTER TABLE kb.documents
ADD COLUMN chunk_status VARCHAR(20) DEFAULT 'pending' NOT NULL;
```

**Possible values**:

- `pending`: Document created, chunks not started
- `processing`: Chunks being generated
- `completed`: All chunks created successfully
- `failed`: Chunk generation failed

**Migration**: `apps/server/src/migrations/*-add-chunk-status-to-documents.ts` ✅ Created

**Entity**: `apps/server/src/entities/document.entity.ts` ✅ Updated

#### 2. Refactor Ingestion Service (COMPLEX - NEEDS CAREFUL IMPLEMENTATION)

**Option A: Split into Two Methods** (Recommended)

Create two separate methods:

```typescript
// Create document immediately, return ID
async createDocumentOnly(params): Promise<string> {
  // INSERT document with chunk_status='pending'
  // Return documentId immediately
}

// Create chunks for existing document (background task)
async createChunksForDocument(documentId: string, text: string): Promise<void> {
  // Update chunk_status='processing'
  // Generate embeddings
  // INSERT chunks
  // Update chunk_status='completed' or 'failed'
  // Create extraction job if enabled
}
```

**Option B: Add `skipChunks` Parameter** (Simpler but less clean)

Modify existing `ingestText` to conditionally skip chunk creation:

```typescript
async ingestText({..., skipChunks = false}): Promise<IngestResult> {
  // ... existing document creation logic ...

  if (!skipChunks) {
    // ... existing chunk creation logic ...
  } else {
    // Set chunk_status='pending'
    // Return early with documentId
  }
}
```

**Challenges**:

- Transaction management is complex (explicit BEGIN/COMMIT)
- Feature detection logic (content_hash, embedding columns) is cached
- Deduplication logic checks both hash and content
- CTE-based INSERT pattern validates project existence atomically

**Risk**: HIGH - This is a critical ingestion path with complex transaction logic. Changes could break:

- Deduplication (allowing duplicate documents)
- Data integrity (partial inserts)
- RLS policy enforcement
- Auto-extraction trigger logic

#### 3. Update Controller

**File**: `apps/server/src/modules/ingestion/ingestion.controller.ts:152-194`

Modify `upload` endpoint to:

```typescript
async upload(@Body() dto: IngestionUploadDto, @UploadedFile() file) {
  const documentId = await this.ingestion.createDocumentOnly({...});

  // Fire-and-forget async chunk creation
  setImmediate(() => {
    this.ingestion.createChunksForDocument(documentId, text)
      .catch(err => this.logger.error(`Chunk creation failed for ${documentId}:`, err));
  });

  return {
    documentId,
    chunks: 0, // Not created yet
    alreadyExists: false,
    chunkStatus: 'pending'
  };
}
```

**Alternative**: Use NestJS `@OnEvent()` or BullMQ for proper job queue (more robust, but requires infrastructure).

#### 4. Update Frontend

**File**: `apps/admin/src/pages/admin/apps/documents/index.tsx`

**Changes needed**:

1. **Add `chunkStatus` field to DocumentRow type** (line 24-48)
2. **Update table column to show status** (line 664-676)

```tsx
{
  key: 'chunks',
  label: 'Chunks',
  sortable: true,
  render: (doc) => {
    if (doc.chunkStatus === 'processing') {
      return (
        <div className="flex items-center gap-2">
          <span className="loading loading-spinner loading-xs" />
          <span className="text-sm text-base-content/70">Generating...</span>
        </div>
      );
    }
    if (doc.chunkStatus === 'pending') {
      return (
        <span className="text-sm text-base-content/70">Pending...</span>
      );
    }
    if (doc.chunkStatus === 'failed') {
      return (
        <span className="text-sm text-error">Failed</span>
      );
    }
    return (
      <a
        href={`/admin/apps/chunks?docId=${doc.id}`}
        className="badge badge-outline hover:underline no-underline"
        title="View chunks for this document"
      >
        {doc.chunks}
      </a>
    );
  },
}
```

3. **Add polling to refresh documents with pending/processing status**

```tsx
useEffect(() => {
  if (!data) return;

  const hasProcessing = data.some(doc =>
    doc.chunkStatus === 'pending' || doc.chunkStatus === 'processing'
  );

  if (!hasProcessing) return;

  const interval = setInterval(() => {
    // Refresh document list silently (no loading spinner)
    fetchJson<DocumentRow[]>(`${apiBase}/api/documents`, {...})
      .then(docs => setData(docs.map(normalize)));
  }, 2000); // Poll every 2 seconds

  return () => clearInterval(interval);
}, [data]);
```

#### 5. Update Document DTO

**File**: `apps/server/src/modules/documents/dto/document.dto.ts`

Add `chunkStatus` field to DTO:

```typescript
@ApiProperty({
  description: 'Status of chunk generation',
  enum: ['pending', 'processing', 'completed', 'failed'],
})
chunkStatus: 'pending' | 'processing' | 'completed' | 'failed';
```

## Implementation Plan

### Phase 1: Schema & Entity ✅ DONE

- [x] Create migration for `chunk_status` column
- [x] Update `Document` entity with new field
- [ ] Run migration: `npm run migration:run`

### Phase 2: Service Refactor (HIGH RISK)

- [ ] **Option A**: Split `ingestText` into `createDocumentOnly` + `createChunksForDocument`
- [ ] **Option B**: Add `skipChunks` parameter to `ingestText`
- [ ] Add comprehensive tests for new methods
- [ ] Test deduplication still works
- [ ] Test RLS policies still enforced
- [ ] Test auto-extraction still triggers

### Phase 3: Controller Update

- [ ] Modify `upload` endpoint to use new async pattern
- [ ] Add error handling for background chunk creation
- [ ] Update API response to include `chunkStatus`

### Phase 4: Frontend Update

- [ ] Add `chunkStatus` to DocumentRow type
- [ ] Update chunks column to show status indicators
- [ ] Add polling mechanism for documents with pending/processing status
- [ ] Test user experience with large documents

### Phase 5: Testing

- [ ] Unit tests for new service methods
- [ ] Integration tests for async flow
- [ ] E2E test for upload → immediate display → chunks complete
- [ ] Load test with multiple concurrent uploads

## Success Metrics

- **Time to Document Visible**: < 500ms (currently 2-10 seconds for large docs)
- **User Perception**: Document appears immediately after upload
- **System Load**: No increase in database connections or memory usage
- **Reliability**: 99.9% of chunk creation jobs complete successfully

## Alternatives Considered

### 1. Use BullMQ Job Queue (ROBUST)

**Pros**:

- Proper job queue with retries, failure handling, progress tracking
- Can scale to multiple workers
- Built-in monitoring and admin UI

**Cons**:

- Requires Redis infrastructure
- More complexity (queue management, worker processes)
- Overkill for current scale

**Decision**: Defer until we have > 1000 documents/day

### 2. Keep Current Synchronous Approach (NO CHANGE)

**Pros**:

- No risk of breaking existing functionality
- Simpler code

**Cons**:

- Poor UX (users wait)
- Perceived as slow

**Decision**: Not acceptable - UX is important

### 3. Use Database-Level Job Queue (MIDDLE GROUND)

**Pros**:

- No external dependencies (uses Postgres)
- Pattern already exists in `embedding-jobs.service.ts` with `FOR UPDATE SKIP LOCKED`
- Reliable with retries

**Cons**:

- Need to create jobs table
- Need worker process to poll jobs
- More complex than simple async

**Decision**: Consider if simple async approach doesn't work

## Risk Assessment

### HIGH RISK AREAS

1. **Transaction Management**

   - Current code uses explicit BEGIN/COMMIT with rollback logic
   - Splitting this could break atomicity guarantees
   - **Mitigation**: Extensive testing, keep document creation in its own transaction

2. **Deduplication Logic**

   - Content hash checking must happen BEFORE document creation
   - If we create document first, we could get duplicates
   - **Mitigation**: Keep dedup check in the "create document" phase

3. **RLS Policy Enforcement**

   - Policies rely on tenant context being set
   - Background tasks might lose context
   - **Mitigation**: Ensure `withTenantContext` is called in async chunk creation

4. **Auto-Extraction Trigger**
   - Currently happens after chunks are created
   - If chunks are async, when does extraction start?
   - **Mitigation**: Trigger extraction after chunk_status='completed'

### TESTING REQUIREMENTS

- [ ] Test with empty documents (edge case)
- [ ] Test with large documents (1000+ chunks)
- [ ] Test concurrent uploads (race conditions)
- [ ] Test duplicate detection still works
- [ ] Test error handling (what if chunk creation fails?)
- [ ] Test RLS policies (ensure background task respects org/project isolation)

## Rollback Plan

If issues arise after deployment:

1. **Immediate**: Feature flag to disable async behavior (fall back to sync)
2. **Short-term**: Revert controller changes, keep using synchronous `ingestText`
3. **Database**: Keep `chunk_status` column (no harm), set to 'completed' for all docs

## Recommendation

**DO NOT IMPLEMENT** until we have:

1. Comprehensive test coverage of ingestion service
2. Staging environment to test full flow
3. Ability to feature-flag the change
4. Monitoring of chunk creation success rate

**ALTERNATIVE SHORT-TERM FIX**:

- Add progress indicator during upload: "Uploading and processing..." with spinner
- Keep synchronous behavior but improve perceived performance with better UX

This is the safer approach until we have proper job queue infrastructure.

## Related Documents

- `apps/server/src/modules/ingestion/ingestion.service.ts` - Current implementation
- `apps/server/src/modules/graph/embedding-jobs.service.ts` - Example of database-level job queue pattern
- `docs/testing/AI_AGENT_GUIDE.md` - Testing guidelines
