/**
 * Extraction Logs Modal
 * 
 * Displays detailed step-by-step logs for an extraction job
 * showing LLM calls, object creation, errors, and performance metrics
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { useApi } from '@/hooks/use-api';

export interface ExtractionLogEntry {
    id: string;
    extraction_job_id: string;
    logged_at: string;
    step_index: number;
    operation_type: 'llm_call' | 'chunk_processing' | 'object_creation' | 'relationship_creation' | 'suggestion_creation' | 'validation' | 'error';
    operation_name?: string;
    status: 'success' | 'error' | 'warning';
    input_data?: Record<string, any>;
    output_data?: Record<string, any>;
    error_message?: string;
    error_stack?: string;
    duration_ms?: number;
    tokens_used?: number;
    metadata?: Record<string, any>;
}

export interface ExtractionLogSummary {
    totalSteps: number;
    successSteps: number;
    errorSteps: number;
    warningSteps: number;
    totalDurationMs: number;
    totalTokensUsed: number;
    operationCounts: Record<string, number>;
}

export interface ExtractionLogsResponse {
    logs: ExtractionLogEntry[];
    summary: ExtractionLogSummary;
}

export interface ExtractionLogsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    jobId: string;
}

export function ExtractionLogsModal({ open, onOpenChange, jobId }: ExtractionLogsModalProps) {
    const { apiBase, fetchJson } = useApi();
    const [logs, setLogs] = useState<ExtractionLogEntry[]>([]);
    const [summary, setSummary] = useState<ExtractionLogSummary | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string>('all');

    // Fetch logs when modal opens
    useEffect(() => {
        if (!open || !jobId) return;

        const fetchLogs = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetchJson<ExtractionLogsResponse>(
                    `${apiBase}/api/admin/extraction-jobs/${jobId}/logs`
                );
                setLogs(response.logs);
                setSummary(response.summary);
            } catch (err) {
                console.error('Failed to fetch extraction logs:', err);
                setError(err instanceof Error ? err.message : 'Failed to load logs');
            } finally {
                setIsLoading(false);
            }
        };

        fetchLogs();
    }, [open, jobId, apiBase, fetchJson]);

    const handleClose = () => {
        onOpenChange(false);
        setExpandedLogId(null);
        setFilterType('all');
    };

    const toggleLogExpansion = (logId: string) => {
        setExpandedLogId(expandedLogId === logId ? null : logId);
    };

    const getOperationIcon = (type: string): string => {
        switch (type) {
            case 'llm_call': return 'lucide--brain-circuit';
            case 'object_creation': return 'lucide--plus-circle';
            case 'chunk_processing': return 'lucide--file-text';
            case 'relationship_creation': return 'lucide--link';
            case 'suggestion_creation': return 'lucide--lightbulb';
            case 'validation': return 'lucide--check-circle';
            case 'error': return 'lucide--alert-circle';
            default: return 'lucide--circle';
        }
    };

    const getStatusBadgeClass = (status: string): string => {
        switch (status) {
            case 'completed': return 'badge-success';
            case 'failed': return 'badge-error';
            case 'running': return 'badge-info';
            case 'pending': return 'badge-warning';
            case 'skipped': return 'badge-ghost';
            default: return 'badge-ghost';
        }
    };

    const formatDuration = (ms?: number): string => {
        if (!ms) return 'N/A';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    const formatTime = (timestamp: string): string => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };

    const filteredLogs = filterType === 'all'
        ? logs
        : logs.filter(log => log.operation_type === filterType);

    const operationTypes = Array.from(new Set(logs.map(log => log.operation_type)));

    return (
        <Modal
            open={open}
            onOpenChange={(open) => !open && handleClose()}
            title="Extraction Logs"
            description="Detailed step-by-step execution logs showing LLM calls, object creation, and errors"
            sizeClassName="max-w-6xl"
            actions={[
                {
                    label: 'Close',
                    variant: 'ghost',
                    onClick: handleClose
                }
            ]}
        >
            {isLoading && (
                <div className="flex justify-center items-center py-12">
                    <span className="loading loading-spinner loading-lg" />
                </div>
            )}

            {error && (
                <div className="alert alert-error">
                    <Icon icon="lucide--alert-circle" />
                    <span>{error}</span>
                </div>
            )}

            {!isLoading && !error && summary && (
                <>
                    {/* Summary Statistics */}
                    <div className="gap-4 grid grid-cols-2 md:grid-cols-4 mb-6">
                        <div className="bg-base-200 p-4 rounded-lg">
                            <div className="text-sm text-base-content/60">Total Steps</div>
                            <div className="font-bold text-2xl">{summary.totalSteps}</div>
                        </div>
                        <div className="bg-base-200 p-4 rounded-lg">
                            <div className="text-sm text-base-content/60">Success</div>
                            <div className="font-bold text-success text-2xl">{summary.successSteps}</div>
                        </div>
                        <div className="bg-base-200 p-4 rounded-lg">
                            <div className="text-sm text-base-content/60">Errors</div>
                            <div className="font-bold text-error text-2xl">{summary.errorSteps}</div>
                        </div>
                        <div className="bg-base-200 p-4 rounded-lg">
                            <div className="text-sm text-base-content/60">Duration</div>
                            <div className="font-bold text-2xl">{formatDuration(summary.totalDurationMs)}</div>
                        </div>
                    </div>

                    {summary.totalTokensUsed > 0 && (
                        <div className="bg-info/10 mb-4 p-3 rounded-lg">
                            <div className="flex items-center gap-2">
                                <Icon icon="lucide--coins" className="text-info" />
                                <span className="font-medium text-info">Total Tokens Used:</span>
                                <span className="font-bold text-info">{summary.totalTokensUsed.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span className="text-sm text-base-content/70">Filter by type:</span>
                        <button
                            className={`btn btn-xs ${filterType === 'all' ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setFilterType('all')}
                        >
                            All ({logs.length})
                        </button>
                        {operationTypes.map(type => (
                            <button
                                key={type}
                                className={`btn btn-xs ${filterType === type ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setFilterType(type)}
                            >
                                {type.replace(/_/g, ' ')} ({logs.filter(l => l.operation_type === type).length})
                            </button>
                        ))}
                    </div>

                    {/* Logs Table */}
                    <div className="border border-base-300 rounded-lg overflow-hidden">
                        <div className="max-h-[500px] overflow-y-auto">
                            <table className="table table-xs table-zebra">
                                <thead className="top-0 z-10 sticky bg-base-200">
                                    <tr>
                                        <th className="w-16">Step</th>
                                        <th className="w-24">Time</th>
                                        <th className="w-40">Operation</th>
                                        <th className="w-24">Status</th>
                                        <th className="w-24">Duration</th>
                                        <th className="w-24">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLogs.map((log) => (
                                        <React.Fragment key={log.id}>
                                            <tr className="hover">
                                                <td className="font-mono text-xs">{log.step_index}</td>
                                                <td className="font-mono text-xs">{formatTime(log.logged_at)}</td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <Icon icon={getOperationIcon(log.operation_type)} className="size-4" />
                                                        <span className="text-xs">{log.operation_name || log.operation_type}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge badge-xs ${getStatusBadgeClass(log.status)}`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="font-mono text-xs">{formatDuration(log.duration_ms)}</td>
                                                <td>
                                                    <button
                                                        className="btn btn-xs btn-ghost"
                                                        onClick={() => toggleLogExpansion(log.id)}
                                                    >
                                                        <Icon icon={expandedLogId === log.id ? 'lucide--chevron-up' : 'lucide--chevron-down'} />
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedLogId === log.id && (
                                                <tr>
                                                    <td colSpan={6} className="bg-base-300/30">
                                                        <div className="space-y-4 p-4">
                                                            {/* Tokens Used (if available) */}
                                                            {log.tokens_used && (
                                                                <div className="bg-info/10 p-3 rounded-lg">
                                                                    <div className="flex items-center gap-2">
                                                                        <Icon icon="lucide--coins" className="text-info" />
                                                                        <span className="font-medium text-info text-sm">Tokens Used:</span>
                                                                        <span className="font-bold text-info">{log.tokens_used.toLocaleString()}</span>
                                                                    </div>
                                                                    {log.metadata?.prompt_tokens !== undefined && log.metadata?.completion_tokens !== undefined && (
                                                                        <div className="mt-2 text-info/70 text-xs">
                                                                            Prompt: {log.metadata.prompt_tokens.toLocaleString()} •
                                                                            Completion: {log.metadata.completion_tokens.toLocaleString()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Input Data */}
                                                            {log.input_data && Object.keys(log.input_data).length > 0 && (
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <Icon icon="lucide--arrow-right" className="size-4 text-info" />
                                                                        <span className="font-semibold text-info text-sm">Input Data</span>
                                                                    </div>
                                                                    <div className="bg-base-100 p-3 rounded overflow-x-auto">
                                                                        <pre className="font-mono text-xs whitespace-pre-wrap">
                                                                            {JSON.stringify(log.input_data, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Output Data */}
                                                            {log.output_data && Object.keys(log.output_data).length > 0 && (
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <Icon icon="lucide--arrow-left" className="size-4 text-success" />
                                                                        <span className="font-semibold text-success text-sm">Output Data</span>
                                                                    </div>
                                                                    <div className="bg-base-100 p-3 rounded overflow-x-auto">
                                                                        <pre className="font-mono text-xs whitespace-pre-wrap">
                                                                            {JSON.stringify(log.output_data, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Error Details */}
                                                            {log.error_message && (
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <Icon icon="lucide--alert-circle" className="size-4 text-error" />
                                                                        <span className="font-semibold text-error text-sm">Error</span>
                                                                    </div>
                                                                    <div className="bg-error/10 p-3 rounded">
                                                                        <div className="font-mono text-error text-xs">{log.error_message}</div>
                                                                        {log.error_stack && (
                                                                            <details className="mt-2">
                                                                                <summary className="text-error/70 hover:text-error text-xs cursor-pointer">
                                                                                    Stack Trace
                                                                                </summary>
                                                                                <pre className="mt-2 font-mono text-error/80 text-xs whitespace-pre-wrap">
                                                                                    {log.error_stack}
                                                                                </pre>
                                                                            </details>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Metadata */}
                                                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <Icon icon="lucide--info" className="size-4 text-base-content/60" />
                                                                        <span className="font-semibold text-sm text-base-content/80">Metadata</span>
                                                                    </div>
                                                                    <div className="bg-base-200 p-3 rounded">
                                                                        <pre className="font-mono text-xs whitespace-pre-wrap">
                                                                            {JSON.stringify(log.metadata, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {filteredLogs.length === 0 && (
                        <div className="py-12 text-base-content/60 text-center">
                            <Icon icon="lucide--inbox" className="mx-auto mb-2 size-12" />
                            <p>No logs found for the selected filter</p>
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}

export default ExtractionLogsModal;
