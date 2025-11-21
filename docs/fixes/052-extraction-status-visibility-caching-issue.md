# Fix: Extraction Status Visibility Issue (HTTP Caching)

**Status**: Identified  
**Priority**: Medium  
**Date**: 2025-11-21

## Problem

Users report that extraction status next to documents sometimes appears, sometimes disappears, or shows stale data. Investigation reveals this is caused by HTTP caching with a 30-second TTL.

## Root Cause

The `CachingInterceptor` on the documents list endpoint (`GET /api/documents`) sets:

```
Cache-Control: private, max-age=30, must-revalidate
```

This causes:

1. Browser caches document list for 30 seconds
2. Extraction status changes (pending → running → completed) don't appear immediately
3. Users see stale status until cache expires or ETag changes

## Current Behavior

```sql
-- Query in documents.service.ts:73-83
LEFT JOIN LATERAL (
    SELECT status, completed_at, objects_created
    FROM kb.object_extraction_jobs
    WHERE source_type = 'document' AND source_id::uuid = d.id
    ORDER BY created_at DESC
    LIMIT 1
) ej ON true
```

**The query itself is correct** - it fetches the most recent extraction job status for each document.

## Evidence

### Database State (Correct):

```
Total documents: 67
With extraction status: 10 (have jobs)
Without extraction status: 57 (never extracted)

Recent statuses:
- 1 running
- 6 requires_review
- 3 completed
```

### Frontend Display (Cached):

- Shows "—" for documents without extraction jobs ✅ correct
- Shows status badge for documents with jobs ✅ correct
- **BUT** status may be stale for up to 30 seconds ❌ problem

## Impact

- **User Experience**: Confusing - users think extraction failed when it's just cached
- **Severity**: Medium - doesn't break functionality, just causes confusion
- **Frequency**: Happens whenever user views page within 30 seconds of status change

## Solutions

### Option 1: Reduce Cache TTL (Recommended - Quick Fix)

**Change**: Reduce `max-age=30` to `max-age=5` in `CachingInterceptor`

**Pros**:

- Simple 1-line change
- Still provides caching benefits
- Reduces staleness window to 5 seconds

**Cons**:

- Still has a 5-second delay
- Slightly more database load

**Implementation**:

```typescript
// apps/server/src/common/interceptors/caching.interceptor.ts:38
if (!res.getHeader('Cache-Control'))
  res.setHeader('Cache-Control', 'private, max-age=5, must-revalidate');
```

### Option 2: Per-Route Cache Control (Better Long-term)

**Change**: Allow routes to specify their own cache duration

**Pros**:

- Flexible - can have different TTLs for different endpoints
- Documents list can have 5s, other routes keep 30s

**Cons**:

- Requires refactoring `CachingInterceptor`
- More complex

**Implementation**:

```typescript
// Add decorator to specify cache duration
@CacheControl('private, max-age=5, must-revalidate')
@Get()
async list() { ... }

// Modify CachingInterceptor to read from decorator
```

### Option 3: Real-time Updates via Polling (Best UX)

**Change**: Frontend polls for extraction status updates every 5-10 seconds when jobs are active

**Pros**:

- Best user experience - near real-time updates
- Can still use 30s cache for initial load
- Only polls when extraction jobs exist

**Cons**:

- More complex frontend code
- Slightly more server requests

**Implementation**:

```typescript
// apps/admin/src/pages/admin/apps/documents/index.tsx
useEffect(() => {
  const hasRunningJobs = data?.some(
    (doc) =>
      doc.extractionStatus === 'running' || doc.extractionStatus === 'pending'
  );

  if (!hasRunningJobs) return;

  const interval = setInterval(refreshData, 5000);
  return () => clearInterval(interval);
}, [data]);
```

### Option 4: Remove Caching from Documents Endpoint (Nuclear Option)

**Change**: Don't use `CachingInterceptor` on documents list

**Pros**:

- Always fresh data
- Simple to implement

**Cons**:

- No caching benefits
- More database load
- Loses ETag optimization

**Implementation**:

```typescript
// apps/server/src/modules/documents/documents.controller.ts:66
@Get()
// Remove: @UseInterceptors(CachingInterceptor)
async list() { ... }
```

## Recommendation

**Implement Option 1 immediately** (reduce cache to 5 seconds), then **add Option 3** (polling) for active extraction jobs in the next sprint.

### Immediate Fix (5 minutes):

1. Edit `caching.interceptor.ts:38`
2. Change `max-age=30` to `max-age=5`
3. Restart server

### Future Enhancement (1-2 hours):

1. Add polling logic in documents page when extraction jobs are active
2. Show "refreshing..." indicator when polling
3. Stop polling when no active jobs

## Testing Plan

1. **Before fix**:

   - Start extraction job
   - Refresh page within 30s
   - Verify status is stale

2. **After immediate fix**:

   - Start extraction job
   - Refresh page after 6s
   - Verify status is fresh

3. **After polling enhancement**:
   - Start extraction job
   - Don't refresh - wait and watch
   - Verify status updates automatically every 5-10s

## Related Files

- `apps/server/src/common/interceptors/caching.interceptor.ts:38` - Cache TTL
- `apps/server/src/modules/documents/documents.controller.ts:66` - Uses interceptor
- `apps/server/src/modules/documents/documents.service.ts:73-83` - Query (correct)
- `apps/admin/src/pages/admin/apps/documents/index.tsx:804-864` - Status display

## Verification

Algorithm and SQL query are **correct**. The issue is purely caching-related, not a data or logic problem.

```sql
-- Verified query returns correct results:
SELECT d.id, d.filename, ej.status
FROM kb.documents d
LEFT JOIN LATERAL (
    SELECT status
    FROM kb.object_extraction_jobs
    WHERE source_type = 'document' AND source_id::uuid = d.id
    ORDER BY created_at DESC
    LIMIT 1
) ej ON true
ORDER BY d.created_at DESC;
-- ✅ Returns correct, fresh data every time
```
