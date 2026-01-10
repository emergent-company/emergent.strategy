import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type {
  ListSyncJobsResponse,
  ListSyncJobsParams,
  SyncJob,
  SyncJobStats,
  PaginationMeta,
  DeleteSyncJobsResponse,
  CancelSyncJobsResponse,
  SyncJobLogsResponse,
} from '@/types/superadmin';

export interface UseSuperadminSyncJobsResult {
  jobs: SyncJob[];
  stats: SyncJobStats | null;
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  deleteJobs: (ids: string[]) => Promise<DeleteSyncJobsResponse>;
  cancelJobs: (ids: string[]) => Promise<CancelSyncJobsResponse>;
  getJobLogs: (id: string) => Promise<SyncJobLogsResponse>;
}

const DEFAULT_META: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

const DEFAULT_STATS: SyncJobStats = {
  total: 0,
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  withErrors: 0,
  totalItemsImported: 0,
};

export function useSuperadminSyncJobs(
  params: ListSyncJobsParams = {}
): UseSuperadminSyncJobsResult {
  const { apiBase, fetchJson } = useApi();
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [stats, setStats] = useState<SyncJobStats | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { page = 1, limit = 20, status, projectId, hasError } = params;

  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (status) queryParams.set('status', status);
      if (projectId) queryParams.set('projectId', projectId);
      if (hasError !== undefined) queryParams.set('hasError', String(hasError));

      const response = await fetchJson<ListSyncJobsResponse>(
        `${apiBase}/api/superadmin/sync-jobs?${queryParams.toString()}`
      );

      setJobs(response.jobs);
      setStats(response.stats);
      setMeta(response.meta);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch sync jobs'));
      setJobs([]);
      setStats(DEFAULT_STATS);
      setMeta(DEFAULT_META);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, status, projectId, hasError]);

  const deleteJobs = useCallback(
    async (ids: string[]): Promise<DeleteSyncJobsResponse> => {
      const response = await fetchJson<DeleteSyncJobsResponse>(
        `${apiBase}/api/superadmin/sync-jobs/delete`,
        {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }
      );
      return response;
    },
    [apiBase, fetchJson]
  );

  const cancelJobs = useCallback(
    async (ids: string[]): Promise<CancelSyncJobsResponse> => {
      const response = await fetchJson<CancelSyncJobsResponse>(
        `${apiBase}/api/superadmin/sync-jobs/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }
      );
      return response;
    },
    [apiBase, fetchJson]
  );

  const getJobLogs = useCallback(
    async (id: string): Promise<SyncJobLogsResponse> => {
      const response = await fetchJson<SyncJobLogsResponse>(
        `${apiBase}/api/superadmin/sync-jobs/${id}/logs`
      );
      return response;
    },
    [apiBase, fetchJson]
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return {
    jobs,
    stats,
    meta,
    isLoading,
    error,
    refetch: fetchJobs,
    deleteJobs,
    cancelJobs,
    getJobLogs,
  };
}
