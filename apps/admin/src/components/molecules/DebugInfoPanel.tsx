import React, { useState } from 'react';

interface LLMCall {
    type: string;
    input?: {
        document?: string;
        prompt?: string;
        allowed_types?: string[];
    };
    output?: any;
    entities_found?: number;
    error?: string;
    duration_ms: number;
    timestamp: string;
    model: string;
    status: 'success' | 'error';
}

interface DebugInfoData {
    llm_calls?: LLMCall[];
    total_duration_ms?: number;
    total_entities?: number;
    types_processed?: number;
}

interface DebugInfoPanelProps {
    debugInfo: Record<string, any>;
}

/**
 * DebugInfoPanel - Displays debug information from extraction jobs
 * 
 * Shows LLM request/response data in collapsible sections for debugging
 * extraction quality issues and understanding model behavior.
 */
export function DebugInfoPanel({ debugInfo }: DebugInfoPanelProps) {
    const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());

    const data = debugInfo as DebugInfoData;
    const llmCalls = data.llm_calls || [];

    const toggleCall = (index: number) => {
        setExpandedCalls(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    if (!llmCalls.length) {
        return (
            <div className="alert-outline alert">
                <span className="text-lg iconify lucide--info"></span>
                <span>No debug information available for this job.</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary Card */}
            <div className="shadow-sm stats stats-horizontal">
                <div className="stat">
                    <div className="stat-title">Total LLM Calls</div>
                    <div className="text-2xl stat-value">{llmCalls.length}</div>
                </div>
                <div className="stat">
                    <div className="stat-title">Total Duration</div>
                    <div className="text-2xl stat-value">
                        {formatDuration(data.total_duration_ms || 0)}
                    </div>
                </div>
                <div className="stat">
                    <div className="stat-title">Total Entities</div>
                    <div className="text-2xl stat-value">{data.total_entities || 0}</div>
                </div>
                <div className="stat">
                    <div className="stat-title">Types Processed</div>
                    <div className="text-2xl stat-value">{data.types_processed || 0}</div>
                </div>
            </div>

            {/* LLM Calls */}
            <div className="space-y-3">
                <h4 className="font-semibold text-lg">LLM Calls</h4>
                {llmCalls.map((call, index) => {
                    const isExpanded = expandedCalls.has(index);
                    const isSuccess = call.status === 'success';

                    return (
                        <div
                            key={index}
                            className={`collapse collapse-arrow ${isSuccess ? 'card-border' : 'card-border alert-error'}`}
                        >
                            <input
                                type="checkbox"
                                checked={isExpanded}
                                onChange={() => toggleCall(index)}
                            />
                            <div className="collapse-title flex justify-between items-center font-medium">
                                <div className="flex items-center gap-3">
                                    <span className={`badge ${isSuccess ? 'badge-success' : 'badge-error'}`}>
                                        {call.type}
                                    </span>
                                    {isSuccess && (
                                        <span className="badge badge-ghost">
                                            {call.entities_found || 0} entities
                                        </span>
                                    )}
                                    {call.error && (
                                        <span className="badge badge-error">Error</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 text-sm text-base-content/70">
                                    <span>{formatDuration(call.duration_ms)}</span>
                                    <span className="badge badge-sm badge-ghost">{call.model}</span>
                                </div>
                            </div>
                            <div className="collapse-content">
                                <div className="space-y-4 pt-4">
                                    {/* Input Section */}
                                    {call.input && (
                                        <div>
                                            <h5 className="mb-2 font-semibold text-sm">Input</h5>
                                            <div className="space-y-2">
                                                {call.input.document && (
                                                    <div>
                                                        <p className="mb-1 text-xs text-base-content/60">
                                                            Document (truncated):
                                                        </p>
                                                        <pre className="bg-base-200 p-3 rounded max-h-32 overflow-x-auto overflow-y-auto text-xs">
                                                            {call.input.document}
                                                        </pre>
                                                    </div>
                                                )}
                                                {call.input.prompt && (
                                                    <div>
                                                        <p className="mb-1 text-xs text-base-content/60">
                                                            Prompt:
                                                        </p>
                                                        <pre className="bg-base-200 p-3 rounded max-h-48 overflow-x-auto overflow-y-auto text-xs whitespace-pre-wrap">
                                                            {call.input.prompt}
                                                        </pre>
                                                    </div>
                                                )}
                                                {call.input.allowed_types && (
                                                    <div>
                                                        <p className="mb-1 text-xs text-base-content/60">
                                                            Allowed Types:
                                                        </p>
                                                        <div className="flex flex-wrap gap-1">
                                                            {call.input.allowed_types.map((type, i) => (
                                                                <span key={i} className="badge badge-sm">
                                                                    {type}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Output Section */}
                                    {call.output && (
                                        <div>
                                            <h5 className="mb-2 font-semibold text-sm">Output</h5>
                                            <pre className="bg-base-200 p-3 rounded max-h-96 overflow-x-auto overflow-y-auto text-xs">
                                                {JSON.stringify(call.output, null, 2)}
                                            </pre>
                                        </div>
                                    )}

                                    {/* Error Section */}
                                    {call.error && (
                                        <div className="alert alert-error">
                                            <span className="text-lg iconify lucide--alert-triangle"></span>
                                            <span className="text-sm">{call.error}</span>
                                        </div>
                                    )}

                                    {/* Metadata */}
                                    <div className="text-xs text-base-content/60">
                                        <p>Timestamp: {new Date(call.timestamp).toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
