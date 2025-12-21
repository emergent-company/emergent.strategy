/**
 * Extraction Jobs Page
 *
 * Main page for viewing and managing extraction jobs
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { PageContainer } from '@/components/layouts';
import { ExtractionJobFilters } from '@/components/organisms/ExtractionJobFilters';
import { ExtractionJobList } from '@/components/organisms/ExtractionJobList';
import type { ExtractionJobCardProps } from '@/components/organisms/ExtractionJobCard';
import type { ExtractionJobStatus } from '@/components/molecules/ExtractionJobStatusBadge';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { useDataUpdates } from '@/contexts/data-updates';
import { usePageVisibility } from '@/hooks/use-page-visibility';
import type { EntityEvent } from '@/types/realtime-events';
import {
  createExtractionJobsClient,
  type ExtractionJob,
} from '@/api/extraction-jobs';

// Debounce delay to batch rapid SSE events into single refetch
const SSE_DEBOUNCE_MS = 500;

// Fallback polling interval when SSE is disconnected (60 seconds)
const FALLBACK_POLL_INTERVAL_MS = 60000;

export interface ExtractionJobsPageProps {
  /** Initial list of jobs (for Storybook) */
  jobs?: ExtractionJobCardProps[];
  /** Loading state (for Storybook) */
  isLoading?: boolean;
  /** Total count of jobs (for Storybook) */
  totalCount?: number;
  /** Page size */
  pageSize?: number;
}

/**
 * Convert API job to card props
 */
function jobToCardProps(job: ExtractionJob): ExtractionJobCardProps {
  return {
    id: job.id,
    status: job.status,
    sourceDocument:
      job.source_metadata?.filename || job.source_metadata?.name || undefined,
    successfulItems: job.successful_items,
    failedItems: job.failed_items,
    processedItems: job.processed_items,
    totalItems: job.total_items,
    discoveredTypes: job.discovered_types,
    createdAt: job.created_at,
    completedAt: job.completed_at,
    errorMessage: job.error_message,
  };
}

