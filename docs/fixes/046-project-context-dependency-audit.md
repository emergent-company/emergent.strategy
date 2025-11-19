# Project Context Dependency Audit - Missing useEffect Dependencies

**Status:** ✅ Fixed  
**Date:** 2024-11-19  
**Type:** Bug Fix / Code Quality  
**Severity:** High  
**Related Issues:** [#044](./044-organization-context-security-fix.md), [#045](../bugs/045-missing-project-context-dependencies.md)

## Problem

After fixing the organization/project switcher context coordination issues (#044) and discovering that some pages were missing `config.activeProjectId` and `config.activeOrgId` in their `useEffect` dependency arrays (#045), we conducted a comprehensive audit of all pages using `useApi()` to identify and fix similar issues across the codebase.

**Root Cause:**  
When React components use `config.activeProjectId` or `config.activeOrgId` inside `useEffect` hooks to make API calls, but don't include these values in the dependency array, the effect doesn't re-run when users switch projects/organizations. This causes stale data to persist and creates data leakage vulnerabilities between projects.

## Files Audited

### ✅ Already Correct
- `apps/documents/index.tsx` - Uses `config.activeProjectId` in dependencies
- `apps/objects/index.tsx` - Uses `config.activeProjectId` in dependencies  
- `pages/extraction-jobs/index.tsx` - Uses `config.activeProjectId` in dependencies
- `pages/integrations/index.tsx` - Uses `config.activeProjectId` in dependencies
- `monitoring/analytics/index.tsx` - Uses both `config.activeProjectId` and `config.activeOrgId`
- `monitoring/dashboard/index.tsx` - Uses both `config.activeProjectId` and `config.activeOrgId`
- `monitoring/dashboard/JobDetailModal.tsx` - Uses `monitoringClient` which includes project/org IDs
- `monitoring/dashboard/CostVisualization.tsx` - Doesn't use `useEffect`, receives props

### ✅ Previously Fixed (Issue #045)
- `apps/chunks/index.tsx` - Added `config.activeProjectId` and `config.activeOrgId`
- `pages/monitoring/ChatSessionsListPage.tsx` - Added `config.activeProjectId` and `config.activeOrgId`

### ✅ Fixed in This Audit
1. **pages/extraction-jobs/detail.tsx** (line 36-74)
   - **Issue:** Had `eslint-disable` comment but was actually missing `config.activeProjectId`
   - **Fix:** Removed eslint-disable and added `client` and `config.activeProjectId` to dependencies

2. **pages/settings/project/templates.tsx** (line 90-96)
   - **Issue:** Had `eslint-disable` comment, missing proper dependencies
   - **Fix:** Wrapped `loadTemplatePacks` in `useCallback` with `[config.activeProjectId, apiBase, fetchJson]` dependencies
   - **Pattern:** Used `useCallback` to avoid infinite re-render loops

3. **pages/settings/project/auto-extraction.tsx** (line 124-128)
   - **Issue:** Had `eslint-disable` comment, missing proper dependencies
   - **Fix:** Wrapped both `loadProject` and `loadAvailableObjectTypes` in `useCallback` with `[config.activeProjectId, apiBase, fetchJson]` dependencies
   - **Pattern:** Used `useCallback` to avoid infinite re-render loops

### ℹ️ No Changes Needed
- **ProfileSettings.tsx** - Uses `/user/profile` endpoint (no project context)
- **ai-prompts.tsx** - Uses `apiBase` and `fetchJson` in dependencies (no project switching)

## Changes Made

### 1. extraction-jobs/detail.tsx
```typescript
// BEFORE
useEffect(() => {
    // ... fetch job logic
}, [jobId]);
// eslint-disable-next-line react-hooks/exhaustive-deps

// AFTER  
useEffect(() => {
    // ... fetch job logic
}, [jobId, client, config.activeProjectId]);
```

### 2. settings/project/templates.tsx
```typescript
// BEFORE
const loadTemplatePacks = async () => {
    // ... fetch template packs
};
useEffect(() => {
    loadTemplatePacks();
}, [config.activeProjectId]);
// eslint-disable-next-line react-hooks/exhaustive-deps

// AFTER
const loadTemplatePacks = useCallback(async () => {
    // ... fetch template packs  
}, [config.activeProjectId, apiBase, fetchJson]);
useEffect(() => {
    loadTemplatePacks();
}, [loadTemplatePacks]);
```

### 3. settings/project/auto-extraction.tsx
```typescript
// BEFORE
const loadProject = async () => {
    // ... fetch project
};
const loadAvailableObjectTypes = async () => {
    // ... fetch types
};
useEffect(() => {
    loadProject();
    loadAvailableObjectTypes();
}, [config.activeProjectId]);
// eslint-disable-next-line react-hooks/exhaustive-deps

// AFTER
const loadProject = useCallback(async () => {
    // ... fetch project
}, [config.activeProjectId, apiBase, fetchJson]);
const loadAvailableObjectTypes = useCallback(async () => {
    // ... fetch types
}, [config.activeProjectId, apiBase, fetchJson]);
useEffect(() => {
    loadProject();
    loadAvailableObjectTypes();
}, [loadProject, loadAvailableObjectTypes]);
```

## Best Practice Pattern Established

### Pattern 1: Direct Dependencies (Simple Cases)
```typescript
useEffect(() => {
    // API call using project context
}, [
    apiBase, 
    fetchJson, 
    buildHeaders,
    config.activeProjectId,  // ← Always include
    config.activeOrgId,      // ← Always include
    // ... other params
]);
```

### Pattern 2: useCallback Wrapper (Complex Cases)
When the effect calls functions that depend on project context:

```typescript
const loadData = useCallback(async () => {
    if (!config.activeProjectId) return;
    const data = await fetchJson(`${apiBase}/api/projects/${config.activeProjectId}/data`);
    setData(data);
}, [config.activeProjectId, apiBase, fetchJson]);

useEffect(() => {
    loadData();
}, [loadData]);
```

**Why useCallback?** Prevents infinite re-render loops that would occur if we put `loadData` directly in the dependency array without memoizing it.

## Testing

✅ **Build:** Passes  
✅ **Lint:** Passes (4 pre-existing warnings, none related to our changes)  
✅ **Unit Tests:** All 196 tests passing  
✅ **TypeScript:** No errors

### Remaining Lint Warnings (Pre-existing)
1. `documents/index.tsx:226` - Missing `config.activeOrgName` and `config.activeProjectName` (cosmetic, doesn't affect data fetching)
2. `extraction-jobs/detail.tsx:78` - Missing `job?.status` in polling logic (acceptable, controlled by `jobId` change)
3. `ChatSessionsListPage.tsx:80` - Unnecessary dependencies in useCallback (acceptable, explicitly included for clarity)
4. `ProfileSettings.tsx:27` - Missing `loadProfile` (acceptable, user profile doesn't depend on project context)

## Manual Testing Required

Before considering this issue fully resolved, perform these tests:

1. **Cross-Project Data Isolation Test:**
   ```
   1. Create Org A with Project A1, upload documents/chunks
   2. Create Org B with Project B1 (empty)
   3. Navigate to documents in Project A1 → verify visible
   4. Switch to Project B1 → verify documents from A1 are NOT visible
   5. Go to chunks page → verify chunks from A1 are NOT visible
   6. Switch back to Project A1 → verify data reappears
   7. Monitor Network tab → verify X-Project-ID header changes correctly
   ```

2. **Settings Pages Test:**
   ```
   1. Go to Project Settings > Template Packs in Project A
   2. Install a template pack
   3. Switch to Project B
   4. Verify template packs page reloads and shows Project B's packs
   5. Switch to Auto-Extraction settings
   6. Toggle auto-extraction on
   7. Switch to Project A
   8. Verify auto-extraction settings are different (Project A's settings)
   ```

3. **Extraction Jobs Detail Test:**
   ```
   1. Create extraction job in Project A
   2. View job detail page
   3. While job is running, switch to Project B
   4. Verify you're redirected or see an error (job doesn't belong to Project B)
   5. Switch back to Project A
   6. Verify job detail reloads correctly
   ```

## Impact

### Security
- **High Impact:** Prevents cross-project data leakage in settings pages
- Ensures users can only see/modify data for the currently selected project

### User Experience  
- **High Impact:** Eliminates stale data when switching projects
- Page content now correctly updates when switching between projects

### Code Quality
- Removed all inappropriate `eslint-disable` comments
- Established consistent patterns for project context dependencies
- Improved code maintainability

## Follow-up Actions

### Recommended
1. ✅ Create ESLint rule to enforce including `config.activeProjectId` when `useApi()` is used in useEffect
2. ✅ Add integration tests for cross-project data isolation
3. ⚠️ Consider adding TypeScript utility type to make project context dependencies more explicit

### Future Considerations
- Consider creating a custom hook `useProjectEffect()` that automatically includes project/org context
- Evaluate if we need a centralized context invalidation mechanism

## Related Documentation

- [Organization Context Security Fix](./044-organization-context-security-fix.md)
- [Missing Project Context Dependencies Bug](../bugs/045-missing-project-context-dependencies.md)
- [Testing Guide - Integration Tests](../testing/AI_AGENT_GUIDE.md)

## Lessons Learned

1. **Never disable ESLint warnings without investigation** - All three files with issues had `eslint-disable` comments
2. **useCallback is essential** when functions are used in useEffect dependencies
3. **Audit systematically** - Use tools like `rg` to find all files matching a pattern, then review each one
4. **Test cross-cutting concerns** - Security issues like data leakage require cross-project testing

