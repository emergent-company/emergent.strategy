/**
 * Hook to fetch extraction jobs count for active jobs
 * Used for sidebar badge
 */

import { useEffect, useState } from 'react';
import { useApi } from './use-api';
import { useConfig } from '@/contexts/config';
import { createExtractionJobsClient } from '@/api/extraction-jobs';
import { usePageVisibility } from './use-page-visibility';

export interface ExtractionJobsCount {
  queued: number;
  running: number;
  total: number;
}

/**
 * Fetches count of queued and running extraction jobs
 * Updates every 10 seconds (only when tab is visible)
 */
export function useExtractionJobsCount() {
  const { apiBase, fetchJson } = useApi();
  const { config } = useConfig();
  const isVisible = usePageVisibility();
  const [counts, setCounts] = useState<ExtractionJobsCount>({
    queued: 0,
    running: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config.activeProjectId || !config.activeOrgId) {
      setCounts({ queued: 0, running: 0, total: 0 });
      return;
    }

    // Don't poll when tab is hidden
    if (!isVisible) return;

    const client = createExtractionJobsClient(
      apiBase,
      fetchJson,
      config.activeProjectId
    );

    const fetchCounts = async () => {
      setLoading(true);
      try {
        // Fetch queued and running jobs in parallel
        const [queuedResult, runningResult] = await Promise.all([
          client.listJobs(undefined, { status: 'queued', limit: 1 }),
          client.listJobs(undefined, { status: 'running', limit: 1 }),
        ]);

        setCounts({
          queued: queuedResult.total,
          running: runningResult.total,
          total: queuedResult.total + runningResult.total,
        });
      } catch (error) {
        // Log as info instead of error to avoid spurious console errors during initialization
        console.log(
          'Failed to fetch extraction jobs count:',
          error instanceof Error ? error.message : error
        );
        setCounts({ queued: 0, running: 0, total: 0 });
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchCounts();

    // Poll every 10 seconds
    const interval = setInterval(fetchCounts, 10000);

    return () => clearInterval(interval);
  }, [
    apiBase,
    fetchJson,
    config.activeProjectId,
    config.activeOrgId,
    isVisible,
  ]);

  return { counts, loading };
}
