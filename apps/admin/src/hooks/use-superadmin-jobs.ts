import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type {
  ListEmbeddingJobsResponse,
  ListEmbeddingJobsParams,
  EmbeddingJob,
  EmbeddingJobStats,
  PaginationMeta,
  DeleteEmbeddingJobsResponse,
  CleanupOrphanJobsResponse,
  EmbeddingJobType,
} from '@/types/superadmin';

export interface UseSuperadminJobsResult {
  jobs: EmbeddingJob[];
  stats: EmbeddingJobStats | null;
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  deleteJobs: (
    ids: string[],
    type: EmbeddingJobType
  ) => Promise<DeleteEmbeddingJobsResponse>;
  cleanupOrphans: () => Promise<CleanupOrphanJobsResponse>;
}

const DEFAULT_META: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

const DEFAULT_STATS: EmbeddingJobStats = {
  graphTotal: 0,
  graphPending: 0,
  graphCompleted: 0,
  graphFailed: 0,
  graphWithErrors: 0,
  chunkTotal: 0,
  chunkPending: 0,
  chunkCompleted: 0,
  chunkFailed: 0,
  chunkWithErrors: 0,
};

export function useSuperadminJobs(
  params: ListEmbeddingJobsParams = {}
): UseSuperadminJobsResult {
  const { apiBase, fetchJson } = useApi();
  const [jobs, setJobs] = useState<EmbeddingJob[]>([]);
  const [stats, setStats] = useState<EmbeddingJobStats | null>(null);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { page = 1, limit = 20, type, status, hasError, projectId } = params;

  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('limit', String(limit));
      if (type) queryParams.set('type', type);
      if (status) queryParams.set('status', status);
      if (hasError !== undefined) queryParams.set('hasError', String(hasError));
      if (projectId) queryParams.set('projectId', projectId);

      const response = await fetchJson<ListEmbeddingJobsResponse>(
        `${apiBase}/api/superadmin/embedding-jobs?${queryParams.toString()}`
      );

      setJobs(response.jobs);
      setStats(response.stats);
      setMeta(response.meta);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch jobs'));
      setJobs([]);
      setStats(DEFAULT_STATS);
      setMeta(DEFAULT_META);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, type, status, hasError, projectId]);

  const deleteJobs = useCallback(
    async (
      ids: string[],
      jobType: EmbeddingJobType
    ): Promise<DeleteEmbeddingJobsResponse> => {
      const response = await fetchJson<DeleteEmbeddingJobsResponse>(
        `${apiBase}/api/superadmin/embedding-jobs/delete`,
        {
          method: 'POST',
          body: JSON.stringify({ ids, type: jobType }),
        }
      );
      return response;
    },
    [apiBase, fetchJson]
  );

  const cleanupOrphans =
    useCallback(async (): Promise<CleanupOrphanJobsResponse> => {
      const response = await fetchJson<CleanupOrphanJobsResponse>(
        `${apiBase}/api/superadmin/embedding-jobs/cleanup-orphans`,
        {
          method: 'POST',
        }
      );
      return response;
    }, [apiBase, fetchJson]);

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
    cleanupOrphans,
  };
}
