import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useApi } from '@/hooks/use-api';

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
  const [tree, setTree] = useState<OrgWithProjects[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    console.log('[AccessTreeProvider] refresh() called');
    setLoading(true);
    setError(undefined);
    try {
      console.log(
        '[AccessTreeProvider] Fetching from:',
        `${apiBase}/api/user/orgs-and-projects`
      );
      const data = await fetchJson<OrgWithProjects[]>(
        `${apiBase}/api/user/orgs-and-projects`,
        {
          credentials: 'include',
        }
      );
      console.log('[AccessTreeProvider] Response:', data.length, 'orgs');
      setTree(data);
    } catch (e) {
      console.error('[AccessTreeProvider] Error:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [apiBase, fetchJson]);

  // Fetch once on provider mount
  useEffect(() => {
    refresh().catch(() => void 0);
  }, [refresh]);

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
