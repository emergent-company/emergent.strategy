# Design: Fix Duplicate Access Tree API Calls

## Context

The current implementation uses `useAccessTree()` as a custom hook that each component invokes independently. Because React hooks are not globally shared by default, every component mounting with `useAccessTree()` creates a new instance with its own state and useEffect, resulting in multiple concurrent API calls.

**Current call chain:**

```
App Mount
├── SetupGuard → useAccessTree() → fetch #1
├── AdminLayout → useProjects() → useAccessTree() → fetch #2
│   └── Sidebar.ProjectDropdown (data from parent)
├── Topbar → TopbarProfileMenu → useOrganizations() → useAccessTree() → fetch #3
└── OrgAndProjectGate → useAccessTree() → fetch #4
    └── (possible re-renders) → fetch #5, #6, etc.
```

Each hook instance runs its own `useEffect(() => { refresh() }, [refresh])` on mount, causing simultaneous fetches.

## Goals / Non-Goals

**Goals:**

- Reduce `/api/user/orgs-and-projects` calls from 6 to 1 per page load
- Maintain existing component interfaces and behavior
- Share access tree state globally across all components
- Preserve refresh functionality for org/project creation flows

**Non-Goals:**

- Caching across page reloads (localStorage caching is out of scope)
- Server-side rendering optimizations
- Advanced state management libraries (Redux, Zustand) - keep it simple with React Context
- Refactoring other data fetching patterns (this is scoped to access tree only)

## Decisions

### Decision 1: Use React Context instead of custom hook

**Rationale:** React Context provides a single source of truth that persists for the lifetime of the provider's component tree. All children components will share the same state instance, eliminating duplicate fetches.

**Alternatives considered:**

1. **Singleton/module-level state:** Could work but doesn't integrate well with React lifecycle and would require manual subscription management
2. **React Query / SWR:** Adds external dependency and complexity for a simple use case
3. **Prop drilling from App root:** Verbose and would require changing many component signatures

**Selected approach:**

- Create `AccessTreeProvider` that wraps the app at root level
- Provider maintains single state instance with `loading`, `error`, `tree`, and derived data
- Export `useAccessTreeContext()` hook that accesses the context with proper error handling
- Maintain backward compatibility by keeping `useOrganizations()` and `useProjects()` facades

### Decision 2: Preserve existing hook APIs temporarily

**Rationale:** Components like `TopbarProfileMenu` and `AdminLayout` use `useOrganizations()` and `useProjects()`. Rather than updating all callsites, we'll refactor these hooks to internally use the context, maintaining the same return interface.

This minimizes code changes and reduces risk of breaking existing functionality.

### Decision 3: Keep console logging during migration

**Rationale:** The current `useAccessTree()` has extensive console logging for debugging. We'll preserve this in the provider during migration to help identify any issues with the context refactor. Can be cleaned up in a follow-up task after validation.

### Decision 4: Add authentication check and StrictMode guard

**Rationale:** During testing, we discovered two issues:

1. **React StrictMode double-render:** In development mode, React 18's StrictMode intentionally runs effects twice to help detect side effects. This caused duplicate API calls even with the context provider.
2. **Unauthenticated fetches:** The provider was attempting to fetch access tree data even when the user wasn't authenticated, resulting in 401 errors on the landing page.

**Solution:**

- **Authentication check:** Use `useAuth()` to check `isAuthenticated` before fetching. Skip the fetch if the user is not authenticated, and set `loading` to `false` immediately.
- **StrictMode guard:** Use a `useRef` flag (`hasFetchedRef`) to track if the fetch has already been initiated. On subsequent effect runs (StrictMode duplicate), skip the fetch.

**Impact:**

- Landing page (unauthenticated): 0 API calls (was 2 failing calls before)
- After login (authenticated): 1 API call (was 2 duplicate calls before)
- Clear console logging indicates why fetches are skipped

## Architecture

### New Component Hierarchy

```tsx
<AccessTreeProvider>
  {' '}
  {/* New: Single fetch on mount */}
  <AuthProvider>
    <Router>
      <SetupGuard>
        {' '}
        {/* Uses useAccessTreeContext() */}
        <AdminLayout>
          {' '}
          {/* Uses useProjects() → context */}
          <Sidebar.ProjectDropdown />
          <Topbar>
            <TopbarProfileMenu /> {/* Uses useOrganizations() → context */}
          </Topbar>
          <OrgAndProjectGate>
            {' '}
            {/* Uses useAccessTreeContext() */}
            {children}
          </OrgAndProjectGate>
        </AdminLayout>
      </SetupGuard>
    </Router>
  </AuthProvider>
</AccessTreeProvider>
```

### Context API Structure

```typescript
type AccessTreeContextValue = {
  // Raw tree data
  tree: OrgWithProjects[];

  // Derived/flattened data
  orgs: Array<{ id: string; name: string; role: string }>;
  projects: ProjectWithRole[];

  // Lookup helpers
  getOrgRole: (orgId: string) => string | undefined;
  getProjectRole: (projectId: string) => string | undefined;

  // State flags
  loading: boolean;
  error: string | undefined;

  // Actions
  refresh: () => Promise<void>;
};
```

