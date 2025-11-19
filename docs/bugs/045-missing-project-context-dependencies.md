# Bug: Missing Project Context Dependencies in useEffect Hooks

**Date**: 2025-11-19  
**Severity**: Critical (Data Leak)  
**Status**: In Progress

## Problem

Multiple pages are missing `config.activeProjectId` and `config.activeOrgId` in their `useEffect` dependency arrays. This causes data from old projects/organizations to persist after switching contexts, leading to **cross-project data leaks**.

## Affected Pages

### ✅ Fixed

1. **`apps/admin/src/pages/admin/apps/chunks/index.tsx`**
   - Missing: `config.activeProjectId`, `config.activeOrgId`
   - Fixed: Added both to dependency array

### ⚠️ Needs Fix

2. **`apps/admin/src/pages/admin/pages/monitoring/ChatSessionsListPage.tsx`**

   - Issue: `monitoringClient` is created with `activeProjectId` and `activeOrgId` but they're not in `loadSessions` dependencies
   - Impact: Chat sessions from old project remain visible after switching

3. **Other pages (need audit):**
   - Any page using `useApi()` that makes API calls in `useEffect`
   - Any page creating clients with project/org context

## Root Cause

When a `useEffect` depends on functions like `buildHeaders` or `fetchJson` from `useApi()`, it SHOULD re-run when the project changes because:

1. `activeProjectId` changes in config
2. `buildHeaders` is memoized with `activeProjectId` as dependency
3. `fetchJson` is memoized with `buildHeaders` as dependency
4. Parent `useEffect` has `fetchJson` as dependency
5. **Should** trigger re-fetch

However, this chain of dependencies is **fragile** and can break if:

- `useCallback` memoization doesn't work as expected
- React batches updates in unexpected ways
- The dependency chain is too deep

## Solution

**Best Practice**: Always explicitly include `config.activeProjectId` and `config.activeOrgId` in dependency arrays when making API calls that depend on project/org context.

### Pattern to Follow

```typescript
// ❌ BAD - Relies on transitive dependencies
useEffect(() => {
  // API call using project context
}, [apiBase, fetchJson, buildHeaders]);

// ✅ GOOD - Explicit dependencies
useEffect(() => {
  // API call using project context
}, [
  apiBase,
  fetchJson,
  buildHeaders,
  config.activeProjectId,
  config.activeOrgId,
]);
```

### Why This Works

Adding explicit dependencies ensures the effect re-runs when:

1. User switches to a different project in the same org
2. User switches to a project in a different org
3. User creates a new project/org and switches to it

## Testing

For each fixed page:

1. Create Org A with Project A1, add data (documents/chunks/sessions)
2. Create Org B with Project B1 (empty)
3. Navigate to page in Project A1 → verify data visible
4. Switch to Project B1 → **verify data from A1 is NOT visible**
5. Switch back to Project A1 → verify data reappears
6. Check Network tab → verify `X-Project-ID` header is correct on each switch

## Action Items

- [x] Fix `chunks/index.tsx`
- [ ] Fix `ChatSessionsListPage.tsx`
- [ ] Audit all pages using `useApi()` for missing dependencies
- [ ] Create ESLint rule to enforce this pattern
- [ ] Add integration tests for cross-project data isolation

## Related Issues

- Security fix: Organization context not updated on project switch (#044)
- All pages fetching project-scoped data are potentially affected
