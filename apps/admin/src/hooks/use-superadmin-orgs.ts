import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type {
  PaginationMeta,
  SuperadminOrg,
  ListOrgsResponse,
} from '@/types/superadmin';

// Re-export types for convenience
export type { SuperadminOrg, ListOrgsResponse } from '@/types/superadmin';

export interface UseSuperadminOrgsResult {
  organizations: SuperadminOrg[];
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSuperadminOrgs(
  params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}
): UseSuperadminOrgsResult {
  const { apiBase, fetchJson } = useApi();
  const [organizations, setOrganizations] = useState<SuperadminOrg[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { page = 1, limit = 100, search } = params;

  const fetchOrgs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (search) {
        queryParams.set('search', search);
      }

      const response = await fetchJson<ListOrgsResponse>(
        `${apiBase}/api/superadmin/organizations?${queryParams.toString()}`
      );

      setOrganizations(response.organizations);
      setMeta(response.meta);
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error('Failed to fetch organizations')
      );
      setOrganizations([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, search]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  return {
    organizations,
    meta,
    isLoading,
    error,
    refetch: fetchOrgs,
  };
}
