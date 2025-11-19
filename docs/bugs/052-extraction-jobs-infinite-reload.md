# Bug 052: Extraction Jobs Pages - Infinite Reload Loop

**Status:** ✅ Fixed (Both List & Detail Pages)  
**Severity:** High  
**Created:** 2025-11-19  
**Fixed:** 2025-11-19  
**Component:** Frontend - Admin App - Extraction Jobs List & Detail Pages

## Summary

Both the extraction jobs **list page** and **detail page** entered infinite reload loops, causing the screen to blink and making repeated API calls to the backend. This occurred when:

1. Navigating to the list page after clicking "Extract" on a document
2. Clicking on a specific job to view its details

## Symptoms

1. Screen flickers/blinks repeatedly
2. API calls loop endlessly:
   ```
   GET /admin/extraction-jobs/projects/{projectId}?status=pending&limit=1
   GET /admin/extraction-jobs/projects/{projectId}?status=running&limit=1
   ```
3. Page is unusable due to constant re-rendering
4. Network tab shows hundreds of requests

## Root Cause

### List Page Issue

**File:** `apps/admin/src/pages/admin/pages/extraction-jobs/index.tsx`  
**Line:** 113

The `useEffect` hook had an **unused dependency** (`config.activeOrgId`) in its dependency array:

```typescript
useEffect(() => {
  // ... fetch logic ...
}, [
  config.activeProjectId,
  config.activeOrgId,
  statusFilter,
  currentPage,
  pageSize,
  storybookJobs,
  apiBase,
  fetchJson,
]);
//                          ^^^^^^^^^^^^^^^^^ UNUSED!
```

### Detail Page Issue

**File:** `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx`  
**Line:** 78

The `useEffect` hook had the `client` object in its dependency array, but the client was created **outside the effect** on every render (lines 25-29):

```typescript
// Client created on every render (bad)
const client = createExtractionJobsClient(
  apiBase,
  fetchJson,
  config.activeProjectId
);

useEffect(() => {
  // ... fetch logic using client ...
}, [jobId, client, config.activeProjectId]); // client changes on every render!
```

**Problems:**

1. **List Page:** `config.activeOrgId` was never used in the effect body
2. **Detail Page:** `client` object reference changed on every render
3. **Both:** If config object reference was unstable, would cause continuous re-renders
4. **Impact:** Infinite loops, excessive API calls, unusable pages

## Impact

- **User Experience:** Page is completely unusable - users cannot view or manage extraction jobs
- **Performance:** Excessive API calls flood the backend
- **Resource Usage:** High CPU usage in browser, high load on server

## Evidence

From logs (`apps/logs/admin/error.log`):

```
2025-11-19 14:30:59: [vite] http proxy error: /admin/extraction-jobs/projects/248f430d-a4d7-44f8-becb-434474a941a7?status=pending&limit=1
2025-11-19 14:30:59: AggregateError [ECONNREFUSED]

2025-11-19 14:37:59: [vite] http proxy error: /admin/extraction-jobs/projects/248f430d-a4d7-44f8-becb-434474a941a7?status=pending&limit=1
2025-11-19 14:37:59: AggregateError [ECONNREFUSED]
```

The same request repeats every few seconds/milliseconds.

## Solution Applied

### Fix 1: List Page - Remove Unused Dependency

**File:** `apps/admin/src/pages/admin/pages/extraction-jobs/index.tsx`  
**Line:** 113

**Before:**

```typescript
}, [config.activeProjectId, config.activeOrgId, statusFilter, currentPage, pageSize, storybookJobs, apiBase, fetchJson]);
```

**After:**

```typescript
}, [config.activeProjectId, statusFilter, currentPage, pageSize, storybookJobs, apiBase, fetchJson]);
```

### Fix 2: Detail Page - Move Client Creation Inside Effect

**File:** `apps/admin/src/pages/admin/pages/extraction-jobs/detail.tsx`  
**Lines:** 20-78

**Before:**

```typescript
const client = createExtractionJobsClient(
  apiBase,
  fetchJson,
  config.activeProjectId
);

useEffect(() => {
  // ... uses client ...
}, [jobId, client, config.activeProjectId]);
```

**After:**

```typescript
useEffect(() => {
  if (!jobId || !config.activeProjectId) {
    // ... handle errors ...
    return;
  }

  // Create client inside effect
  const client = createExtractionJobsClient(
    apiBase,
    fetchJson,
    config.activeProjectId
  );

  // ... use client ...
}, [jobId, config.activeProjectId, apiBase, fetchJson, job?.status]);
```

Also updated `handleCancel` and `handleDelete` functions to create their own client instances.

**Rationale:**

- **List Page:** Removed unused dependency that was triggering unnecessary re-renders
- **Detail Page:** Moved client creation inside effect to prevent new object references on every render
- Both fixes ensure the effect only re-runs when actual dependencies change

## Testing Steps

1. Navigate to Documents page
2. Click "Extract" on any document
3. Observe extraction jobs page
4. Verify:
   - Page loads once and displays jobs
   - No repeated API calls in Network tab
   - No screen flickering
   - Page remains stable and usable

## Solution

### Option 1: Remove Unused Dependency (Recommended)

Remove `config.activeOrgId` from the dependency array since it's not used:

```typescript
useEffect(() => {
  // ... existing code ...
}, [
  config.activeProjectId,
  statusFilter,
  currentPage,
  pageSize,
  storybookJobs,
  apiBase,
  fetchJson,
]);
//  ^^^ Remove config.activeOrgId
```

### Option 2: Destructure Config Values

Destructure the specific config values needed to avoid object reference issues:

```typescript
const { activeProjectId, activeOrgId } = config;

useEffect(() => {
  if (!activeProjectId) {
    setError('No active project selected');
    setIsLoading(false);
    return;
  }
  // ... rest of fetch logic ...
}, [
  activeProjectId,
  statusFilter,
  currentPage,
  pageSize,
  storybookJobs,
  apiBase,
  fetchJson,
]);
```

### Option 3: Memoize Config Context Value

If the config context is not memoizing its value, update the context provider:

```typescript
// In ConfigContext.tsx
const value = useMemo(
  () => ({ config, updateConfig, setActiveOrg, setActiveProject }),
  [config] // Only recreate when config actually changes
);
```

## Testing Steps

1. Navigate to Documents page
2. Click "Extract" on any document
3. Observe extraction jobs page
4. Verify:
   - Page loads once and displays jobs
   - No repeated API calls in Network tab
   - No screen flickering
   - Page remains stable and usable

## Related Files

- `apps/admin/src/pages/admin/pages/extraction-jobs/index.tsx` - Main issue
- `apps/admin/src/contexts/config.tsx` - Potential contributing factor

## Prevention

- Always review `useEffect` dependencies with ESLint's exhaustive-deps rule
- Ensure context values are properly memoized
- Remove unused dependencies promptly
- Test pages after navigation from different entry points
