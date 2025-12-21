import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/contexts/useAuth';
import { ApiError } from '@/lib/api-error';

/**
 * Organization with nested projects and user roles
 */
export type OrgWithProjects = {
  id: string;
  name: string;
  role: string;
  projects: ProjectWithRole[];
};

/**
 * Project with user role
 */
export type ProjectWithRole = {
  id: string;
  name: string;
  orgId: string;
  role: string;
  kb_purpose?: string;
  auto_extract_objects?: boolean;
  auto_extract_config?: any;
};

/**
 * Access tree context value shared across all consumers
 */
export type AccessTreeContextValue = {
  /** Raw hierarchical data */
  tree: OrgWithProjects[];
  /** All organizations user has access to */
  orgs: Array<{ id: string; name: string; role: string }>;
  /** All projects flattened from all orgs */
  projects: ProjectWithRole[];
  /** Lookup org role by org ID */
  getOrgRole: (orgId: string) => string | undefined;
  /** Lookup project role by project ID */
  getProjectRole: (projectId: string) => string | undefined;
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | undefined;
  /** Refresh access tree data */
  refresh: () => Promise<void>;
};

const AccessTreeContext = createContext<AccessTreeContextValue | undefined>(
  undefined
);

// Export the context for testing/mocking purposes
export { AccessTreeContext };

/**
 * Provider that maintains a single shared state for user access tree data.
 * Should be placed at app root, above routing but below AuthProvider.
 *
 * @example
 * ```tsx
 * <AccessTreeProvider>
 *   <Router>
 *     <App />
 *   </Router>
 * </AccessTreeProvider>
 * ```
 */
export function AccessTreeProvider({ children }: { children: ReactNode }) {
  const { apiBase, fetchJson } = useApi();
  const { isAuthenticated, isInitialized, logout } = useAuth();
  const location = useLocation();
  const [tree, setTree] = useState<OrgWithProjects[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Check if we're on an auth route (login, callback, logged-out, etc.)
  // These routes should not show the access tree error UI
  const isAuthRoute = location.pathname.startsWith('/auth/');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await fetchJson<OrgWithProjects[]>(
        `${apiBase}/api/user/orgs-and-projects`,
        {
          credentials: 'include',
        }
      );
      setTree(data);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';

      // For 401/403 errors, clear auth and don't set error state
      // The auth system will handle the redirect to login
      if (e instanceof ApiError && e.isAuthError()) {
        logout();
        // Don't set error state - let the app redirect to login
        // This prevents showing the error UI for auth issues
        return;
      }

      // For other errors (especially 5xx), set error state to show error UI
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchJson, logout]);

  // Prevent double-fetch in React StrictMode (development only)
  const hasFetchedRef = useRef(false);

  // Fetch once on provider mount, only if authenticated
  useEffect(() => {
    // Skip if already fetched (StrictMode guard)
    if (hasFetchedRef.current) {
      return;
    }

    // Skip if auth not initialized yet
    if (!isInitialized) {
      return;
    }

    // Skip if not authenticated
    if (!isAuthenticated) {
      console.log('[AccessTreeProvider] Skipping fetch (not authenticated)');
      setLoading(false);
      return;
    }

    // Skip if on auth route - these pages don't need access tree data
    if (isAuthRoute) {
      console.log('[AccessTreeProvider] Skipping fetch (auth route)');
      setLoading(false);
      return;
    }

    console.log(
      '[AccessTreeProvider] Auth initialized and authenticated, fetching data'
    );
    hasFetchedRef.current = true;
    refresh().catch(() => void 0);
  }, [refresh, isAuthenticated, isInitialized, isAuthRoute]);

  // Memoize flattened data and lookup helpers
  const value: AccessTreeContextValue = useMemo(() => {
    if (tree.length === 0 && !loading && !error) {
      // Return empty data structure when no tree loaded yet
      return {
        tree: [],
        orgs: [],
        projects: [],
        getOrgRole: () => undefined,
        getProjectRole: () => undefined,
        loading,
        error,
        refresh,
      };
    }

    // Flatten orgs (without projects array)
    const orgs = tree.map(({ id, name, role }) => ({ id, name, role }));

    // Flatten all projects from all orgs
    const projects = tree.flatMap((org) => org.projects);

    // Create role lookup maps for O(1) access
    const orgRoleMap = new Map<string, string>();
    const projectRoleMap = new Map<string, string>();

    tree.forEach((org) => {
      orgRoleMap.set(org.id, org.role);
      org.projects.forEach((project) => {
        projectRoleMap.set(project.id, project.role);
      });
    });

    return {
      tree,
      orgs,
      projects,
      getOrgRole: (orgId: string) => orgRoleMap.get(orgId),
      getProjectRole: (projectId: string) => projectRoleMap.get(projectId),
      loading,
      error,
      refresh,
    };
  }, [tree, loading, error, refresh]);

  // Show global error state if API fetch failed
  // This prevents any page from rendering when we can't load user access data
  // Skip error UI for auth routes (login, logout, callback) - they don't need access tree
  if (error && !loading && !isAuthRoute) {
    return (
      <div className="flex justify-center items-center bg-base-200 min-h-screen">
        <div className="mx-4 w-full max-w-md">
          <div className="bg-base-100 shadow-xl border border-base-300 card">
            <div className="space-y-4 card-body">
              <div className="text-center">
                <div className="inline-flex bg-error/10 mb-4 p-3 rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-8 text-error"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h1 className="justify-center font-bold text-2xl card-title">
                  Server Error
                </h1>
                <p className="mt-2 text-base-content/70">
                  Unable to load your organizations and projects
                </p>
              </div>

              <div
                role="alert"
                className="alert alert-error"
                data-testid="access-tree-error"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm">{error}</span>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full btn btn-primary"
                  data-testid="access-tree-retry"
                >
                  Retry
                </button>
                <p className="text-sm text-base-content/60 text-center">
                  If the problem persists, please contact support
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AccessTreeContext.Provider value={value}>
      {children}
    </AccessTreeContext.Provider>
  );
}

/**
 * Hook to access the shared access tree context.
 * Must be used within <AccessTreeProvider>.
 *
 * @throws Error if used outside of AccessTreeProvider
 *
 * @example
 * ```tsx
 * const { tree, orgs, projects, getOrgRole, getProjectRole, loading, error, refresh } = useAccessTreeContext();
 * ```
 */
export function useAccessTreeContext(): AccessTreeContextValue {
  const context = useContext(AccessTreeContext);
  if (context === undefined) {
    throw new Error(
      'useAccessTreeContext must be used within an AccessTreeProvider. ' +
        'Wrap your app with <AccessTreeProvider> at the root level.'
    );
  }
  return context;
}
