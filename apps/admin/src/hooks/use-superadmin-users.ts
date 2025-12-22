import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type {
  ListUsersResponse,
  ListUsersParams,
  SuperadminUser,
  PaginationMeta,
} from '@/types/superadmin';

export interface UseSuperadminUsersResult {
  users: SuperadminUser[];
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const DEFAULT_META: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

export function useSuperadminUsers(
  params: ListUsersParams = {}
): UseSuperadminUsersResult {
  const { apiBase, fetchJson } = useApi();
  const [users, setUsers] = useState<SuperadminUser[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { page = 1, limit = 20, search, orgId } = params;

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (search) queryParams.set('search', search);
      if (orgId) queryParams.set('orgId', orgId);

      const response = await fetchJson<ListUsersResponse>(
        `${apiBase}/api/superadmin/users?${queryParams.toString()}`
      );

      setUsers(response.users);
      setMeta(response.meta);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch users'));
      setUsers([]);
      setMeta(DEFAULT_META);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, search, orgId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    meta,
    isLoading,
    error,
    refetch: fetchUsers,
  };
}
