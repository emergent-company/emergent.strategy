import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type { PaginationMeta } from '@/types/superadmin';

export interface SuperadminProject {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  documentCount: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface ListProjectsResponse {
  projects: SuperadminProject[];
  meta: PaginationMeta;
}

export interface UseSuperadminProjectsResult {
  projects: SuperadminProject[];
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSuperadminProjects(
  params: {
    page?: number;
    limit?: number;
    orgId?: string;
    search?: string;
  } = {}
): UseSuperadminProjectsResult {
  const { apiBase, fetchJson } = useApi();
  const [projects, setProjects] = useState<SuperadminProject[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { page = 1, limit = 20, orgId, search } = params;

  const fetchProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (orgId) {
        queryParams.set('orgId', orgId);
      }
      if (search) {
        queryParams.set('search', search);
      }

      const response = await fetchJson<ListProjectsResponse>(
        `${apiBase}/api/superadmin/projects?${queryParams.toString()}`
      );

      setProjects(response.projects);
      setMeta(response.meta);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch projects'));
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, orgId, search]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return {
    projects,
    meta,
    isLoading,
    error,
    refetch: fetchProjects,
  };
}
