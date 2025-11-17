import { useAccessTreeContext } from '@/contexts/access-tree';

// Re-export types for backward compatibility
export type { OrgWithProjects, ProjectWithRole } from '@/contexts/access-tree';

/**
 * Hook to fetch and manage user's access tree (organizations + projects with roles).
 * Now backed by AccessTreeContext for optimal performance (single API call shared across components).
 *
 * @deprecated Consider using useAccessTreeContext() directly for better clarity.
 * This hook is maintained for backward compatibility.
 *
 * @returns Access tree data with flattened orgs/projects and role lookup helpers
 *
 * @example
 * ```tsx
 * const { tree, orgs, projects, getOrgRole, getProjectRole, loading, error, refresh } = useAccessTree();
 *
 * // Get user's role in an org
 * const role = getOrgRole(orgId);  // 'org_admin' | 'org_member' | undefined
 *
 * // Get user's role in a project
 * const projRole = getProjectRole(projectId);  // 'project_admin' | 'project_member' | undefined
 * ```
 */
export function useAccessTree() {
  // Simply delegate to the context - all components now share the same data
  return useAccessTreeContext();
}
