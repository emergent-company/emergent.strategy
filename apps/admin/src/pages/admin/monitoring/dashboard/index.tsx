import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router";
import { Icon } from "@/components/atoms/Icon";
import { LoadingEffect } from "@/components";
import { useApi } from "@/hooks/use-api";
import { useConfig } from "@/contexts/config";
import { OrgAndProjectGate } from "@/components/organisms/OrgAndProjectGate";
import { createMonitoringClient, type ExtractionJobSummary, type ListExtractionJobsParams } from "@/api/monitoring";
import { JobDetailModal } from "./JobDetailModal";

export default function MonitoringDashboardPage() {
    const { apiBase, fetchJson } = useApi();
    const { config } = useConfig();
    const [jobs, setJobs] = useState<ExtractionJobSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [totalJobs, setTotalJobs] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(20);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('');

    // Modal state
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleJobClick = (jobId: string) => {
        setSelectedJobId(jobId);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setSelectedJobId(null);
    };

    const monitoringClient = useMemo(() => createMonitoringClient(
        apiBase,
        fetchJson,
        config.activeProjectId,
        config.activeOrgId
    ), [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);

    // Load extraction jobs
    useEffect(() => {
        let cancelled = false;

        if (!config.activeOrgId || !config.activeProjectId) {
            return () => {
                cancelled = true;
            };
        }

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const params: ListExtractionJobsParams = {
                    page: currentPage,
                    limit: pageSize,
                    sort_by: 'started_at',
                    sort_order: 'desc',
                };

                if (statusFilter) {
                    params.status = statusFilter as any;
                }
                if (sourceTypeFilter) {
                    params.source_type = sourceTypeFilter;
                }

                const response = await monitoringClient.listExtractionJobs(params);

                if (!cancelled) {
                    setJobs(response.items);
                    setTotalJobs(response.total);
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to load extraction jobs";
                if (!cancelled) {
                    setError(msg);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [monitoringClient, config.activeOrgId, config.activeProjectId, currentPage, pageSize, statusFilter, sourceTypeFilter]);

    const formatDuration = (ms: number | undefined) => {
        if (!ms) return '-';
        if (ms < 1000) return `${ms}ms`;
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    };

    const formatCost = (cost: number | undefined) => {
        if (!cost) return '-';
        return `$${cost.toFixed(4)}`;
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case 'completed':
                return 'badge-success';
            case 'failed':
                return 'badge-error';
            case 'in_progress':
                return 'badge-info';
            default:
                return 'badge-neutral';
        }
    };

    return (
        <OrgAndProjectGate>
            <div className="mx-auto p-6 container">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="font-bold text-3xl">System Monitoring</h1>
                        <p className="mt-1 text-base-content/70">
                            Monitor extraction jobs, LLM usage, and system costs
                        </p>
                    </div>
                    
                    {/* View Cost Analytics Link */}
                    <Link 
                        to="/admin/monitoring/analytics" 
                        className="btn btn-primary"
                    >
                        <Icon icon="lucide--bar-chart-3" className="w-4 h-4" />
                        View Cost Analytics
                    </Link>
                </div>

                {/* Filters */}
                <div className="bg-base-100 shadow-sm mb-6 card">
                    <div className="card-body">
                        <div className="flex gap-4">
                            <div className="w-full max-w-xs form-control">
                                <label className="label">
                                    <span className="label-text">Status</span>
                                </label>
                                <select
                                    className="select-bordered select"
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                >
                                    <option value="">All Statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="failed">Failed</option>
                                </select>
                            </div>

                            <div className="w-full max-w-xs form-control">
                                <label className="label">
                                    <span className="label-text">Source Type</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g., clickup_task"
                                    className="input input-bordered"
                                    value={sourceTypeFilter}
                                    onChange={(e) => {
                                        setSourceTypeFilter(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>

                            {(statusFilter || sourceTypeFilter) && (
                                <div className="justify-end form-control">
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => {
                                            setStatusFilter('');
                                            setSourceTypeFilter('');
                                            setCurrentPage(1);
                                        }}
                                    >
                                        <Icon icon="lucide--x" className="w-4 h-4" />
                                        Clear Filters
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <>
                    {error && (
                            <div className="mb-6 alert alert-error">
                                <Icon icon="lucide--alert-circle" className="w-5 h-5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {loading ? (
                    <div className="flex justify-center items-center py-12">
                        <LoadingEffect />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="bg-base-100 shadow-sm card">
                        <div className="items-center py-12 text-center card-body">
                            <Icon icon="lucide--database" className="mb-4 w-16 h-16 text-base-content/30" />
                            <h3 className="mb-2 font-semibold text-xl">No extraction jobs found</h3>
                            <p className="text-base-content/70">
                                {statusFilter || sourceTypeFilter
                                    ? 'Try adjusting your filters'
                                    : 'Extraction jobs will appear here once they start running'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Jobs Table */}
                        <div className="bg-base-100 shadow-sm mb-6 card">
                            <div className="overflow-x-auto">
                                <table className="table table-zebra">
                                    <thead>
                                        <tr>
                                            <th>Job ID</th>
                                            <th>Source</th>
                                            <th>Status</th>
                                            <th>Started</th>
                                            <th>Duration</th>
                                            <th>Objects</th>
                                            <th>LLM Calls</th>
                                            <th>Total Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobs.map((job) => (
                                            <tr 
                                                key={job.id} 
                                                className="hover:bg-base-200 cursor-pointer"
                                                onClick={() => handleJobClick(job.id)}
                                            >
                                                <td>
                                                    <code className="text-xs">{job.id.slice(0, 8)}</code>
                                                </td>
                                                <td>
                                                    <div>
                                                        <div className="font-medium">{job.source_type}</div>
                                                        <div className="text-xs text-base-content/70">
                                                            {job.source_id}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${getStatusBadgeClass(job.status)}`}>
                                                        {job.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="text-sm">
                                                        {new Date(job.started_at).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="text-sm">{formatDuration(job.duration_ms)}</span>
                                                </td>
                                                <td>
                                                    <span className="text-sm">{job.objects_created ?? '-'}</span>
                                                </td>
                                                <td>
                                                    <span className="text-sm">{job.total_llm_calls ?? '-'}</span>
                                                </td>
                                                <td>
                                                    <span className="font-mono font-semibold text-sm">
                                                        {formatCost(job.total_cost_usd)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination */}
                        {totalJobs > pageSize && (
                            <div className="flex justify-center items-center gap-4">
                                <button
                                    className="btn btn-sm"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(currentPage - 1)}
                                >
                                    <Icon icon="lucide--chevron-left" className="w-4 h-4" />
                                    Previous
                                </button>
                                <span className="text-sm">
                                    Page {currentPage} of {Math.ceil(totalJobs / pageSize)}
                                    {' '}({totalJobs} total)
                                </span>
                                <button
                                    className="btn btn-sm"
                                    disabled={currentPage >= Math.ceil(totalJobs / pageSize)}
                                    onClick={() => setCurrentPage(currentPage + 1)}
                                >
                                    Next
                                    <Icon icon="lucide--chevron-right" className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </>
                )}
                </>
            </div>

            {/* Job Detail Modal */}
            {selectedJobId && (
                <JobDetailModal
                    jobId={selectedJobId}
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
                />
            )}
        </OrgAndProjectGate>
    );
}

