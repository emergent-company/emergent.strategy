/**
 * Hook to fetch extraction jobs count for active jobs
 * Used for sidebar badge
 */

import { useEffect, useState } from 'react';
import { useApi } from './use-api';
import { useConfig } from '@/contexts/config';
import { createExtractionJobsClient } from '@/api/extraction-jobs';

export interface ExtractionJobsCount {
    pending: number;
    running: number;
    total: number;
}

/**
 * Fetches count of pending and running extraction jobs
 * Updates every 10 seconds
 */
export function useExtractionJobsCount() {
    const { apiBase, fetchJson } = useApi();
    const { config } = useConfig();
    const [counts, setCounts] = useState<ExtractionJobsCount>({ pending: 0, running: 0, total: 0 });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!config.activeProjectId || !config.activeOrgId) {
            setCounts({ pending: 0, running: 0, total: 0 });
            return;
        }

        const client = createExtractionJobsClient(apiBase, fetchJson);

        const fetchCounts = async () => {
            setLoading(true);
            try {
                // Fetch pending and running jobs in parallel
                const [pendingResult, runningResult] = await Promise.all([
                    client.listJobs(config.activeProjectId!, config.activeOrgId!, { status: 'pending', limit: 1 }),
                    client.listJobs(config.activeProjectId!, config.activeOrgId!, { status: 'running', limit: 1 }),
                ]);

                setCounts({
                    pending: pendingResult.total,
                    running: runningResult.total,
                    total: pendingResult.total + runningResult.total,
                });
            } catch (error) {
                console.error('Failed to fetch extraction jobs count:', error);
                setCounts({ pending: 0, running: 0, total: 0 });
            } finally {
                setLoading(false);
            }
        };

        // Initial fetch
        fetchCounts();

        // Poll every 10 seconds
        const interval = setInterval(fetchCounts, 10000);

        return () => clearInterval(interval);
    }, [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);

    return { counts, loading };
}
