# Document List Cache Prevents Newly Uploaded Documents from Appearing

**Status**: 🔍 Identified  
**Severity**: High  
**Date Discovered**: 2025-01-19  
**Component**: Documents API / Frontend  
**Related Files**:

- `apps/server/src/common/interceptors/caching.interceptor.ts`
- `apps/server/src/modules/documents/documents.controller.ts` (line 66)
- `apps/admin/src/pages/admin/apps/documents/index.tsx` (line 476)

## Summary

After uploading a document, the upload API returns immediately with success (showing "Created 4 chunks!"), but the newly uploaded document does not appear in the documents table. Users must manually refresh multiple times or wait 30+ seconds to see the document.

## Root Cause

The `/api/documents` endpoint has a `@UseInterceptors(CachingInterceptor)` decorator (line 66 of `documents.controller.ts`) that implements:

1. **HTTP ETag caching**: Returns 304 Not Modified if content hash matches
2. **Cache-Control header**: `private, max-age=30, must-revalidate` (30-second cache)

When the upload completes, the frontend immediately fetches the documents list, but receives either:

- **Cached response** from browser (up to 30 seconds old)
- **304 Not Modified** response (if ETag matches)
- **Stale data** before the transaction is fully visible

## Reproduction Steps

1. Open Documents page in admin panel
2. Upload a document (e.g., `/tmp/test-upload.md`)
3. **Observe**: Toast shows "Document processed successfully! Created 4 chunks."
4. **Bug**: Document does NOT appear in the table
5. Wait 30 seconds OR force-refresh (Cmd+Shift+R) multiple times
6. **Result**: Document finally appears

## Expected Behavior

Newly uploaded documents should appear immediately in the table after the success toast is shown, without requiring manual refresh or waiting.

## Impact

- **User Confusion**: Success message says document was created, but it's invisible
- **Loss of Trust**: Users think the system is broken or data was lost
- **Poor UX**: Requires manual workarounds (multiple refreshes)
- **Data Inconsistency**: Toast says "4 chunks" but document not visible

## Technical Details

### Upload Flow (Current)

```
1. User uploads file
2. POST /api/ingest/upload
   - Creates document + chunks in transaction
   - COMMIT transaction (line 605 ingestion.service.ts)
   - Returns {documentId, chunks: 4, alreadyExists: false}
3. Frontend receives response
4. Frontend immediately calls GET /api/documents (line 476 index.tsx)
5. CachingInterceptor returns cached/304 response
6. Frontend shows success toast but stale table data
```

### Cache Headers

```http
ETag: W/"a1b2c3d4..."
Cache-Control: private, max-age=30, must-revalidate
```

- **Browser cache**: Stores response for up to 30 seconds
- **ETag**: Enables 304 Not Modified responses even after cache expires
- **Result**: Stale data visible for 30+ seconds

## Proposed Solutions

### Option 1: Cache Busting (Quick Fix) ✅ **RECOMMENDED**

Add cache-busting query parameter after document upload:

```typescript
// apps/admin/src/pages/admin/apps/documents/index.tsx
const json = await fetchJson<DocumentRow[] | { documents: DocumentRow[] }>(
  `${apiBase}/api/documents?_t=${Date.now()}`, // Cache bust
  {
    headers: t2 ? { ...buildHeaders({ json: false }) } : {},
    json: false,
  }
);
```

**Pros**:

- Simple, one-line fix
- No backend changes required
- Works immediately
- Low risk

**Cons**:

- Bypasses cache every time after upload
- Doesn't fix root architectural issue

### Option 2: Remove Cache from Documents List (Safer Fix)

Remove `@UseInterceptors(CachingInterceptor)` from documents list endpoint:

```typescript
// apps/server/src/modules/documents/documents.controller.ts
@Get()
// @UseInterceptors(CachingInterceptor) // REMOVE THIS
@ApiOkResponse({...})
async list(...) {
```

**Pros**:

- Fixes root cause
- Documents list always fresh
- Simple backend change

**Cons**:

- Slightly higher database load (no caching)
- Need to rebuild and redeploy server

### Option 3: Invalidate Cache After Upload (Complex)

Implement cache invalidation logic:

```typescript
// After upload, invalidate documents list cache
await cacheService.invalidate('documents:list:${projectId}');
```

**Pros**:

- Keeps caching for read-heavy operations
- Proper cache invalidation pattern

**Cons**:

- Requires cache service implementation
- More complex architecture
- Risk of invalidation bugs

### Option 4: Add `Cache-Control: no-cache` Header to Fetch

Force revalidation on critical fetches:

```typescript
const json = await fetchJson<DocumentRow[] | { documents: DocumentRow[] }>(
  `${apiBase}/api/documents`,
  {
    headers: {
      ...buildHeaders({ json: false }),
      'Cache-Control': 'no-cache', // Force revalidation
    },
    json: false,
  }
);
```

**Pros**:

- Backend stays unchanged
- Still uses ETags for bandwidth savings

**Cons**:

- Request header `Cache-Control` doesn't always override server cache directives
- May not work in all browsers

## Recommended Fix

**Option 1 (Cache Busting)** for immediate fix, then evaluate **Option 2 (Remove Cache)** for long-term solution.

Documents list is a write-heavy operation (users upload frequently) where caching causes more problems than it solves. The 30-second cache creates a poor user experience for minimal performance benefit.

## Related Issues

- Similar cache invalidation issues may exist for:
  - Chunks list after document deletion
  - Projects list after project creation
  - Any list view after CREATE/UPDATE/DELETE operations

## Test Plan

After implementing fix:

1. ✅ Upload document → appears immediately (no refresh)
2. ✅ Upload duplicate → shows correct message, table unchanged
3. ✅ Delete document → disappears immediately
4. ✅ Upload 10 documents rapidly → all appear without refresh
5. ✅ No performance regression (check response times)

## Files to Modify

**Option 1 (Cache Busting)**:

- `apps/admin/src/pages/admin/apps/documents/index.tsx` (line ~476)

**Option 2 (Remove Cache)**:

- `apps/server/src/modules/documents/documents.controller.ts` (line 66)

## Priority Justification

**High Severity** because:

- Affects every document upload operation
- Creates immediate, visible user confusion
- Undermines trust in the system
- Simple fix available with low risk
