# Document Upload Visibility Race Condition

**Status:** 🔍 Investigating  
**Date:** 2024-11-19  
**Type:** Bug  
**Severity:** High  
**Component:** Document Upload / Ingestion  
**Related:** apps/server/src/modules/ingestion/ingestion.service.ts

## Problem

When uploading a document through the admin UI, the upload succeeds and returns a `documentId`, but when the UI immediately fetches the documents list, the newly uploaded document is **not visible** in the list, even though both requests use the same project ID.

### Evidence from Console Logs

```
[UPLOAD] ✅ Upload succeeded: {
  documentId: '28f97a70-05d2-41bc-b9c3-455b8f695104',
  uploadedToProject: 'f5606d59-838b-4d38-9151-0d4ec657332a'
}

[FETCH] ✅ Received documents: {
  count: 0,
  documentIds: [],
  fetchedFromProject: 'f5606d59-838b-4d38-9151-0d4ec657332a'
}

[FETCH] ❌ BUG DETECTED: Uploaded document NOT in list! {
  uploadedDocumentId: '28f97a70-05d2-41bc-b9c3-455b8f695104',
  uploadedToProject: 'f5606d59-838b-4d38-9151-0d4ec657332a',
  fetchedFromProject: 'f5606d59-838b-4d38-9151-0d4ec657332a',
  projectIdsMatch: true,
  documentsInList: 0
}
```

**Key observations:**
- ✅ Upload succeeded with valid document ID
- ✅ Both upload and fetch use the **same project ID**
- ❌ Document not in list immediately after upload
- ❌ This is NOT a project context switching bug

## Root Cause Analysis

### Server-Side Ingestion Flow

Looking at `apps/server/src/modules/ingestion/ingestion.service.ts`:

```typescript
// Line 604-606: Transaction COMMIT
if (transactionActive && client) {
  await client.query('COMMIT');
  transactionActive = false;
}

// Line 627-667: Post-commit operations (AFTER document is committed)
const autoExtractSettings = await this.shouldAutoExtract(projectId);
if (autoExtractSettings?.enabled) {
  // Create extraction job - more async DB operations
  const extractionJob = await this.extractionJobService.createJob({...});
  extractionJobId = extractionJob.id;
}

// Line 669-674: RETURN response
return {
  documentId: documentId!,
  chunks: chunks.length,
  alreadyExists: false,
  extractionJobId,
};
```

### The Race Condition

1. **Upload Request:**
   - Client uploads document
   - Server commits document to database (line 605)
   - Server checks auto-extraction settings (line 627)
   - Server *may* create extraction job (line 636-653)
   - Server returns success response (line 669-674)

2. **Fetch Request (Client-side):**
   - Client receives upload response
   - Client **immediately** fetches documents list
   - Query may execute **before** transaction is fully visible

### Potential Causes

1. **PostgreSQL Transaction Visibility:**
   - Even after `COMMIT`, there can be a microsecond delay before the transaction is visible to other connections
   - Read committed isolation level means other connections might not see the change immediately

2. **Auto-Extraction Delay:**
   - If auto-extraction is enabled, there's extra time between COMMIT and return
   - This makes the race window longer

3. **Database Connection Pool:**
   - Upload and fetch may use different connections from the pool
   - Different connections may have different visibility of recent commits

4. **Read Replica Lag (if applicable):**
   - If the system uses read replicas, there could be replication lag
   - Reads might go to a replica that hasn't caught up

## Impact

### User Experience
- **Critical:** Users see "Upload successful" but the document doesn't appear in the list
- Causes confusion and erodes trust in the system
- Users may try to re-upload, creating duplicates

### Data Integrity
- ✅ Document IS successfully saved (not a data loss issue)
- ❌ UI state is inconsistent with database state
- May cause users to perform unnecessary actions

## Reproduction Steps

1. Navigate to Documents page
2. Upload a new document (not a duplicate)
3. Observe console logs
4. Document is uploaded successfully but not immediately visible in list

**Frequency:** Intermittent (race condition - timing dependent)

## Proposed Solutions

### Option 1: Optimistic UI Update (Client-side Fix) ⭐ **RECOMMENDED**

**Pros:**
- No server changes required
- Instant UI feedback
- Standard React pattern
- Handles the race condition gracefully

**Cons:**
- Slightly more complex client code
- Need to handle edge cases if upload fails after optimistic update

