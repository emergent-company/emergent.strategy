import { useState, useEffect } from 'react';
import type {
  ExtractionJobDetail,
  ProcessLog,
  LLMCallLog,
} from '@/api/monitoring';

interface JobDetailsViewProps {
  job: ExtractionJobDetail;
  logs?: ProcessLog[];
  llmCalls?: LLMCallLog[];
  onClose: () => void;
  onRefresh?: () => void;
}

type TabType = 'summary' | 'logs' | 'llm-calls';

export function JobDetailsView({
  job,
  logs = [],
  llmCalls = [],
  onClose,
  onRefresh,
}: JobDetailsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('summary');

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isLive = job.status === 'in_progress' || job.status === 'pending';

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  };

  const formatCost = (usd?: number) => {
    if (usd === undefined || usd === null) return 'N/A';
    if (usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  };

  const formatTimestamp = (date?: string) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'badge-warning',
      in_progress: 'badge-info',
      completed: 'badge-success',
      failed: 'badge-error',
      requires_review: 'badge-warning',
    };
    return badges[status] || 'badge-neutral';
  };

  const getLevelBadge = (level: string) => {
    const badges: Record<string, string> = {
      debug: 'badge-neutral',
      info: 'badge-info',
      warn: 'badge-warning',
      error: 'badge-error',
    };
    return badges[level] || 'badge-neutral';
  };

  return (
    <div className="z-50 fixed inset-0 bg-base-100 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center bg-base-200 px-6 py-4 border-base-300 border-b">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-xl">Extraction Job Details</h2>
          {isLive && (
            <span className="flex items-center gap-2 text-success text-sm">
              <span className="bg-success rounded-full w-2 h-2 animate-pulse"></span>
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="btn btn-ghost btn-sm"
              disabled={!isLive}
            >
              <span className="iconify lucide--refresh-cw"></span>
              Refresh
            </button>
          )}
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square">
            <span className="iconify lucide--x"></span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-base-200 px-6 border-base-300 border-b">
        <div className="bg-transparent tabs tabs-boxed">
          <button
            className={`tab ${activeTab === 'summary' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            <span className="mr-2 iconify lucide--info"></span>
            Summary
          </button>
          <button
            className={`tab ${activeTab === 'logs' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <span className="mr-2 iconify lucide--file-text"></span>
            Logs ({logs.length})
          </button>
          <button
            className={`tab ${activeTab === 'llm-calls' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('llm-calls')}
          >
            <span className="mr-2 iconify lucide--brain"></span>
            LLM Calls ({llmCalls.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="p-6 overflow-y-auto"
        style={{ height: 'calc(100vh - 144px)' }}
      >
        {activeTab === 'summary' && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-base-200 card card-compact">
              <div className="card-body">
                <h3 className="text-lg card-title">Status</h3>
                <div className="gap-4 grid grid-cols-2 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-base-content/60">Status</div>
                    <span className={`badge ${getStatusBadge(job.status)}`}>
                      {job.status}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">Job ID</div>
                    <div className="font-mono text-sm">{job.id}</div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">
                      Source Type
                    </div>
                    <div className="text-sm capitalize">{job.source_type}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Timing Card */}
            <div className="bg-base-200 card card-compact">
              <div className="card-body">
                <h3 className="text-lg card-title">Timing</h3>
                <div className="gap-4 grid grid-cols-2 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-base-content/60">
                      Started At
                    </div>
                    <div className="text-sm">
                      {formatTimestamp(job.started_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">
                      Completed At
                    </div>
                    <div className="text-sm">
                      {formatTimestamp(job.completed_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">Duration</div>
                    <div className="text-sm">
                      {formatDuration(job.duration_ms)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Card */}
            <div className="bg-base-200 card card-compact">
              <div className="card-body">
                <h3 className="text-lg card-title">Results</h3>
                <div className="gap-4 grid grid-cols-2 md:grid-cols-4">
                  <div>
                    <div className="text-sm text-base-content/60">
                      Objects Created
                    </div>
                    <div className="font-bold text-2xl">
                      {job.objects_created || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">
                      Relationships
                    </div>
                    <div className="font-bold text-2xl">
                      {job.relationships_created || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">
                      LLM Calls
                    </div>
                    <div className="font-bold text-2xl">{llmCalls.length}</div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">
                      Total Cost
                    </div>
                    <div className="font-bold text-2xl">
                      {formatCost(
                        llmCalls.reduce(
                          (sum, call) => sum + (call.cost_usd || 0),
                          0
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Card (if failed) */}
            {job.error_message && (
              <div className="alert alert-error">
                <span className="text-xl iconify lucide--alert-circle"></span>
                <div>
                  <h4 className="font-semibold">Error Message</h4>
                  <p className="text-sm">{job.error_message}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="alert">
                <span className="iconify lucide--info"></span>
                <span>No logs available for this job</span>
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-base-200 hover:bg-base-300 card card-compact"
                >
                  <div className="card-body">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`badge badge-sm ${getLevelBadge(
                              log.level
                            )}`}
                          >
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-xs text-base-content/60">
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">{log.message}</p>
                        {log.metadata && (
                          <details className="mt-2">
                            <summary className="text-xs text-base-content/60 cursor-pointer">
                              Show metadata
                            </summary>
                            <div className="mt-2 text-xs mockup-code">
                              <pre>
                                <code>
                                  {JSON.stringify(log.metadata, null, 2)}
                                </code>
                              </pre>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'llm-calls' && (
          <div className="space-y-4">
            {llmCalls.length === 0 ? (
              <div className="alert">
                <span className="iconify lucide--info"></span>
                <span>No LLM calls recorded for this job</span>
              </div>
            ) : (
              llmCalls.map((call, index) => (
                <div
                  key={call.id}
                  className="bg-base-200 hover:bg-base-300 card card-compact"
                >
                  <div className="card-body">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">
                          Call #{index + 1} - {call.model_name}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-xs text-base-content/60">
                          <span>{formatTimestamp(call.started_at)}</span>
                          <span
                            className={`badge badge-xs ${
                              call.status === 'success'
                                ? 'badge-success'
                                : 'badge-error'
                            }`}
                          >
                            {call.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">
                          {formatCost(call.cost_usd)}
                        </div>
                        <div className="text-xs text-base-content/60">
                          {formatDuration(call.duration_ms)}
                        </div>
                      </div>
                    </div>

                    <div className="my-2 divider"></div>

                    <div className="gap-4 grid grid-cols-3 text-sm">
                      <div>
                        <div className="text-xs text-base-content/60">
                          Input Tokens
                        </div>
                        <div className="font-semibold">
                          {call.input_tokens?.toLocaleString() || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-base-content/60">
                          Output Tokens
                        </div>
                        <div className="font-semibold">
                          {call.output_tokens?.toLocaleString() || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-base-content/60">
                          Total Tokens
                        </div>
                        <div className="font-semibold">
                          {(
                            (call.input_tokens || 0) + (call.output_tokens || 0)
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {call.error_message && (
                      <div className="mt-2 alert alert-error">
                        <span className="iconify lucide--alert-circle"></span>
                        <span className="text-sm">{call.error_message}</span>
                      </div>
                    )}

                    <details className="mt-2">
                      <summary className="text-xs text-base-content/60 cursor-pointer">
                        Show request/response
                      </summary>
                      <div className="space-y-2 mt-2">
                        <div>
                          <div className="mb-1 font-semibold text-xs">
                            Request:
                          </div>
                          <div className="text-xs mockup-code">
                            <pre>
                              <code>
                                {JSON.stringify(call.request_payload, null, 2)}
                              </code>
                            </pre>
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 font-semibold text-xs">
                            Response:
                          </div>
                          <div className="text-xs mockup-code">
                            <pre>
                              <code>
                                {JSON.stringify(call.response_payload, null, 2)}
                              </code>
                            </pre>
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
