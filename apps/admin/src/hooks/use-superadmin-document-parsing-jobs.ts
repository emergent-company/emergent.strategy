import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';
import type {
  ListDocumentParsingJobsResponse,
  ListDocumentParsingJobsParams,
  DocumentParsingJob,
  DocumentParsingJobStats,
  PaginationMeta,
  DeleteDocumentParsingJobsResponse,
  RetryDocumentParsingJobsResponse,
} from '@/types/superadmin';

export interface UseSuperadminDocumentParsingJobsResult {
  jobs: DocumentParsingJob[];
  stats: DocumentParsingJobStats | null;
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  deleteJobs: (ids: string[]) => Promise<DeleteDocumentParsingJobsResponse>;
  retryJobs: (ids: string[]) => Promise<RetryDocumentParsingJobsResponse>;
}

const DEFAULT_META: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

const DEFAULT_STATS: DocumentParsingJobStats = {
  total: 0,
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  retryPending: 0,
  withErrors: 0,
  totalFileSizeBytes: 0,
};

export function useSuperadminDocumentParsingJobs(
  params: ListDocumentParsingJobsParams = {}
): UseSuperadminDocumentParsingJobsResult {
  const { apiBase, fetchJson } = useApi();
  const [jobs, setJobs] = useState<DocumentParsingJob[]>([]);
  const [stats, setStats] = useState<DocumentParsingJobStats | null>(null);
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

      const response = await fetchJson<ListDocumentParsingJobsResponse>(
        `${apiBase}/api/superadmin/document-parsing-jobs?${queryParams.toString()}`
      );

      setJobs(response.jobs);
      setStats(response.stats);
      setMeta(response.meta);
    } catch (e) {
      setError(
        e instanceof Error
          ? e
          : new Error('Failed to fetch document parsing jobs')
      );
      setJobs([]);
      setStats(DEFAULT_STATS);
      setMeta(DEFAULT_META);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, page, limit, status, projectId, hasError]);

  const deleteJobs = useCallback(
    async (ids: string[]): Promise<DeleteDocumentParsingJobsResponse> => {
      const response = await fetchJson<DeleteDocumentParsingJobsResponse>(
        `${apiBase}/api/superadmin/document-parsing-jobs/delete`,
        {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }
      );
      return response;
    },
    [apiBase, fetchJson]
  );

  const retryJobs = useCallback(
    async (ids: string[]): Promise<RetryDocumentParsingJobsResponse> => {
      const response = await fetchJson<RetryDocumentParsingJobsResponse>(
        `${apiBase}/api/superadmin/document-parsing-jobs/retry`,
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
    retryJobs,
  };
}
