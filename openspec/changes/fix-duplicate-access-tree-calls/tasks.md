# Implementation Tasks

## 1. Context Provider Implementation

- [x] 1.1 Create `apps/admin/src/contexts/access-tree.tsx` with AccessTreeContext and AccessTreeProvider
- [x] 1.2 Move fetch logic from `use-access-tree.ts` into the provider's internal state
- [x] 1.3 Implement single fetch on provider mount with shared state, loading, error, and refresh function
- [x] 1.4 Add console logging for debugging (same as current hook for consistency)
- [x] 1.5 Export `useAccessTreeContext()` hook that throws error if used outside provider

## 2. Hook Refactoring

- [x] 2.1 Replace `use-access-tree.ts` hook to use context internally (maintain backward compatibility temporarily)
- [x] 2.2 Update `use-organizations.ts` to consume context instead of calling useAccessTree
- [x] 2.3 Update `use-projects.ts` to consume context instead of calling useAccessTree
- [x] 2.4 Verify all hooks still return the same interface for backward compatibility

## 3. Component Updates

- [x] 3.1 Update `SetupGuard.tsx` to use context directly via `useAccessTreeContext()`
- [x] 3.2 Update `OrgAndProjectGate/index.tsx` to use context directly via `useAccessTreeContext()`
- [x] 3.3 Verify `TopbarProfileMenu.tsx` works correctly (via useOrganizations refactor)
- [x] 3.4 Verify `AdminLayout.tsx` works correctly (via useProjects refactor)

## 4. App Integration

- [x] 4.1 Locate app root component (likely `main.tsx` or router configuration)
- [x] 4.2 Wrap application with `<AccessTreeProvider>` above `<AuthProvider>` and routing
- [x] 4.3 Ensure provider wraps all routes that need access tree data

## 5. Testing & Validation

- [x] 5.1 Test page load with browser DevTools Network tab - verify single `/api/user/orgs-and-projects` call
- [x] 5.2 Test org creation flow - ensure refresh updates all components
- [x] 5.3 Test project creation flow - ensure refresh updates all components
- [x] 5.4 Test org switching in TopbarProfileMenu - verify data consistency
- [x] 5.5 Test project switching in Sidebar - verify data consistency
- [x] 5.6 Test SetupGuard redirect logic with no orgs/projects
- [x] 5.7 Run existing tests: `nx run admin:test` to ensure no regressions
- [x] 5.8 Run E2E tests: `nx run admin:e2e` to validate full flows

## 6. Cleanup & Documentation

- [x] 6.1 Remove console.log statements or reduce verbosity after validation
- [x] 6.2 Update component JSDoc comments to reference context usage
- [x] 6.3 Mark `useAccessTree()` as deprecated with migration guidance (if keeping for compatibility)
- [x] 6.4 Consider removing `useAccessTree()` export if all internal usage migrated to context

## 7. Additional Fixes (Added Nov 17, 2025)

- [x] 7.1 Add authentication check to prevent fetching when user is not authenticated
- [x] 7.2 Add StrictMode guard to prevent double-fetch in development mode
- [x] 7.3 Add console logging for skipped fetches (not authenticated, StrictMode duplicate)
- [x] 7.4 Test landing page without auth - verify no API calls are made (VERIFIED via Playwright)
- [x] 7.5 Test landing page after login - verify single API call is made (VERIFIED via Chrome DevTools)
- [x] 7.6 Update design.md to document the auth check and StrictMode guard
