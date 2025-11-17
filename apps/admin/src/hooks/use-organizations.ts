import { useCallback } from 'react';
import { normalizeOrgId } from '@/utils/org-id';
import { useApi } from '@/hooks/use-api';
import { useAccessTreeContext } from '@/contexts/access-tree';

export type Organization = {
  id: string;
  name: string;
  slug?: string;
};

/**
 * Hook to fetch organizations (now backed by access tree context).
 * Maintained for backward compatibility with existing code.
 *
 * @deprecated Consider using useAccessTreeContext() directly for better performance
 */
export function useOrganizations() {
  const { apiBase, fetchJson } = useApi();
  const {
    orgs: accessTreeOrgs,
    loading,
    error,
    refresh: refreshTree,
  } = useAccessTreeContext();

  // Map access tree orgs to Organization type (normalize IDs for legacy compatibility)
  const orgs = accessTreeOrgs.map((o) => ({
    id: normalizeOrgId(o.id) || o.id,
    name: o.name,
  }));

  const createOrg = useCallback(
    async (name: string): Promise<Organization> => {
      const data = await fetchJson<Organization, { name: string }>(
        `${apiBase}/api/orgs`,
        {
          method: 'POST',
          body: { name },
          credentials: 'include',
        }
      );
      // Refresh access tree to get updated data
      await refreshTree();
      return {
        ...data,
        id: normalizeOrgId(data.id) || data.id,
      };
    },
    [apiBase, fetchJson, refreshTree]
  );

  return { orgs, loading, error, refresh: refreshTree, createOrg } as const;
}
