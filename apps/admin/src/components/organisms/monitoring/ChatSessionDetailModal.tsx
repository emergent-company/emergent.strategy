import { useState, useEffect } from 'react';
import { useApi } from '../../../hooks/use-api';
import { useConfig } from '../../../contexts/config';
import { createMonitoringClient, type ChatSessionDetail, type McpToolCallLog } from '../../../api/monitoring';

interface ChatSessionDetailModalProps {
    sessionId: string;
    isOpen: boolean;
    onClose: () => void;
}

type TabId = 'summary' | 'transcript' | 'tools' | 'llm' | 'logs';

/**
 * ChatSessionDetailModal
 * 
 * Displays comprehensive details about a chat session including:
 * - Session summary and metrics
 * - Conversation transcript
 * - MCP tool calls with parameters/results
 * - LLM API calls
 * - System logs
 */
export function ChatSessionDetailModal({ sessionId, isOpen, onClose }: ChatSessionDetailModalProps) {
    const { apiBase, fetchJson } = useApi();
    const { config: { activeProjectId, activeOrgId } } = useConfig();
    
    const [activeTab, setActiveTab] = useState<TabId>('summary');
    const [detail, setDetail] = useState<ChatSessionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Load session detail when modal opens
    useEffect(() => {
        if (!isOpen) return;
        
        const loadDetail = async () => {
            try {
                setLoading(true);
                setError(null);
                const monitoringClient = createMonitoringClient(apiBase, fetchJson, activeProjectId, activeOrgId);
                const data = await monitoringClient.getChatSessionDetail(sessionId);
                setDetail(data);
            } catch (err) {
                console.error('Failed to load session detail:', err);
                setError(err instanceof Error ? err.message : 'Failed to load session');
            } finally {
                setLoading(false);
            }
        };
        
        loadDetail();
    }, [sessionId, isOpen, apiBase, fetchJson, activeProjectId, activeOrgId]);
    
    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setActiveTab('summary');
            setDetail(null);
            setLoading(true);
            setError(null);
        }
    }, [isOpen]);
    
    if (!isOpen) return null;
    
    // Helper: Format cost
    const formatCost = (cost: number | null | undefined) => {
        if (cost === null || cost === undefined || cost === 0) return '$0.0000';
        return `$${cost.toFixed(4)}`;
    };
    
    // Helper: Format duration (milliseconds to readable string)
    const formatDuration = (durationMs?: number) => {
        if (!durationMs) return 'Unknown';
        
        const durationSeconds = Math.floor(durationMs / 1000);
        
        if (durationSeconds < 60) return `${durationSeconds}s`;
        if (durationSeconds < 3600) return `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };
    
    // Helper: Truncate long text
    const truncate = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return `${text.substring(0, maxLength)}...`;
    };
    
    return (
        <dialog className="modal modal-open" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="modal-box max-w-6xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Chat Session Detail</h3>
                    <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose}>
                        ✕
                    </button>
                </div>
                
                {/* Loading State */}
                {loading && (
                    <div className="flex-1 flex items-center justify-center">
                        <span className="loading loading-spinner loading-lg"></span>
                    </div>
                )}
                
                {/* Error State */}
                {error && (
                    <div className="alert alert-error">
                        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{error}</span>
                    </div>
                )}
                
                {/* Content */}
                {!loading && !error && detail && (
                    <>
                        {/* Tabs */}
                        <div role="tablist" className="tabs tabs-bordered mb-4">
                            <a
                                role="tab"
                                className={`tab ${activeTab === 'summary' ? 'tab-active' : ''}`}
                                onClick={() => setActiveTab('summary')}
                            >
                                Summary
                            </a>
                            <a
                                role="tab"
                                className={`tab ${activeTab === 'transcript' ? 'tab-active' : ''}`}
                                onClick={() => setActiveTab('transcript')}
                            >
                                Transcript
                            </a>
                            <a
                                role="tab"
                                className={`tab ${activeTab === 'tools' ? 'tab-active' : ''}`}
                                onClick={() => setActiveTab('tools')}
                            >
                                MCP Tools ({detail.tool_calls.length})
                            </a>
                            <a
                                role="tab"
                                className={`tab ${activeTab === 'llm' ? 'tab-active' : ''}`}
                                onClick={() => setActiveTab('llm')}
                            >
                                LLM Calls ({detail.llm_calls.length})
                            </a>
                            <a
                                role="tab"
                                className={`tab ${activeTab === 'logs' ? 'tab-active' : ''}`}
                                onClick={() => setActiveTab('logs')}
                            >
                                Logs ({detail.logs.length})
                            </a>
                        </div>
                        
                        {/* Tab Content */}
                        <div className="flex-1 overflow-auto">
                            {/* Summary Tab */}
                            {activeTab === 'summary' && (
                                <div className="space-y-4">
                                    {/* Session Info Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="stats shadow">
                                            <div className="stat">
                                                <div className="stat-title">Session ID</div>
                                                <div className="stat-value text-sm">
                                                    <code>{truncate(detail.session_id, 16)}</code>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="stats shadow">
                                            <div className="stat">
                                                <div className="stat-title">Duration</div>
                                                <div className="stat-value text-2xl">
                                                    {formatDuration(detail.duration_ms)}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="stats shadow">
                                            <div className="stat">
                                                <div className="stat-title">Total Cost</div>
                                                <div className="stat-value text-2xl">
                                                    {formatCost(detail.total_cost)}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="stats shadow">
                                            <div className="stat">
                                                <div className="stat-title">Total Turns</div>
                                                <div className="stat-value text-2xl">
                                                    {detail.total_turns}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Metrics */}
                                    <div className="card bg-base-100 shadow-md">
                                        <div className="card-body">
                                            <h3 className="card-title">Session Metrics</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <div className="text-sm text-base-content/70">Logs</div>
                                                    <div className="text-2xl font-bold">{detail.logs.length}</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-base-content/70">LLM Calls</div>
                                                    <div className="text-2xl font-bold">{detail.llm_calls.length}</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-base-content/70">Tool Calls</div>
                                                    <div className="text-2xl font-bold">{detail.tool_calls.length}</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-base-content/70">Errors</div>
                                                    <div className="text-2xl font-bold text-error">
                                                        {detail.logs.filter(log => log.level === 'error').length}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Timestamps */}
                                    <div className="card bg-base-100 shadow-md">
                                        <div className="card-body">
                                            <h3 className="card-title">Timeline</h3>
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <span className="text-sm text-base-content/70">Started:</span>
                                                    <span className="text-sm font-mono">{new Date(detail.started_at).toLocaleString()}</span>
                                                </div>
                                                {detail.completed_at && (
                                                    <div className="flex justify-between">
                                                        <span className="text-sm text-base-content/70">Completed:</span>
                                                        <span className="text-sm font-mono">{new Date(detail.completed_at).toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Transcript Tab */}
                            {activeTab === 'transcript' && (
                                <div className="space-y-4">
                                    {detail.logs
                                        .filter(log => log.processType === 'chat_turn')
                                        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                        .map((log, idx) => {
                                            const role = log.metadata?.role as string | undefined;
                                            const content = log.metadata?.content as string | undefined;
                                            const turnNumber = log.metadata?.turn_number as number | undefined;
                                            
                                            return (
                                                <div
                                                    key={log.id}
                                                    className={`chat ${role === 'user' ? 'chat-end' : 'chat-start'}`}
                                                >
                                                    <div className="chat-header">
                                                        {role === 'user' ? 'User' : 'Assistant'}
                                                        <time className="text-xs opacity-50 ml-2">
                                                            Turn {turnNumber || idx + 1}
                                                        </time>
                                                    </div>
                                                    <div className={`chat-bubble ${role === 'user' ? 'chat-bubble-primary' : ''}`}>
                                                        {content || 'No content'}
                                                    </div>
                                                    <div className="chat-footer opacity-50">
                                                        {new Date(log.timestamp).toLocaleTimeString()}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    
                                    {detail.logs.filter(log => log.processType === 'chat_turn').length === 0 && (
                                        <div className="text-center py-8 text-base-content/70">
                                            No conversation turns recorded
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* MCP Tools Tab */}
                            {activeTab === 'tools' && (
                                <div className="space-y-2">
                                    {detail.tool_calls.length === 0 ? (
                                        <div className="text-center py-8 text-base-content/70">
                                            No tool calls recorded
                                        </div>
                                    ) : (
                                        detail.tool_calls.map((tool) => (
                                            <ToolCallRow key={tool.id} tool={tool} />
                                        ))
                                    )}
                                </div>
                            )}
                            
                            {/* LLM Calls Tab */}
                            {activeTab === 'llm' && (
                                <div className="overflow-x-auto">
                                    <table className="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Model</th>
                                                <th>Tokens</th>
                                                <th>Cost</th>
                                                <th>Duration</th>
                                                <th>Status</th>
                                                <th>Time</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.llm_calls.map((call) => (
                                                <tr key={call.id}>
                                                    <td><code className="text-xs">{call.model_name}</code></td>
                                                    <td className="text-right">
                                                        <div className="text-xs">
                                                            <div>In: {call.input_tokens}</div>
                                                            <div>Out: {call.output_tokens}</div>
                                                        </div>
                                                    </td>
                                                    <td className="text-right font-mono">{formatCost(call.cost_usd)}</td>
                                                    <td className="text-right">{call.duration_ms}ms</td>
                                                    <td>
                                                        <div className={`badge badge-sm ${call.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                                            {call.status}
                                                        </div>
                                                    </td>
                                                    <td className="text-xs">{new Date(call.started_at).toLocaleTimeString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    
                                    {detail.llm_calls.length === 0 && (
                                        <div className="text-center py-8 text-base-content/70">
                                            No LLM calls recorded
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Logs Tab */}
                            {activeTab === 'logs' && (
                                <div className="overflow-x-auto">
                                    <table className="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>Level</th>
                                                <th>Type</th>
                                                <th>Message</th>
                                                <th>Time</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.logs.map((log) => (
                                                <tr key={log.id}>
                                                    <td>
                                                        <div className={`badge badge-sm ${
                                                            log.level === 'error' ? 'badge-error' :
                                                            log.level === 'warn' ? 'badge-warning' :
                                                            'badge-info'
                                                        }`}>
                                                            {log.level}
                                                        </div>
                                                    </td>
                                                    <td><code className="text-xs">{log.processType}</code></td>
                                                    <td className="max-w-md truncate">{log.message}</td>
                                                    <td className="text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    
                                    {detail.logs.length === 0 && (
                                        <div className="text-center py-8 text-base-content/70">
                                            No logs recorded
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </dialog>
    );
}

/**
 * ToolCallRow Component
 * Expandable row showing tool call details with parameters and results
 */
function ToolCallRow({ tool }: { tool: McpToolCallLog }) {
    const [expanded, setExpanded] = useState(false);
    
    return (
        <div className="card bg-base-100 shadow-sm">
            <div className="card-body p-4">
                <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpanded(!expanded)}
                >
                    <div className="flex items-center gap-4 flex-1">
                        <div className="badge badge-neutral">Turn {tool.turn_number}</div>
                        <code className="text-sm font-semibold">{tool.tool_name}</code>
                        <div className={`badge badge-sm ${tool.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                            {tool.status}
                        </div>
                        <span className="text-sm text-base-content/70">{tool.execution_time_ms}ms</span>
                    </div>
                    <button className="btn btn-xs btn-ghost">
                        {expanded ? '▼' : '▶'}
                    </button>
                </div>
                
                {expanded && (
                    <div className="mt-4 space-y-4">
                        {/* Parameters */}
                        {tool.tool_parameters && (
                            <div>
                                <h4 className="text-sm font-semibold mb-2">Parameters</h4>
                                <pre className="bg-base-200 p-3 rounded text-xs overflow-x-auto">
                                    {JSON.stringify(tool.tool_parameters, null, 2)}
                                </pre>
                            </div>
                        )}
                        
                        {/* Result */}
                        {tool.tool_result && (
                            <div>
                                <h4 className="text-sm font-semibold mb-2">Result</h4>
                                <pre className="bg-base-200 p-3 rounded text-xs overflow-x-auto">
                                    {JSON.stringify(tool.tool_result, null, 2)}
                                </pre>
                            </div>
                        )}
                        
                        {/* Error */}
                        {tool.error_message && (
                            <div className="alert alert-error">
                                <span className="text-sm">{tool.error_message}</span>
                            </div>
                        )}
                        
                        {/* Timestamp */}
                        <div className="text-xs text-base-content/70">
                            Executed at: {new Date(tool.created_at).toLocaleString()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
