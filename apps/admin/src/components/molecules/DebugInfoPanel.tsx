import React, { useState } from 'react';

type TimelineEventStatus = 'success' | 'error' | 'info' | 'warning';

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
  provider?: string;
  job_duration_ms?: number;
  entity_outcomes?: Record<string, number>;
  timeline?: TimelineEvent[];
}

interface DebugInfoPanelProps {
  debugInfo: Record<string, any>;
}

interface TimelineEvent {
  step: string;
  status: TimelineEventStatus;
  timestamp: string;
  duration_ms?: number;
  message?: string;
  metadata?: Record<string, unknown>;
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
  const timeline = Array.isArray(data.timeline)
    ? (data.timeline as TimelineEvent[])
    : [];
  const sortedTimeline = timeline
    .map((event) => ({ ...event }))
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  const hasContent = llmCalls.length > 0 || sortedTimeline.length > 0;
  const jobDurationMs = data.job_duration_ms ?? data.total_duration_ms ?? 0;
  const entityOutcomes = data.entity_outcomes;

  const toggleCall = (index: number) => {
    setExpandedCalls((prev) => {
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

  const formatStep = (step: string) =>
    step
      .split(/[_-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const formatMetadataValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return '—';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  };

  const statusBadgeClasses: Record<TimelineEventStatus, string> = {
    success: 'badge-success',
    error: 'badge-error',
    info: 'badge-info',
    warning: 'badge-warning',
  };

  if (!hasContent) {
    return (
      <div className="alert-outline alert">
        <span className="text-lg iconify lucide--info"></span>
        <span>No debug information available for this job.</span>
      </div>
    );
  }

  const summaryStats = [
    {
      label: 'LLM Provider',
      value: data.provider ?? 'Unknown',
      show: Boolean(data.provider),
    },
    {
      label: 'Total Duration',
      value: formatDuration(jobDurationMs),
      show: jobDurationMs > 0,
    },
    {
      label: 'Total LLM Calls',
      value: String(llmCalls.length),
      show: true,
    },
    {
      label: 'Total Entities',
      value: String(data.total_entities ?? entityOutcomes?.created ?? 0),
      show: true,
    },
    {
      label: 'Types Processed',
      value: String(data.types_processed ?? 0),
      show: (data.types_processed ?? 0) > 0,
    },
  ].filter((stat) => stat.show);

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      {summaryStats.length > 0 && (
        <div className="shadow-sm stats stats-horizontal">
          {summaryStats.map((stat) => (
            <div key={stat.label} className="stat">
              <div className="stat-title">{stat.label}</div>
              <div className="text-2xl stat-value">{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {entityOutcomes && (
        <div>
          <h4 className="mb-2 font-semibold text-lg">Entity Outcomes</h4>
          <div className="gap-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
            {Object.entries(entityOutcomes).map(([key, value]) => (
              <div
                key={key}
                className="bg-base-200 p-3 rounded-box text-center"
              >
                <div className="text-xs text-base-content/60 uppercase">
                  {formatStep(key)}
                </div>
                <div className="font-semibold text-base-content text-lg">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline - Removed: Now shown in detailed logs modal */}
      {/* {sortedTimeline.length > 0 && (
                <div className="space-y-3">
                    <h4 className="font-semibold text-lg">Execution Timeline</h4>
                    <div className="space-y-3">
                        {sortedTimeline.map((event, index) => (
                            <div key={`${event.step}-${event.timestamp}-${index}`} className="card-border card">
                                <div className="flex justify-between items-start gap-3 px-4 py-3 border-b border-base-content/10 card-title">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`badge ${statusBadgeClasses[event.status]}`}>
                                            {event.status.toUpperCase()}
                                        </span>
                                        <span>{formatStep(event.step)}</span>
                                    </div>
                                    <div className="text-xs text-base-content/60">
                                        {new Date(event.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                <div className="space-y-3 card-body">
                                    {event.message && (
                                        <div className="alert alert-soft">
                                            <span className="iconify lucide--info" />
                                            <span className="text-sm">{event.message}</span>
                                        </div>
                                    )}
                                    {event.duration_ms !== undefined && (
                                        <div className="text-xs text-base-content/60">
                                            Duration: {formatDuration(event.duration_ms)}
                                        </div>
                                    )}
                                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                                        <div>
                                            <p className="mb-2 text-xs text-base-content/50">Metadata</p>
                                            <div className="gap-2 grid grid-cols-1 md:grid-cols-2">
                                                {Object.entries(event.metadata).map(([key, value]) => (
                                                    <div key={key} className="bg-base-200 p-3 rounded-lg">
                                                        <div className="text-[10px] text-base-content/60 uppercase tracking-wide">
                                                            {formatStep(key)}
                                                        </div>
                                                        {typeof value === 'object' ? (
                                                            <pre className="bg-base-300 mt-2 p-2 rounded overflow-x-auto text-[11px] leading-tight whitespace-pre-wrap">
                                                                {formatMetadataValue(value)}
                                                            </pre>
                                                        ) : (
                                                            <div className="mt-1 font-mono text-sm break-all">
                                                                {formatMetadataValue(value)}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )} */}

      {/* LLM Calls */}
      {llmCalls.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-lg">LLM Calls</h4>
          {llmCalls.map((call, index) => {
            const isExpanded = expandedCalls.has(index);
            const isSuccess = call.status === 'success';

            return (
              <div
                key={index}
                className={`collapse collapse-arrow ${
                  isSuccess ? 'card-border' : 'card-border alert-error'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isExpanded}
                  onChange={() => toggleCall(index)}
                />
                <div className="collapse-title flex justify-between items-center font-medium">
                  <div className="flex items-center gap-3">
                    <span
                      className={`badge ${
                        isSuccess ? 'badge-success' : 'badge-error'
                      }`}
                    >
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
                    <span className="badge badge-sm badge-ghost">
                      {call.model}
                    </span>
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
                      <p>
                        Timestamp: {new Date(call.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
