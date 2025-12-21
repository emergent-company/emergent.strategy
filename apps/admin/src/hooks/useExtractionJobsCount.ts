/**
 * Hook to fetch extraction jobs count for active jobs
 * Uses SSE for real-time updates with polling fallback when SSE is disconnected
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useApi } from './use-api';
import { useConfig } from '@/contexts/config';
import { createExtractionJobsClient } from '@/api/extraction-jobs';
import { usePageVisibility } from './use-page-visibility';
import { useDataUpdates } from '@/contexts/data-updates';
import type { EntityEvent } from '@/types/realtime-events';

export interface ExtractionJobsCount {
  queued: number;
  running: number;
  total: number;
}

// Debounce delay to batch rapid SSE events into single refetch
const SSE_DEBOUNCE_MS = 500;

// Fallback polling interval when SSE is disconnected (60 seconds)
const FALLBACK_POLL_INTERVAL_MS = 60000;

/**
 * Fetches count of queued and running extraction jobs
 * Uses SSE for real-time updates, falls back to 60s polling if SSE disconnects
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

  // Ref for debounce timeout
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track if initial fetch has been done
  const initialFetchDoneRef = useRef(false);

  // Memoize the fetch function
  const fetchCounts = useCallback(async () => {
    if (!config.activeProjectId || !config.activeOrgId) {
      setCounts({ queued: 0, running: 0, total: 0 });
      return;
    }

    const client = createExtractionJobsClient(
      apiBase,
      fetchJson,
      config.activeProjectId
    );

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
  }, [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);

  // Debounced fetch to batch rapid SSE events
  const debouncedFetchCounts = useMemo(() => {
    return () => {
      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Set new timeout
      debounceTimeoutRef.current = setTimeout(() => {
        fetchCounts();
        debounceTimeoutRef.current = null;
      }, SSE_DEBOUNCE_MS);
    };
  }, [fetchCounts]);

  // SSE event handler
  const handleExtractionJobEvent = useCallback(
    (event: EntityEvent) => {
      // Only refetch when visible to save resources
      if (!isVisible) return;

      console.debug(
        '[useExtractionJobsCount] SSE event received:',
        event.type,
        event.id
      );

      // Debounced refetch on any extraction job event
      debouncedFetchCounts();
    },
    [isVisible, debouncedFetchCounts]
  );

  // Subscribe to SSE for extraction job events
  const { connectionState } = useDataUpdates(
    'extraction_job:*',
    handleExtractionJobEvent,
    [handleExtractionJobEvent]
  );

  // Initial fetch on mount and when project changes
  useEffect(() => {
    if (!config.activeProjectId || !config.activeOrgId) {
      setCounts({ queued: 0, running: 0, total: 0 });
      initialFetchDoneRef.current = false;
      return;
    }

    // Don't fetch when tab is hidden
    if (!isVisible) return;

    // Do initial fetch
    fetchCounts();
    initialFetchDoneRef.current = true;
  }, [config.activeProjectId, config.activeOrgId, isVisible, fetchCounts]);

  // Fallback polling when SSE is disconnected
  useEffect(() => {
    // Only poll if SSE is disconnected/errored AND tab is visible AND we have a project
    const shouldPoll =
      (connectionState === 'disconnected' || connectionState === 'error') &&
      isVisible &&
      config.activeProjectId &&
      config.activeOrgId;

    if (!shouldPoll) {
      return;
    }

    console.debug(
      '[useExtractionJobsCount] SSE disconnected, starting fallback polling'
    );

    // Poll at slower interval (60s) as fallback
    const interval = setInterval(fetchCounts, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      console.debug('[useExtractionJobsCount] Stopped fallback polling');
    };
  }, [
    connectionState,
    isVisible,
    config.activeProjectId,
    config.activeOrgId,
    fetchCounts,
  ]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return { counts, loading, connectionState };
}
