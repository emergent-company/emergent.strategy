import { useEffect, useState, useMemo } from "react";
import { useApi } from "@/hooks/use-api";
import { useConfig } from "@/contexts/config";
import { OrgAndProjectGate } from "@/components/organisms/OrgAndProjectGate";
import { createMonitoringClient, type ExtractionJobSummary } from "@/api/monitoring";
import { CostVisualization } from "../dashboard/CostVisualization";

export default function CostAnalyticsPage() {
    const { apiBase, fetchJson } = useApi();
    const { config } = useConfig();
    const [jobs, setJobs] = useState<ExtractionJobSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const monitoringClient = useMemo(() => createMonitoringClient(
        apiBase,
        fetchJson,
        config.activeProjectId,
        config.activeOrgId
    ), [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);

    // Load all extraction jobs for analytics
    useEffect(() => {
        let cancelled = false;

        async function loadJobs() {
            if (!config.activeProjectId || !config.activeOrgId) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                // Load all jobs (no pagination limit for analytics)
                const response = await monitoringClient.listExtractionJobs({
                    page: 1,
                    limit: 1000, // Get more data for better analytics
                    status: undefined,
                    source_type: undefined
                });

                if (cancelled) return;

                setJobs(response.items);
                setLoading(false);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load jobs:', err);
                setError(err instanceof Error ? err.message : 'Failed to load extraction jobs');
                setLoading(false);
            }
        }

        loadJobs();

        return () => {
            cancelled = true;
        };
    }, [monitoringClient, config.activeProjectId, config.activeOrgId]);

    return (
        <OrgAndProjectGate>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="font-bold text-3xl">Cost Analytics</h1>
                        <p className="mt-1 text-base-content/70">
                            Analyze extraction job costs and performance metrics
                        </p>
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="alert alert-error">
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}

                {/* Cost Visualization */}
                <CostVisualization jobs={jobs} loading={loading} />
            </div>
        </OrgAndProjectGate>
    );
}