### Provider Implementation Pattern

```typescript
export function AccessTreeProvider({ children }: { children: ReactNode }) {
  const { apiBase, fetchJson } = useApi();
  const [tree, setTree] = useState<OrgWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    console.log('[AccessTreeProvider] Fetching access tree...');
    setLoading(true);
    setError(undefined);
    try {
      const data = await fetchJson<OrgWithProjects[]>(
        `${apiBase}/api/user/orgs-and-projects`,
        { credentials: 'include' }
      );
      console.log('[AccessTreeProvider] Loaded', data.length, 'orgs');
      setTree(data);
    } catch (e) {
      console.error('[AccessTreeProvider] Error:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchJson]);

  // Prevent double-fetch in React StrictMode (development only)
  const hasFetchedRef = useRef(false);

  // Get auth state to only fetch when authenticated
  const { isAuthenticated } = useAuth();

  // Fetch once on provider mount, only if authenticated
  useEffect(() => {
    // Skip if already fetched (StrictMode guard)
    if (hasFetchedRef.current) {
      console.log('[AccessTreeProvider] Skipping duplicate fetch (StrictMode)');
      return;
    }

    // Skip if not authenticated
    if (!isAuthenticated) {
      console.log('[AccessTreeProvider] Skipping fetch (not authenticated)');
      setLoading(false);
      return;
    }

    hasFetchedRef.current = true;
    refresh().catch(() => void 0);
  }, [refresh, isAuthenticated]);

  // Memoize derived data
  const value = useMemo(() => {
    // ... compute orgs, projects, getOrgRole, getProjectRole
    return {
      tree,
      orgs,
      projects,
      getOrgRole,
      getProjectRole,
      loading,
      error,
      refresh,
    };
  }, [tree, loading, error, refresh]);

  return (
    <AccessTreeContext.Provider value={value}>
      {children}
    </AccessTreeContext.Provider>
  );
}
```

## Risks / Trade-offs

### Risk: Provider placement in component tree

**Mitigation:** Provider must be placed above `<Router>` but below `<AuthProvider>` (since useApi depends on auth). Incorrect placement will cause runtime errors. Document clearly in implementation and add context boundary error handling.

### Risk: Breaking changes to existing code

**Mitigation:** Maintain `useOrganizations()` and `useProjects()` hooks with same interface. Only internal implementation changes. Components using these hooks don't need updates. Mark `useAccessTree()` as deprecated but keep it functional for gradual migration.

### Trade-off: Global state vs. component-local state

**Pro:** Single API call, consistent data across components
**Con:** All components re-render when tree updates (e.g., after org/project creation)

**Mitigation:** Use React.memo or useMemo on components that don't need to react to every tree change. In practice, tree updates are rare (only on org/project CRUD), so re-render cost is acceptable.

### Trade-off: Context re-renders

When `refresh()` is called after creating an org or project, all context consumers will re-render. This is intentional and desired behavior (all components need fresh data).

## Migration Plan

1. **Phase 1 - Create context infrastructure** (non-breaking)

   - Add `AccessTreeProvider` and `useAccessTreeContext()`
   - Provider initially unused, code still uses hooks

2. **Phase 2 - Integrate provider** (non-breaking)

   - Wrap app root with `<AccessTreeProvider>`
   - Hooks still work independently (dual-fetching temporarily)
   - Validate provider is fetching correctly

3. **Phase 3 - Migrate hooks to context** (potentially breaking)

   - Refactor `useOrganizations()` to use context
   - Refactor `useProjects()` to use context
   - Update `SetupGuard` and `OrgAndProjectGate` to use context directly
   - This step reduces 6 calls to 1

4. **Phase 4 - Testing & validation**

   - Manual testing: open DevTools Network tab, load `/admin/apps/documents`, verify 1 call
   - Automated tests: run `nx run admin:test` and `nx run admin:e2e`
   - Test all CRUD flows: org creation, project creation, switching

5. **Phase 5 - Cleanup**
   - Optionally remove `useAccessTree()` export (mark as internal or delete)
   - Remove verbose console logging
   - Update documentation

## Rollback Plan

If issues arise:

1. Remove `<AccessTreeProvider>` wrapper from app root
2. Revert hooks to call original `useAccessTree()` logic directly
3. Accept 6 API calls temporarily while investigating

Since hooks maintain backward-compatible interfaces, rollback should be straightforward.

## Open Questions

1. **Q:** Should we add localStorage caching for access tree to persist across page reloads?
   **A:** Out of scope for this change. Can be added later as enhancement.

2. **Q:** Should we migrate away from `useOrganizations()` / `useProjects()` entirely?
   **A:** No, keeping them provides cleaner API for components that only need orgs or projects (not full tree).

3. **Q:** Should we add request deduplication if multiple components call refresh() simultaneously?
   **A:** Not needed - context refresh is a single function. Only one fetch can run at a time.
