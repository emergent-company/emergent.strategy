# Document Upload UX Improvement

**Date**: 2025-10-19  
**Issue**: Document upload was blocking the entire table view with skeleton loaders, creating poor user experience

## Problems Fixed

### 1. Backend: Empty Vector Validation
**File**: `apps/server/src/modules/ingestion/ingestion.service.ts`  
**Issue**: Upload failed with `500 Internal Server Error: vector must have at least 1 dimension`  
**Root Cause**: Embedding service returning empty arrays `[]` which PostgreSQL pgvector cannot accept

**Fix Applied** (Line 278):
```typescript
// Before
const vecLiteral = vec ? '[' + vec.map(...).join(',') + ']' : null;

// After  
const vecLiteral = (vec && vec.length > 0) ? '[' + vec.map(...).join(',') + ']' : null;
```

**Result**: Empty embeddings now correctly insert as `NULL` instead of causing database errors

### 2. Frontend: Non-Blocking Upload Progress
**File**: `apps/admin/src/pages/admin/apps/documents/index.tsx`

**Changes Made**:

#### A. Removed Table Blocking (Line 188)
```typescript
// REMOVED: setLoading(true) that was hiding the entire table
// Now refreshes data WITHOUT showing skeleton loader
```

#### B. Added Progress Indicator Above Table
```typescript
{uploading && (
    <div role="alert" className="alert alert-info mb-4">
        <span className="loading loading-spinner loading-sm" />
        <span>Uploading document and refreshing list...</span>
    </div>
)}
```

#### C. Added Visual Feedback on Table
```typescript
// Table gets subtle opacity and disables interaction during upload
<div className={`overflow-x-auto relative ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
```

## New User Experience Flow

1. **User clicks "Upload document"**
   - Upload button shows spinner + "Uploading..."
   - Blue info alert appears above table: "Uploading document and refreshing list..."
   - Table remains visible but with 60% opacity

2. **During Upload**
   - User can see existing documents in the table
   - Visual feedback indicates something is happening
   - No jarring skeleton loader replacement

3. **Upload Complete**
   - Info alert disappears
   - Table opacity returns to normal
   - Success message shows: "Upload successful."
   - Table refreshes with new document added
   - Success message auto-clears after 3 seconds

4. **On Error**
   - Error alert shows below upload button
   - Table remains visible
   - User can retry immediately

## Benefits

✅ **Better UX**: Users maintain context by seeing the table throughout the process  
✅ **Clear Feedback**: Multiple indicators show upload progress (button, alert, table opacity)  
✅ **Robust Backend**: Empty embeddings no longer crash uploads  
✅ **Non-Intrusive**: No full-page blocking for a simple document refresh  
✅ **Accessible**: Proper ARIA roles and loading states for screen readers

## Testing Checklist

- [x] Backend: Upload documents successfully without vector errors
- [x] Frontend: Table stays visible during upload
- [x] Frontend: Progress indicator shows above table
- [x] Frontend: Table becomes slightly transparent during upload
- [x] Frontend: Success message appears after completion
- [x] Frontend: New document appears in refreshed table
- [x] Error handling: Proper error messages if upload fails

## Related Files

- Backend: `apps/server/src/modules/ingestion/ingestion.service.ts`
- Frontend: `apps/admin/src/pages/admin/apps/documents/index.tsx`
- Enhanced Logging: `apps/server/src/common/logger/file-logger.service.ts` (includes file/line info)
