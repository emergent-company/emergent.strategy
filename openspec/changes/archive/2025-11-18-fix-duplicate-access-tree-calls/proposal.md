# Change: Fix Duplicate Access Tree API Calls

## Why

Currently, loading any admin page (e.g., `/admin/apps/documents`) triggers 6 calls to the `/api/user/orgs-and-projects` endpoint. This happens because multiple components independently invoke `useAccessTree()`, and each hook instance maintains its own state and triggers its own fetch. The component tree includes:

1. `SetupGuard` (route guard) - calls `useAccessTree()`
2. `AdminLayout` - calls `useProjects()` → which internally calls `useAccessTree()`
3. `Topbar` → `TopbarProfileMenu` - calls `useOrganizations()` → which internally calls `useAccessTree()`
4. `OrgAndProjectGateRedirect` → `OrgAndProjectGate` - calls `useAccessTree()`
5. `Sidebar.ProjectDropdown` (via AdminLayout's `useProjects()`)
6. Potential re-renders causing duplicate fetches

This creates unnecessary network traffic, increases server load, and degrades initial page load performance. The access tree endpoint was designed as a single source of truth, but the current hook architecture defeats this optimization by not sharing state across component instances.

## What Changes

- **BREAKING**: Replace `useAccessTree()` custom hook with a React Context provider pattern
- Add `AccessTreeProvider` that maintains a single global state for orgs/projects data
- Refactor `useOrganizations()` and `useProjects()` to consume the shared context instead of duplicating fetch logic
- Update all components (`SetupGuard`, `OrgAndProjectGate`, `AdminLayout`, `TopbarProfileMenu`) to use context
- Add `<AccessTreeProvider>` wrapper at the app root level (above routing)
- Ensure single fetch on mount with shared state across all consumers

## Impact

**Affected specs:**

- `frontend-data-fetching` (new) - defines requirements for efficient data loading and caching

**Affected code:**

- `apps/admin/src/hooks/use-access-tree.ts` - refactor to context pattern
- `apps/admin/src/contexts/access-tree.tsx` - new context provider
- `apps/admin/src/hooks/use-organizations.ts` - consume context instead of calling useAccessTree independently
- `apps/admin/src/hooks/use-projects.ts` - consume context instead of calling useAccessTree independently
- `apps/admin/src/components/guards/SetupGuard.tsx` - consume context
- `apps/admin/src/components/organisms/OrgAndProjectGate/index.tsx` - consume context
- `apps/admin/src/components/organisms/Topbar/partials/TopbarProfileMenu.tsx` - no changes needed (uses useOrganizations)
- `apps/admin/src/pages/admin/layout.tsx` - no changes needed (uses useProjects)
- `apps/admin/src/main.tsx` or router setup - wrap app with `<AccessTreeProvider>`

**User-visible benefits:**

- Faster initial page load (1 API call instead of 6)
- Reduced network traffic
- Improved perceived performance
- Consistent data across all components without race conditions