**Implementation:**
```typescript
// In apps/admin/src/pages/admin/apps/documents/index.tsx
async function handleUpload(file: File): Promise<void> {
  setUploading(true);
  try {
    // Upload file
    const uploadResult = await fetchForm<{documentId: string; chunks: number}>(...);
    
    // Optimistically add document to UI
    const optimisticDoc: DocumentRow = {
      id: uploadResult.documentId,
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      project_id: config.activeProjectId!,
      // ... other fields
    };
    
    // Add to local state immediately
    setData(prev => [optimisticDoc, ...prev]);
    
    // Show success message
    showToast({ message: 'Upload successful.', variant: 'success' });
    
    // Optionally refresh in background to get full data
    setTimeout(() => {
      loadDocuments(); // Refresh from server
    }, 1000);
    
  } catch (e) {
    // Handle error, remove optimistic update if needed
  } finally {
    setUploading(false);
  }
}
```

### Option 2: Add Retry Logic with Exponential Backoff (Client-side)

**Pros:**
- Eventually consistent
- No server changes
- Handles transient issues

**Cons:**
- Adds complexity
- Still has delay before document appears
- May not solve underlying issue

**Implementation:**
```typescript
async function fetchDocumentsWithRetry(
  expectedDocId?: string,
  maxRetries = 3,
  delayMs = 100
): Promise<DocumentRow[]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const docs = await fetchDocuments();
    
    // If we're looking for a specific doc and it exists, return immediately
    if (expectedDocId && docs.some(d => d.id === expectedDocId)) {
      return docs;
    }
    
    // If this isn't the last attempt, wait and retry
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      continue;
    }
    
    return docs;
  }
  return [];
}
```

### Option 3: Server-side Force Flush (Server-side Fix)

**Pros:**
- Guarantees consistency
- Fixes root cause

**Cons:**
- Requires server changes
- May impact performance
- Doesn't help with read replica lag

**Implementation:**
```typescript
// In ingestion.service.ts after COMMIT
if (transactionActive && client) {
  await client.query('COMMIT');
  transactionActive = false;
  
  // Force flush to ensure visibility
  await client.query('SELECT 1'); // Dummy query to ensure flush
}
```

### Option 4: Return Document in Response (Server-side Enhancement)

**Pros:**
- Client has full document data immediately
- No need for separate fetch
- Most efficient solution

**Cons:**
- Requires API change
- Need to update client code

**Implementation:**
```typescript
// Update IngestResult interface
export interface IngestResult {
  documentId: string;
  chunks: number;
  alreadyExists: boolean;
  extractionJobId?: string;
  document?: {  // NEW
    id: string;
    filename: string;
    mime_type: string;
    created_at: string;
    project_id: string;
  };
}

// In ingestText(), before return:
const docResult = await query<{...}>(
  'SELECT id, filename, mime_type, created_at, project_id FROM kb.documents WHERE id = $1',
  [documentId]
);

return {
  documentId: documentId!,
  chunks: chunks.length,
  alreadyExists: false,
  extractionJobId,
  document: docResult.rows[0], // Include full document data
};
```

## Recommended Solution

**Implement Option 1 (Optimistic UI Update) + Option 4 (Return Document in Response)**

This combination provides:
1. **Instant UI feedback** (optimistic update)
2. **Accurate data** (server returns full document)
3. **No race conditions** (no need for separate fetch)
4. **Best user experience**

## Testing Plan

1. **Manual Testing:**
   - Upload multiple documents in quick succession
   - Verify each appears in list immediately
   - Test with auto-extraction enabled/disabled
   - Test with different document types

2. **Integration Test:**
```typescript
describe('Document Upload Visibility', () => {
  it('should show uploaded document in list immediately', async () => {
    // Upload document
    const uploadResult = await uploadDocument(testFile);
    
    // Fetch documents
    const documents = await fetchDocuments();
    
    // Verify document is in list
    expect(documents).toContainEqual(
      expect.objectContaining({ id: uploadResult.documentId })
    );
  });
  
  it('should handle rapid sequential uploads', async () => {
    const files = [file1, file2, file3];
    const uploadResults = await Promise.all(
      files.map(f => uploadDocument(f))
    );
    
    const documents = await fetchDocuments();
    
    uploadResults.forEach(result => {
      expect(documents).toContainEqual(
        expect.objectContaining({ id: result.documentId })
      );
    });
  });
});
```

3. **Performance Testing:**
   - Measure time between commit and visibility
   - Test with high concurrent upload load
   - Monitor for any connection pool issues

## Related Issues

- #044 - Organization Context Security Fix
- #045 - Missing Project Context Dependencies
- #046 - Project Context Dependency Audit

## Notes

- This is NOT related to the project context switching bugs we fixed earlier
- The issue is purely timing/transaction visibility
- Occurs even when project IDs match perfectly
- More likely to occur when auto-extraction is enabled (adds delay)