export function ExtractionJobsPage(props: ExtractionJobsPageProps = {}) {
  const {
    jobs: storybookJobs,
    isLoading: storybookLoading,
    totalCount: storybookTotalCount,
    pageSize = 10,
  } = props;
  const navigate = useNavigate();
  const { apiBase, fetchJson } = useApi();
  const { config } = useConfig();
  const isVisible = usePageVisibility();

  // Filter state
  const [statusFilter, setStatusFilter] = useState<ExtractionJobStatus | 'all'>(
    'all'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Data state
  const [jobs, setJobs] = useState<ExtractionJobCardProps[]>(
    storybookJobs || []
  );
  const [isLoading, setIsLoading] = useState(storybookLoading ?? false);
  const [totalCount, setTotalCount] = useState(storybookTotalCount ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);

  // Ref for debounce timeout
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoize the fetch function
  const fetchJobs = useCallback(async () => {
    // Skip if we're in Storybook mode
    if (storybookJobs !== undefined) return;

    // Need active project
    if (!config.activeProjectId) {
      setError('No active project selected');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = createExtractionJobsClient(
        apiBase,
        fetchJson,
        config.activeProjectId
      );

      const response = await client.listJobs(undefined, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: currentPage,
        limit: pageSize,
      });

      setJobs(response.jobs.map(jobToCardProps));
      setTotalCount(response.total);
    } catch (err) {
      console.error('Failed to fetch extraction jobs:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load extraction jobs'
      );
      setJobs([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [
    config.activeProjectId,
    statusFilter,
    currentPage,
    pageSize,
    storybookJobs,
    apiBase,
    fetchJson,
  ]);

  // Debounced fetch to batch rapid SSE events
  const debouncedFetchJobs = useMemo(() => {
    return () => {
      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Set new timeout
      debounceTimeoutRef.current = setTimeout(() => {
        fetchJobs();
        debounceTimeoutRef.current = null;
      }, SSE_DEBOUNCE_MS);
    };
  }, [fetchJobs]);

  // SSE event handler for real-time updates
  const handleExtractionJobEvent = useCallback(
    (event: EntityEvent) => {
      // Skip in Storybook mode
      if (storybookJobs !== undefined) return;

      // Only refetch when visible to save resources
      if (!isVisible) return;

      console.debug(
        '[ExtractionJobsPage] SSE event received:',
        event.type,
        event.id
      );

      // Debounced refetch on any extraction job event
      debouncedFetchJobs();
    },
    [storybookJobs, isVisible, debouncedFetchJobs]
  );

  // Subscribe to SSE for extraction job events
  const { connectionState } = useDataUpdates(
    'extraction_job:*',
    handleExtractionJobEvent,
    [handleExtractionJobEvent]
  );

  // Initial fetch on mount and when filters change
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Fallback polling when SSE is disconnected
  useEffect(() => {
    // Skip in Storybook mode
    if (storybookJobs !== undefined) return;

    // Only poll if SSE is disconnected/errored AND tab is visible AND we have a project
    const shouldPoll =
      (connectionState === 'disconnected' || connectionState === 'error') &&
      isVisible &&
      config.activeProjectId;

    if (!shouldPoll) {
      return;
    }

    console.debug(
      '[ExtractionJobsPage] SSE disconnected, starting fallback polling'
    );

    // Poll at slower interval (60s) as fallback
    const interval = setInterval(fetchJobs, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      console.debug('[ExtractionJobsPage] Stopped fallback polling');
    };
  }, [
    connectionState,
    isVisible,
    config.activeProjectId,
    storybookJobs,
    fetchJobs,
  ]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Client-side search filtering (since API doesn't support search yet)
  const filteredJobs = jobs.filter((job) => {
    if (!searchQuery) return true;
    return (
      job.sourceDocument?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      false
    );
  });

  const totalPages = Math.ceil(
    (searchQuery ? filteredJobs.length : totalCount) / pageSize
  );
  const displayedJobs = searchQuery ? filteredJobs : jobs;

  // Clear all filters
  const handleClearFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Handle filter changes (reset to page 1)
  const handleStatusFilterChange = (status: ExtractionJobStatus | 'all') => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  // Handle job click
  const handleJobClick = (jobId: string) => {
    navigate(`/admin/extraction-jobs/${jobId}`);
  };

  // Handle bulk operations
  const handleBulkCancel = async () => {
    if (!config.activeProjectId) return;

    if (
      !window.confirm(
        'Are you sure you want to cancel all pending and running jobs?'
      )
    ) {
      return;
    }

    setBulkActionInProgress(true);
    setError(null);

    try {
      const client = createExtractionJobsClient(
        apiBase,
        fetchJson,
        config.activeProjectId
      );

      const result = await client.bulkCancelJobs();

      // Refresh job list
      const response = await client.listJobs(undefined, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: currentPage,
        limit: pageSize,
      });

      setJobs(response.jobs.map(jobToCardProps));
      setTotalCount(response.total);

      alert(result.message);
    } catch (err) {
      console.error('Failed to bulk cancel jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel jobs');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!config.activeProjectId) return;

    if (
      !window.confirm(
        'Are you sure you want to delete all completed, failed, and cancelled jobs? This cannot be undone.'
      )
    ) {
      return;
    }

    setBulkActionInProgress(true);
    setError(null);

    try {
      const client = createExtractionJobsClient(
        apiBase,
        fetchJson,
        config.activeProjectId
      );

      const result = await client.bulkDeleteJobs();

      // Refresh job list
      const response = await client.listJobs(undefined, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: currentPage,
        limit: pageSize,
      });

      setJobs(response.jobs.map(jobToCardProps));
      setTotalCount(response.total);

      alert(result.message);
    } catch (err) {
      console.error('Failed to bulk delete jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete jobs');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const handleBulkRetry = async () => {
    if (!config.activeProjectId) return;

    if (!window.confirm('Are you sure you want to retry all failed jobs?')) {
      return;
    }

    setBulkActionInProgress(true);
    setError(null);

    try {
      const client = createExtractionJobsClient(
        apiBase,
        fetchJson,
        config.activeProjectId
      );

      const result = await client.bulkRetryJobs();

      // Refresh job list
      const response = await client.listJobs(undefined, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: currentPage,
        limit: pageSize,
      });

      setJobs(response.jobs.map(jobToCardProps));
      setTotalCount(response.total);

      alert(result.message);
    } catch (err) {
      console.error('Failed to bulk retry jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to retry jobs');
    } finally {
      setBulkActionInProgress(false);
    }
  };

  // Show error state
  if (error && !isLoading) {
    return (
      <PageContainer maxWidth="full" className="px-4">
        <div className="mb-6">
          <h1 className="font-bold text-2xl">Extraction Jobs</h1>
          <p className="mt-1 text-base-content/70">
            View and manage AI-powered entity extraction jobs
          </p>
        </div>
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" />
          <span>{error}</span>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      maxWidth="full"
      className="px-4"
      testId="page-extraction-jobs"
    >
      {/* Header */}
      <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="font-bold text-2xl inline-flex items-center gap-2">
            Extraction Jobs
            {!isLoading && (
              <span className="badge badge-ghost badge-lg font-normal">
                {totalCount}
              </span>
            )}
          </h1>
          <p className="mt-1 text-base-content/70">
            View and manage AI-powered entity extraction jobs
          </p>
        </div>

        {/* Actions Dropdown */}
        <div className="dropdown dropdown-end">
          <button
            tabIndex={0}
            className="btn btn-primary"
            disabled={bulkActionInProgress || isLoading}
          >
            <Icon icon="lucide--settings" />
            Actions
            <Icon icon="lucide--chevron-down" className="w-4 h-4" />
          </button>
          <ul
            tabIndex={0}
            className="z-10 bg-base-100 shadow-lg p-2 border border-base-300 rounded-box w-64 dropdown-content menu"
          >
            <li>
              <button
                onClick={handleBulkCancel}
                disabled={bulkActionInProgress}
                className="flex items-center gap-2"
              >
                <Icon icon="lucide--x-circle" className="text-warning" />
                <div className="flex flex-col items-start">
                  <span className="font-medium">Cancel All Jobs</span>
                  <span className="text-xs text-base-content/60">
                    Cancel pending & running
                  </span>
                </div>
              </button>
            </li>
            <li>
              <button
                onClick={handleBulkDelete}
                disabled={bulkActionInProgress}
                className="flex items-center gap-2"
              >
                <Icon icon="lucide--trash-2" className="text-error" />
                <div className="flex flex-col items-start">
                  <span className="font-medium">Delete All Jobs</span>
                  <span className="text-xs text-base-content/60">
                    Remove completed/failed/cancelled
                  </span>
                </div>
              </button>
            </li>
            <li>
              <button
                onClick={handleBulkRetry}
                disabled={bulkActionInProgress}
                className="flex items-center gap-2"
              >
                <Icon icon="lucide--refresh-cw" className="text-info" />
                <div className="flex flex-col items-start">
                  <span className="font-medium">Retry Failed Jobs</span>
                  <span className="text-xs text-base-content/60">
                    Reset failed jobs to pending
                  </span>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <ExtractionJobFilters
          statusFilter={statusFilter}
          searchQuery={searchQuery}
          onStatusFilterChange={handleStatusFilterChange}
          onSearchQueryChange={handleSearchQueryChange}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Job List */}
      <ExtractionJobList
        jobs={displayedJobs}
        isLoading={isLoading}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={searchQuery ? filteredJobs.length : totalCount}
        onPageChange={setCurrentPage}
        onJobClick={handleJobClick}
      />
    </PageContainer>
  );
}

export default ExtractionJobsPage;
