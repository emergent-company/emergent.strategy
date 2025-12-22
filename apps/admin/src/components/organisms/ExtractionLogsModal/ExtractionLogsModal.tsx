/**
 * Extraction Logs Modal
 *
 * Displays detailed step-by-step logs for an extraction job
 * showing LLM calls, object creation, errors, and performance metrics
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';

export interface ExtractionLogEntry {
  id: string;
  extraction_job_id: string;
  started_at: string;
  completed_at?: string | null;
  step_index: number;
  operation_type:
    | 'llm_call'
    | 'chunk_processing'
    | 'object_creation'
    | 'relationship_creation'
    | 'suggestion_creation'
    | 'validation'
    | 'error';
  operation_name?: string;
  status:
    | 'success'
    | 'error'
    | 'warning'
    | 'completed'
    | 'queued'
    | 'running'
    | 'failed'
    | 'skipped';
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

export interface TimelineEvent {
  step: string;
  status: 'success' | 'error' | 'info' | 'warning';
  timestamp: string;
  duration_ms?: number;
  message?: string;
  metadata?: Record<string, any>;
}

export interface ExtractionLogsResponse {
  logs: ExtractionLogEntry[];
  summary: ExtractionLogSummary;
  timeline?: TimelineEvent[];
}

export interface ExtractionLogsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
}

export function ExtractionLogsModal({
  open,
  onOpenChange,
  jobId,
}: ExtractionLogsModalProps) {
  const { apiBase, fetchJson } = useApi();
  const [logs, setLogs] = useState<ExtractionLogEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<ExtractionLogSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is outside the dropdown container
      const dropdownContainer = target.closest('.relative');
      if (isFilterDropdownOpen && !dropdownContainer) {
        setIsFilterDropdownOpen(false);
      }
    };

    if (isFilterDropdownOpen) {
      // Use timeout to avoid closing immediately on the same click that opened it
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isFilterDropdownOpen]);

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
        setTimeline(response.timeline || []);
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
    setSelectedTypes(new Set());
    setIsFilterDropdownOpen(false);
  };

  const toggleLogExpansion = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId);
  };

  const getOperationIcon = (type: string): string => {
    switch (type) {
      case 'llm_call':
        return 'lucide--brain-circuit';
      case 'object_creation':
        return 'lucide--plus-circle';
      case 'chunk_processing':
        return 'lucide--file-text';
      case 'relationship_creation':
        return 'lucide--link';
      case 'suggestion_creation':
        return 'lucide--lightbulb';
      case 'validation':
        return 'lucide--check-circle';
      case 'error':
        return 'lucide--alert-circle';
      default:
        return 'lucide--circle';
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'failed':
        return 'badge-error';
      case 'running':
        return 'badge-info';
      case 'queued':
        return 'badge-secondary badge-soft';
      case 'skipped':
        return 'badge-ghost';
      case 'info':
        return 'badge-info';
      default:
        return 'badge-ghost';
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

  // Convert timeline events to log entry format for unified display
  const timelineAsLogs: (ExtractionLogEntry & { source: 'timeline' })[] =
    timeline.map((event, index) => ({
      id: `timeline-${index}`,
      extraction_job_id: jobId,
      started_at: event.timestamp,
      completed_at: event.timestamp,
      step_index: -1, // Timeline events don't have step indices
      operation_type: event.step as any, // Use step name as operation type
      operation_name: event.message || event.step,
      status: event.status === 'success' ? 'completed' : (event.status as any),
      duration_ms: event.duration_ms,
      metadata: event.metadata,
      source: 'timeline' as const,
    }));

  // Add source marker to extraction logs
  const extractionLogsWithSource: (ExtractionLogEntry & {
    source: 'extraction';
  })[] = logs.map((log) => ({
    ...log,
    source: 'extraction' as const,
  }));

  // Deduplicate: Remove timeline events that have corresponding extraction logs
  // Match by operation type and timestamp (within 5 seconds)
  const deduplicatedTimeline = timelineAsLogs.filter((timelineLog) => {
    const hasDuplicate = extractionLogsWithSource.some((extractionLog) => {
      const timelineName = timelineLog.operation_type
        .replace(/_/g, '')
        .toLowerCase();
      const extractionName = extractionLog.operation_type
        .replace(/_/g, '')
        .toLowerCase();

      // Check if operation types match (loosely)
      const operationMatches =
        timelineName === extractionName ||
        timelineName.includes(extractionName) ||
        extractionName.includes(timelineName);

      // Check if timestamps are within 5 seconds
      const timelinestamp = new Date(timelineLog.started_at).getTime();
      const extractionTimestamp = new Date(extractionLog.started_at).getTime();
      const timeDiff = Math.abs(timelinestamp - extractionTimestamp);
      const timestampMatches = timeDiff < 5000; // 5 seconds tolerance

      return operationMatches && timestampMatches;
    });

    return !hasDuplicate; // Keep timeline events that don't have duplicates
  });

  // Merge logs and timeline events, sorted chronologically
  const allLogs = [...extractionLogsWithSource, ...deduplicatedTimeline].sort(
    (a, b) => {
      const dateA = new Date(a.started_at).getTime();
      const dateB = new Date(b.started_at).getTime();
      return dateA - dateB;
    }
  );

  // Get unique operation types with counts
  const operationTypes = Array.from(
    new Set(allLogs.map((log) => log.operation_type))
  ).sort();

  const operationTypeCounts = operationTypes.reduce((acc, type) => {
    acc[type] = allLogs.filter((log) => log.operation_type === type).length;
    return acc;
  }, {} as Record<string, number>);

  // Filter logs based on selected types
  const filteredLogs =
    selectedTypes.size === 0
      ? allLogs
      : allLogs.filter((log) => selectedTypes.has(log.operation_type));

  // Handle filter actions
  const toggleTypeFilter = (type: string) => {
    const newSelectedTypes = new Set(selectedTypes);
    if (newSelectedTypes.has(type)) {
      newSelectedTypes.delete(type);
    } else {
      newSelectedTypes.add(type);
    }
    setSelectedTypes(newSelectedTypes);
  };

  const selectAllTypes = () => {
    setSelectedTypes(new Set(operationTypes));
  };

  const clearAllFilters = () => {
    setSelectedTypes(new Set());
  };

  const isAllSelected = selectedTypes.size === operationTypes.length;
  const activeFilterCount = selectedTypes.size;

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
          onClick: handleClose,
        },
      ]}
    >
      {isLoading && (
        <div className="flex justify-center items-center py-12">
          <Spinner size="lg" />
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
              <div className="font-bold text-success text-2xl">
                {summary.successSteps}
              </div>
            </div>
            <div className="bg-base-200 p-4 rounded-lg">
              <div className="text-sm text-base-content/60">Errors</div>
              <div className="font-bold text-error text-2xl">
                {summary.errorSteps}
              </div>
            </div>
            <div className="bg-base-200 p-4 rounded-lg">
              <div className="text-sm text-base-content/60">Duration</div>
              <div className="font-bold text-2xl">
                {formatDuration(summary.totalDurationMs)}
              </div>
            </div>
          </div>

          {summary.totalTokensUsed > 0 && (
            <div className="bg-info/10 mb-4 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <Icon icon="lucide--coins" className="text-info" />
                <span className="font-medium text-info">
                  Total Tokens Used:
                </span>
                <span className="font-bold text-info">
                  {summary.totalTokensUsed.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-base-content/70">
                Filter by type:
              </span>

              {/* Dropdown Container */}
              <div className="relative">
                <button
                  className={`btn btn-sm ${
                    activeFilterCount > 0 ? 'btn-primary' : 'btn-outline'
                  }`}
                  onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                >
                  <Icon icon="lucide--filter" className="size-4" />
                  {activeFilterCount > 0 ? (
                    <>
                      {activeFilterCount} Selected
                      <span className="badge badge-sm ml-1">
                        {filteredLogs.length}
                      </span>
                    </>
                  ) : (
                    <>
                      All Types
                      <span className="badge badge-sm ml-1">
                        {allLogs.length}
                      </span>
                    </>
                  )}
                  <Icon
                    icon={
                      isFilterDropdownOpen
                        ? 'lucide--chevron-up'
                        : 'lucide--chevron-down'
                    }
                    className="size-4"
                  />
                </button>

                {isFilterDropdownOpen && (
                  <div className="absolute top-full left-0 z-50 mt-1 menu p-2 shadow-lg bg-base-100 rounded-box w-72 border border-base-300">
                    {/* Select All / Clear All */}
                    <div className="flex items-center justify-between px-2 py-2 border-b border-base-300 mb-2">
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={selectAllTypes}
                        disabled={isAllSelected}
                      >
                        <Icon icon="lucide--check-square" className="size-3" />
                        Select All
                      </button>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={clearAllFilters}
                        disabled={activeFilterCount === 0}
                      >
                        <Icon icon="lucide--x-circle" className="size-3" />
                        Clear
                      </button>
                    </div>

                    {/* Type Checkboxes */}
                    <div className="max-h-96 overflow-y-auto">
                      {operationTypes.map((type) => (
                        <label
                          key={type}
                          className="flex items-center justify-between px-2 py-2 hover:bg-base-200 rounded cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={selectedTypes.has(type)}
                              onChange={() => toggleTypeFilter(type)}
                            />
                            <Icon
                              icon={getOperationIcon(type)}
                              className="size-4 text-base-content/60"
                            />
                            <span className="text-sm">
                              {type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <span className="badge badge-sm badge-ghost">
                            {operationTypeCounts[type]}
                          </span>
                        </label>
                      ))}
                    </div>

                    {/* Footer with summary */}
                    <div className="px-2 py-2 border-t border-base-300 mt-2 text-xs text-base-content/60">
                      {activeFilterCount > 0 ? (
                        <>
                          Showing {filteredLogs.length} of {allLogs.length} logs
                        </>
                      ) : (
                        <>Showing all {allLogs.length} logs</>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Active Filter Pills */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 ml-2">
                  {Array.from(selectedTypes).map((type) => (
                    <div
                      key={type}
                      className="badge badge-sm badge-primary gap-1"
                    >
                      <span>{type.replace(/_/g, ' ')}</span>
                      <button
                        className="btn btn-ghost btn-xs p-0 min-h-0 h-auto"
                        onClick={() => toggleTypeFilter(type)}
                        aria-label={`Remove ${type} filter`}
                      >
                        <Icon icon="lucide--x" className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Logs Table */}
          <div className="border border-base-300 rounded-lg overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="table table-xs table-zebra">
                <thead className="top-0 z-10 sticky bg-base-200">
                  <tr>
                    <th className="w-8"></th>
                    <th className="w-16">Step</th>
                    <th className="w-24">Time</th>
                    <th className="w-40">Operation</th>
                    <th className="w-24">Status</th>
                    <th className="w-24">Duration</th>
                    <th className="w-24">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log, displayIndex) => (
                    <React.Fragment key={log.id}>
                      <tr className="hover">
                        <td>
                          <button
                            className="btn btn-xs btn-ghost p-0"
                            onClick={() => toggleLogExpansion(log.id)}
                            aria-label={
                              expandedLogId === log.id
                                ? 'Collapse row'
                                : 'Expand row'
                            }
                          >
                            <Icon
                              icon={
                                expandedLogId === log.id
                                  ? 'lucide--chevron-down'
                                  : 'lucide--chevron-right'
                              }
                              className="size-4"
                            />
                          </button>
                        </td>
                        <td className="font-mono text-xs">
                          {log.step_index >= 0 ? log.step_index : displayIndex}
                        </td>
                        <td className="font-mono text-xs">
                          {formatTime(log.started_at)}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Icon
                              icon={getOperationIcon(log.operation_type)}
                              className="size-4"
                            />
                            <span className="text-xs">
                              {log.operation_name || log.operation_type}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`badge badge-xs ${getStatusBadgeClass(
                              log.status
                            )}`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="font-mono text-xs">
                          {formatDuration(log.duration_ms)}
                        </td>
                        <td className="font-mono text-xs">
                          {log.tokens_used
                            ? log.tokens_used.toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                      {expandedLogId === log.id && (
                        <tr>
                          <td colSpan={7} className="bg-base-300/30">
                            <div className="space-y-4 p-4">
                              {/* Tokens Used (if available) */}
                              {log.tokens_used && (
                                <div className="bg-info/10 p-3 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <Icon
                                      icon="lucide--coins"
                                      className="text-info"
                                    />
                                    <span className="font-medium text-info text-sm">
                                      Tokens Used:
                                    </span>
                                    <span className="font-bold text-info">
                                      {log.tokens_used.toLocaleString()}
                                    </span>
                                  </div>
                                  {log.metadata?.prompt_tokens !== undefined &&
                                    log.metadata?.completion_tokens !==
                                      undefined && (
                                      <div className="mt-2 text-info/70 text-xs">
                                        Prompt:{' '}
                                        {log.metadata.prompt_tokens.toLocaleString()}{' '}
                                        • Completion:{' '}
                                        {log.metadata.completion_tokens.toLocaleString()}
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* Input Data */}
                              {log.input_data &&
                                Object.keys(log.input_data).length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Icon
                                        icon="lucide--arrow-right"
                                        className="size-4 text-info"
                                      />
                                      <span className="font-semibold text-info text-sm">
                                        Input Data
                                      </span>
                                    </div>
                                    <div className="bg-base-100 p-3 rounded overflow-x-auto">
                                      <pre className="font-mono text-xs whitespace-pre-wrap">
                                        {JSON.stringify(
                                          log.input_data,
                                          null,
                                          2
                                        )}
                                      </pre>
                                    </div>
                                  </div>
                                )}

                              {/* Output Data */}
                              {log.output_data &&
                                Object.keys(log.output_data).length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Icon
                                        icon="lucide--arrow-left"
                                        className="size-4 text-success"
                                      />
                                      <span className="font-semibold text-success text-sm">
                                        Output Data
                                      </span>
                                    </div>
                                    <div className="bg-base-100 p-3 rounded overflow-x-auto">
                                      <pre className="font-mono text-xs whitespace-pre-wrap">
                                        {JSON.stringify(
                                          log.output_data,
                                          null,
                                          2
                                        )}
                                      </pre>
                                    </div>
                                  </div>
                                )}

                              {/* Error Details */}
                              {log.error_message && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <Icon
                                      icon="lucide--alert-circle"
                                      className="size-4 text-error"
                                    />
                                    <span className="font-semibold text-error text-sm">
                                      Error
                                    </span>
                                  </div>
                                  <div className="bg-error/10 p-3 rounded">
                                    <div className="font-mono text-error text-xs">
                                      {log.error_message}
                                    </div>
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
                              {log.metadata &&
                                Object.keys(log.metadata).length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-2 mb-2">
                                      <Icon
                                        icon="lucide--info"
                                        className="size-4 text-base-content/60"
                                      />
                                      <span className="font-semibold text-sm text-base-content/80">
                                        Metadata
                                      </span>
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
