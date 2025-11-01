import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../../../hooks/use-api';
import { useConfig } from '../../../../contexts/config';
import { createMonitoringClient } from '../../../../api/monitoring';
import { ChatSessionDetailModal } from '../../../../components/organisms/monitoring/ChatSessionDetailModal';
import type { ChatSessionSummary, ListChatSessionsParams } from '../../../../api/monitoring';

/**
 * ChatSessionsListPage
 * 
 * Displays a paginated list of chat sessions with filtering capabilities.
 * Allows users to view detailed information about individual sessions.
 * 
 * Features:
 * - Pagination (20 sessions per page)
 * - Date range filtering
 * - Session detail modal
 * - Refresh functionality
 * - Cost and turn count summaries
 */
export function ChatSessionsListPage() {
    const { apiBase, fetchJson } = useApi();
    const { config: { activeProjectId, activeOrgId } } = useConfig();
    const monitoringClient = createMonitoringClient(apiBase, fetchJson, activeProjectId, activeOrgId);

    // Pagination state
    const [limit] = useState(20);
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(0);

    // Filter state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Data state
    const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    // Load sessions
    const loadSessions = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params: ListChatSessionsParams = {
                limit,
                offset,
            };

            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

            const response = await monitoringClient.listChatSessions(params);

            setSessions(response.items);
            setTotal(response.total);
        } catch (err) {
            console.error('Failed to load chat sessions:', err);
            setError(err instanceof Error ? err.message : 'Failed to load sessions');
        } finally {
            setLoading(false);
        }
    }, [monitoringClient, limit, offset, startDate, endDate]);

    // Load on mount and when params change
    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    // Handle row click
    const handleRowClick = (sessionId: string) => {
        setSelectedSessionId(sessionId);
        setModalOpen(true);
    };

    // Handle modal close
    const handleModalClose = () => {
        setModalOpen(false);
        setSelectedSessionId(null);
    };

    // Handle page navigation
    const handlePreviousPage = () => {
        if (offset > 0) {
            setOffset(Math.max(0, offset - limit));
        }
    };

    const handleNextPage = () => {
        if (offset + limit < total) {
            setOffset(offset + limit);
        }
    };

    // Calculate page numbers
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    // Format duration (seconds to readable string)
    const formatDuration = (started: string, lastActivity?: string) => {
        if (!lastActivity) return 'N/A';
        const start = new Date(started).getTime();
        const end = new Date(lastActivity).getTime();
        const durationSeconds = Math.floor((end - start) / 1000);

        if (durationSeconds < 60) return `${durationSeconds}s`;
        if (durationSeconds < 3600) return `${Math.floor(durationSeconds / 60)}m`;
        return `${Math.floor(durationSeconds / 3600)}h ${Math.floor((durationSeconds % 3600) / 60)}m`;
    };

    // Format cost
    const formatCost = (cost?: number | null) => {
        if (cost === null || cost === undefined || cost === 0) return '-';
        return `$${cost.toFixed(4)}`;
    };

    // Truncate session ID
    const truncateSessionId = (id: string, length: number = 12) => {
        if (id.length <= length) return id;
        return `${id.substring(0, length)}...`;
    };

    return (
        <div className="mx-auto p-6 container">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="font-bold text-3xl">Chat Sessions</h1>
                    <p className="mt-1 text-base-content/70">
                        Monitor chat interactions, tool calls, and LLM usage
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={loadSessions}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <span className="loading loading-spinner loading-sm"></span>
                            Loading...
                        </>
                    ) : (
                        'Refresh'
                    )}
                </button>
            </div>

            {/* Filters */}
            <div className="bg-base-100 shadow-md mb-6 card">
                <div className="card-body">
                    <h2 className="mb-4 text-lg card-title">Filters</h2>
                    <div className="gap-4 grid grid-cols-1 md:grid-cols-2">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">Start Date</span>
                            </label>
                            <input
                                type="date"
                                className="input input-bordered"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setOffset(0); // Reset to first page
                                }}
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text">End Date</span>
                            </label>
                            <input
                                type="date"
                                className="input input-bordered"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setOffset(0); // Reset to first page
                                }}
                            />
                        </div>
                    </div>
                    {(startDate || endDate) && (
                        <div className="mt-4">
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setOffset(0);
                                }}
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-6 alert alert-error">
                    <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                </div>
            )}

            {/* Sessions Table */}
            <div className="bg-base-100 shadow-md card">
                <div className="card-body">
                    <div className="overflow-x-auto">
                        <table className="table table-zebra">
                            <thead>
                                <tr>
                                    <th>Session ID</th>
                                    <th>Started At</th>
                                    <th>Duration</th>
                                    <th>Turns</th>
                                    <th>Cost</th>
                                    <th>Logs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center">
                                            <span className="loading loading-spinner loading-lg"></span>
                                            <p className="mt-2 text-base-content/70">Loading sessions...</p>
                                        </td>
                                    </tr>
                                ) : sessions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center">
                                            <p className="text-base-content/70">No chat sessions found</p>
                                            {(startDate || endDate) && (
                                                <p className="mt-1 text-sm text-base-content/50">
                                                    Try adjusting your filters
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    sessions.map((session) => (
                                        <tr
                                            key={session.session_id}
                                            className="hover:bg-base-200 cursor-pointer"
                                            onClick={() => handleRowClick(session.session_id)}
                                        >
                                            <td>
                                                <code className="text-xs">
                                                    {truncateSessionId(session.session_id)}
                                                </code>
                                            </td>
                                            <td>
                                                {new Date(session.started_at).toLocaleString()}
                                            </td>
                                            <td>
                                                {formatDuration(session.started_at, session.last_activity_at)}
                                            </td>
                                            <td>
                                                <div className="badge badge-info">
                                                    {session.total_turns || 0}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={session.total_cost ? 'font-mono' : 'text-base-content/50'}>
                                                    {formatCost(session.total_cost)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-sm text-base-content/70">
                                                    {session.log_count}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && sessions.length > 0 && (
                        <div className="flex justify-between items-center mt-4">
                            <div className="text-sm text-base-content/70">
                                Showing {offset + 1} - {Math.min(offset + limit, total)} of {total} sessions
                            </div>
                            <div className="join">
                                <button
                                    className="join-item btn btn-sm"
                                    onClick={handlePreviousPage}
                                    disabled={offset === 0}
                                >
                                    «
                                </button>
                                <button className="join-item btn btn-sm">
                                    Page {currentPage} of {totalPages}
                                </button>
                                <button
                                    className="join-item btn btn-sm"
                                    onClick={handleNextPage}
                                    disabled={offset + limit >= total}
                                >
                                    »
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal */}
            {selectedSessionId && (
                <ChatSessionDetailModal
                    sessionId={selectedSessionId}
                    isOpen={modalOpen}
                    onClose={handleModalClose}
                />
            )}
        </div>
    );
}

export default ChatSessionsListPage;
