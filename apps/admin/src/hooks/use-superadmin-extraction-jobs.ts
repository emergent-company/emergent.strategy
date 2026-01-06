import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type {
  ListExtractionJobsResponse,
  ListExtractionJobsParams,
  ExtractionJob,
  ExtractionJobStats,
  PaginationMeta,
  DeleteExtractionJobsResponse,
  CancelExtractionJobsResponse,
} from '@/types/superadmin';

export interface UseSuperadminExtractionJobsResult {
  jobs: ExtractionJob[];
  stats: ExtractionJobStats | null;
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  deleteJobs: (ids: string[]) => Promise<DeleteExtractionJobsResponse>;
  cancelJobs: (ids: string[]) => Promise<CancelExtractionJobsResponse>;
}

const DEFAULT_META: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

const DEFAULT_STATS: ExtractionJobStats = {
  total: 0,
  queued: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  cancelled: 0,
  withErrors: 0,
  totalObjectsCreated: 0,
  totalRelationshipsCreated: 0,
};

export function useSuperadminExtractionJobs(
  params: ListExtractionJobsParams = {}
): UseSuperadminExtractionJobsResult {
  const { apiBase, fetchJson } = useApi();
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [stats, setStats] = useState<ExtractionJobStats | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { page = 1, limit = 20, status, jobType, projectId, hasError } = params;

  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (status) queryParams.set('status', status);
      if (jobType) queryParams.set('jobType', jobType);
      if (projectId) queryParams.set('projectId', projectId);
      if (hasError !== undefined) queryParams.set('hasError', String(hasError));

      const response = await fetchJson<ListExtractionJobsResponse>(
        `${apiBase}/api/superadmin/extraction-jobs?${queryParams.toString()}`
      );

      setJobs(response.jobs);
      setStats(response.stats);
      setMeta(response.meta);
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error('Failed to fetch extraction jobs')
      );
      setJobs([]);
      setStats(DEFAULT_STATS);
      setMeta(DEFAULT_META);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, status, jobType, projectId, hasError]);

  const deleteJobs = useCallback(
    async (ids: string[]): Promise<DeleteExtractionJobsResponse> => {
      const response = await fetchJson<DeleteExtractionJobsResponse>(
        `${apiBase}/api/superadmin/extraction-jobs/delete`,
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
    async (ids: string[]): Promise<CancelExtractionJobsResponse> => {
      const response = await fetchJson<CancelExtractionJobsResponse>(
        `${apiBase}/api/superadmin/extraction-jobs/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }
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
  };
}
