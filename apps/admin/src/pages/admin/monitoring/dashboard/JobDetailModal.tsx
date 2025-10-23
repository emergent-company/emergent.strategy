import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/use-api';
import { useConfig } from '@/contexts/config';
import { createMonitoringClient } from '@/api/monitoring';

interface JobDetailModalProps {
    jobId: string;
    isOpen: boolean;
    onClose: () => void;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'all';

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ jobId, isOpen, onClose }) => {
    const { apiBase, fetchJson } = useApi();
    const { config } = useConfig();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'llm-calls'>('overview');
    const [logLevel, setLogLevel] = useState<LogLevel>('all');

    // Data states
    const [jobDetail, setJobDetail] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [llmCalls, setLlmCalls] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [llmLoading, setLlmLoading] = useState(false);

    const monitoringClient = useMemo(() => createMonitoringClient(
        apiBase,
        fetchJson,
        config.activeProjectId,
        config.activeOrgId
    ), [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);

    const loadJobDetail = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const detail = await monitoringClient.getExtractionJobDetail(jobId);
            setJobDetail(detail);
        } catch (err: any) {
            setError(err.message || 'Failed to load job details');
        } finally {
            setLoading(false);
        }
    }, [jobId, monitoringClient]);

    const loadLogs = useCallback(async () => {
        try {
            setLogsLoading(true);
            const fetchedLogs = await monitoringClient.getExtractionJobLogs(
                jobId,
                logLevel === 'all' ? undefined : logLevel
            );
            setLogs(fetchedLogs);
        } catch (err: any) {
            console.error('Failed to load logs:', err);
        } finally {
            setLogsLoading(false);
        }
    }, [jobId, logLevel, monitoringClient]);

    const loadLLMCalls = useCallback(async () => {
        try {
            setLlmLoading(true);
            const calls = await monitoringClient.getExtractionJobLLMCalls(jobId, 50);
            setLlmCalls(calls);
        } catch (err: any) {
            console.error('Failed to load LLM calls:', err);
        } finally {
            setLlmLoading(false);
        }
    }, [jobId, monitoringClient]);

    useEffect(() => {
        if (isOpen && jobId) {
            loadJobDetail();
        }
    }, [isOpen, jobId, loadJobDetail]);

    useEffect(() => {
        if (activeTab === 'logs' && !logs.length) {
            loadLogs();
        } else if (activeTab === 'llm-calls' && !llmCalls.length) {
            loadLLMCalls();
        }
    }, [activeTab, logs.length, llmCalls.length, loadLogs, loadLLMCalls]);

    useEffect(() => {
        if (activeTab === 'logs') {
            loadLogs();
        }
    }, [activeTab, logLevel, loadLogs]);

    const formatDate = (date: string | null) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString();
    };

    const formatDuration = (ms: number | null) => {
        if (!ms) return 'N/A';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    };

    const formatCost = (cost: number | null) => {
        if (cost === null || cost === undefined) return 'N/A';
        return `$${cost.toFixed(4)}`;
    };

    const getStatusBadgeClass = (status: string) => {
        const statusColors: Record<string, string> = {
            pending: 'badge-warning',
            in_progress: 'badge-info',
            completed: 'badge-success',
            failed: 'badge-error',
        };
        return `badge ${statusColors[status] || 'badge-neutral'}`;
    };

    const getLogLevelBadgeClass = (level: string) => {
        const levelColors: Record<string, string> = {
            debug: 'badge-neutral',
            info: 'badge-info',
            warn: 'badge-warning',
            error: 'badge-error',
            fatal: 'badge-error',
        };
        return `badge badge-sm ${levelColors[level] || 'badge-neutral'}`;
    };

    if (!isOpen) return null;

    return (
        <div className="modal modal-open">
            <div className="flex flex-col p-0 max-w-6xl max-h-[90vh] modal-box">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-base-300 border-b">
                    <div className="flex items-center gap-4">
                        <h2 className="font-bold text-2xl">Job Details</h2>
                        {jobDetail && (
                            <span className={getStatusBadgeClass(jobDetail.resource.status)}>
                                {jobDetail.resource.status}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <span className="text-primary loading loading-spinner loading-lg"></span>
                        </div>
                    ) : error ? (
                        <div className="p-6">
                            <div className="alert alert-error">
                                <span>{error}</span>
                            </div>
                        </div>
                    ) : jobDetail ? (
                        <>
                            {/* Tabs */}
                            <div className="mx-6 mt-4 tabs tabs-boxed">
                                <a
                                    className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`}
                                    onClick={() => setActiveTab('overview')}
                                >
                                    Overview
                                </a>
                                <a
                                    className={`tab ${activeTab === 'logs' ? 'tab-active' : ''}`}
                                    onClick={() => setActiveTab('logs')}
                                >
                                    Process Logs ({jobDetail.recentLogs?.length || 0})
                                </a>
                                <a
                                    className={`tab ${activeTab === 'llm-calls' ? 'tab-active' : ''}`}
                                    onClick={() => setActiveTab('llm-calls')}
                                >
                                    LLM Calls ({jobDetail.llmCalls?.length || 0})
                                </a>
                            </div>

                            {/* Tab Content */}
                            <div className="p-6">
                                {activeTab === 'overview' && (
                                    <div className="space-y-6">
                                        {/* Job Information */}
                                        <div className="bg-base-200 card">
                                            <div className="card-body">
                                                <h3 className="text-lg card-title">Job Information</h3>
                                                <div className="gap-4 grid grid-cols-2">
                                                    <div>
                                                        <div className="text-sm text-base-content/70">Job ID</div>
                                                        <div className="font-mono text-sm">{jobDetail.resource.resource_id}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-base-content/70">Source Type</div>
                                                        <div>{jobDetail.resource.source_type || 'N/A'}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-base-content/70">Started At</div>
                                                        <div>{formatDate(jobDetail.resource.started_at)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-base-content/70">Completed At</div>
                                                        <div>{formatDate(jobDetail.resource.completed_at)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-base-content/70">Duration</div>
                                                        <div>{formatDuration(jobDetail.resource.duration_ms)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-base-content/70">Error</div>
                                                        <div className="text-error">{jobDetail.resource.error_message || 'None'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Metrics */}
                                        <div className="bg-base-200 card">
                                            <div className="card-body">
                                                <h3 className="text-lg card-title">Metrics</h3>
                                                <div className="gap-4 grid grid-cols-4">
                                                    <div className="bg-base-100 rounded-lg stat">
                                                        <div className="stat-title">Objects Created</div>
                                                        <div className="text-2xl stat-value">{jobDetail.resource.objects_created || 0}</div>
                                                    </div>
                                                    <div className="bg-base-100 rounded-lg stat">
                                                        <div className="stat-title">LLM Calls</div>
                                                        <div className="text-2xl stat-value">{jobDetail.resource.llm_call_count || 0}</div>
                                                    </div>
                                                    <div className="bg-base-100 rounded-lg stat">
                                                        <div className="stat-title">Total Tokens</div>
                                                        <div className="text-2xl stat-value">{jobDetail.metrics?.totalTokens || 0}</div>
                                                    </div>
                                                    <div className="bg-base-100 rounded-lg stat">
                                                        <div className="stat-title">Total Cost</div>
                                                        <div className="text-primary text-2xl stat-value">{formatCost(jobDetail.resource.total_cost)}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Recent Logs Preview */}
                                        {jobDetail.recentLogs && jobDetail.recentLogs.length > 0 && (
                                            <div className="bg-base-200 card">
                                                <div className="card-body">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h3 className="text-lg card-title">Recent Logs</h3>
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => setActiveTab('logs')}
                                                        >
                                                            View All
                                                        </button>
                                                    </div>
                                                    <div className="space-y-2 max-h-64 overflow-auto">
                                                        {jobDetail.recentLogs.slice(0, 5).map((log: any, idx: number) => (
                                                            <div key={idx} className="bg-base-100 p-2 rounded text-sm">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={getLogLevelBadgeClass(log.level)}>{log.level}</span>
                                                                    <span className="text-xs text-base-content/70">{formatDate(log.created_at)}</span>
                                                                </div>
                                                                <div className="font-mono text-xs">{log.message}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'logs' && (
                                    <div className="space-y-4">
                                        {/* Log Level Filter */}
                                        <div className="flex items-center gap-2">
                                            <label className="font-medium text-sm">Filter by level:</label>
                                            <select
                                                className="select-bordered select-sm select"
                                                value={logLevel}
                                                onChange={(e) => setLogLevel(e.target.value as LogLevel)}
                                            >
                                                <option value="all">All Levels</option>
                                                <option value="debug">Debug</option>
                                                <option value="info">Info</option>
                                                <option value="warn">Warning</option>
                                                <option value="error">Error</option>
                                                <option value="fatal">Fatal</option>
                                            </select>
                                            {logsLoading && <span className="loading loading-spinner loading-sm"></span>}
                                        </div>

                                        {/* Logs List */}
                                        <div className="space-y-2 max-h-[60vh] overflow-auto">
                                            {logs.length === 0 ? (
                                                <div className="py-8 text-base-content/70 text-center">
                                                    No logs found for this level
                                                </div>
                                            ) : (
                                                logs.map((log: any, idx: number) => (
                                                    <div key={idx} className="bg-base-200 card">
                                                        <div className="p-3 card-body">
                                                            <div className="flex items-start gap-3">
                                                                <span className={getLogLevelBadgeClass(log.level)}>{log.level}</span>
                                                                <div className="flex-1">
                                                                    <div className="mb-1 text-xs text-base-content/70">
                                                                        {formatDate(log.created_at)}
                                                                    </div>
                                                                    <div className="font-mono text-sm">{log.message}</div>
                                                                    {log.metadata && (
                                                                        <details className="mt-2">
                                                                            <summary className="text-primary text-xs cursor-pointer">View Metadata</summary>
                                                                            <pre className="bg-base-100 mt-2 p-2 rounded overflow-x-auto text-xs">
                                                                                {JSON.stringify(log.metadata, null, 2)}
                                                                            </pre>
                                                                        </details>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'llm-calls' && (
                                    <div className="space-y-4">
                                        {llmLoading ? (
                                            <div className="flex justify-center items-center h-32">
                                                <span className="loading loading-spinner loading-lg"></span>
                                            </div>
                                        ) : llmCalls.length === 0 ? (
                                            <div className="py-8 text-base-content/70 text-center">
                                                No LLM calls recorded for this job
                                            </div>
                                        ) : (
                                            llmCalls.map((call: any, idx: number) => (
                                                <div key={idx} className="bg-base-200 card">
                                                    <div className="card-body">
                                                        <div className="flex justify-between items-start mb-3">
                                                            <div>
                                                                <div className="font-semibold">{call.model}</div>
                                                                <div className="text-xs text-base-content/70">{formatDate(call.created_at)}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="font-bold text-primary text-lg">{formatCost(call.cost)}</div>
                                                                <div className="text-xs text-base-content/70">{call.duration_ms}ms</div>
                                                            </div>
                                                        </div>
                                                        <div className="gap-4 grid grid-cols-3 mb-3">
                                                            <div className="bg-base-100 p-2 rounded stat">
                                                                <div className="text-xs stat-title">Input Tokens</div>
                                                                <div className="text-lg stat-value">{call.input_tokens || 0}</div>
                                                            </div>
                                                            <div className="bg-base-100 p-2 rounded stat">
                                                                <div className="text-xs stat-title">Output Tokens</div>
                                                                <div className="text-lg stat-value">{call.output_tokens || 0}</div>
                                                            </div>
                                                            <div className="bg-base-100 p-2 rounded stat">
                                                                <div className="text-xs stat-title">Total Tokens</div>
                                                                <div className="text-lg stat-value">{call.total_tokens || 0}</div>
                                                            </div>
                                                        </div>
                                                        {call.request_payload && (
                                                            <details>
                                                                <summary className="mb-2 text-primary text-sm cursor-pointer">Request Payload</summary>
                                                                <pre className="bg-base-100 p-3 rounded max-h-48 overflow-x-auto text-xs">
                                                                    {JSON.stringify(call.request_payload, null, 2)}
                                                                </pre>
                                                            </details>
                                                        )}
                                                        {call.response_payload && (
                                                            <details>
                                                                <summary className="mb-2 text-primary text-sm cursor-pointer">Response Payload</summary>
                                                                <pre className="bg-base-100 p-3 rounded max-h-48 overflow-x-auto text-xs">
                                                                    {JSON.stringify(call.response_payload, null, 2)}
                                                                </pre>
                                                            </details>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="flex justify-end items-center gap-2 p-4 border-base-300 border-t">
                    <button onClick={onClose} className="btn">Close</button>
                </div>
            </div>
            <div className="modal-backdrop" onClick={onClose}></div>
        </div>
    );
};
