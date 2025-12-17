import { useEffect, useState, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { LoadingEffect } from '@/components';
import { PageContainer } from '@/components/layouts';
import { useApi } from '@/hooks/use-api';
import {
  createAgentsClient,
  type Agent,
  type AgentRun,
  type AgentTriggerType,
} from '@/api/agents';

/**
 * Format a cron expression to human-readable text
 */
function formatCron(cron: string): string {
  // Simple cron parser for common patterns
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Every N minutes
  if (
    minute.startsWith('*/') &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const n = minute.slice(2);
    return `Every ${n} minute${n === '1' ? '' : 's'}`;
  }

  // Every hour
  if (
    minute !== '*' &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return `Every hour at :${minute.padStart(2, '0')}`;
  }

  // Daily
  if (
    minute !== '*' &&
    hour !== '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return `Daily at ${hour}:${minute.padStart(2, '0')}`;
  }

  return cron;
}

/**
 * Format duration in milliseconds to human-readable
 */
function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format date to relative time
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

/**
 * Format summary for display
 * Converts camelCase keys to readable format and formats values nicely
 */
function formatSummary(summary: Record<string, any>): string {
  const formatKey = (key: string): string => {
    // Convert camelCase to Title Case with spaces
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const formatValue = (value: any): string => {
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  };

  return Object.entries(summary)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${formatKey(k)}: ${formatValue(v)}`)
    .join(' | ');
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: AgentRun['status'] }) {
  const config = {
    running: { class: 'badge-info', icon: 'lucide--loader-2', animate: true },
    success: {
      class: 'badge-success',
      icon: 'lucide--check',
      animate: false,
    },
    completed: {
      class: 'badge-success',
      icon: 'lucide--check',
      animate: false,
    },
    failed: { class: 'badge-error', icon: 'lucide--x', animate: false },
    error: { class: 'badge-error', icon: 'lucide--x', animate: false },
    skipped: {
      class: 'badge-warning',
      icon: 'lucide--skip-forward',
      animate: false,
    },
  };

  const { class: badgeClass, icon, animate } = config[status] || config.success;

  return (
    <span className={`badge badge-sm gap-1 ${badgeClass}`}>
      <Icon
        icon={icon}
        className={`w-3 h-3 ${animate ? 'animate-spin' : ''}`}
      />
      {status}
    </span>
  );
}

/**
 * Agent card component showing config and recent runs
 */
function AgentCard({
  agent,
  runs,
  onToggle,
  onTrigger,
  onTriggerTypeChange,
  onConfigChange,
  triggering,
}: {
  agent: Agent;
  runs: AgentRun[];
  onToggle: () => void;
  onTrigger: () => void;
  onTriggerTypeChange: (triggerType: AgentTriggerType) => void;
  onConfigChange: (key: string, value: any) => void;
  triggering: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastRun = runs[0];

  return (
    <div className="bg-base-100 shadow-lg border border-base-300 card">
      {/* Header */}
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h2 className="flex items-center gap-2 card-title">
              <Icon icon="lucide--bot" className="w-5 h-5 text-primary" />
              {agent.name}
            </h2>
            <p className="mt-1 text-base-content/60 text-sm">
              Role:{' '}
              <code className="bg-base-200 px-1 rounded">{agent.role}</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="swap">
              <input
                type="checkbox"
                checked={agent.enabled}
                onChange={onToggle}
              />
              <span
                className={`badge ${
                  agent.enabled ? 'badge-success' : 'badge-ghost'
                }`}
              >
                {agent.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>

        {/* Trigger Mode */}
        <div className="mt-4 p-3 bg-base-200 rounded-lg">
          <div className="flex flex-col gap-3">
            {/* Trigger Type Selector */}
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-sm">Trigger Mode</p>
                <p className="text-base-content/70 text-xs">
                  How the agent is triggered to run
                </p>
              </div>
              <select
                className="select select-sm select-bordered w-32"
                value={agent.triggerType}
                onChange={(e) =>
                  onTriggerTypeChange(e.target.value as AgentTriggerType)
                }
              >
                <option value="schedule">Schedule</option>
                <option value="manual">Manual</option>
              </select>
            </div>

            {/* Schedule info - only shown when triggerType is 'schedule' */}
            {agent.triggerType === 'schedule' && (
              <div className="pt-2 border-t border-base-300">
                <p className="text-base-content/70 text-sm">
                  {formatCron(agent.cronSchedule)}
                </p>
                <code className="text-xs text-base-content/50">
                  {agent.cronSchedule}
                </code>
              </div>
            )}

            {/* Manual trigger info */}
            {agent.triggerType === 'manual' && (
              <div className="pt-2 border-t border-base-300">
                <p className="text-base-content/70 text-sm">
                  This agent only runs when manually triggered
                </p>
              </div>
            )}

            {/* Run Now Button */}
            <div className="flex justify-end">
              <button
                className={`btn btn-sm btn-primary ${
                  triggering ? 'loading' : ''
                }`}
                onClick={onTrigger}
                disabled={triggering || !agent.enabled}
                title={!agent.enabled ? 'Enable agent to trigger' : 'Run now'}
              >
                {!triggering && (
                  <Icon icon="lucide--play" className="w-4 h-4" />
                )}
                Run Now
              </button>
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="mt-4">
          <button
            className="flex items-center gap-2 w-full font-medium text-left text-sm"
            onClick={() => setExpanded(!expanded)}
          >
            <Icon
              icon={expanded ? 'lucide--chevron-down' : 'lucide--chevron-right'}
              className="w-4 h-4"
            />
            Configuration
          </button>

          {expanded && (
            <div className="space-y-3 mt-3 pl-6">
              {Object.entries(agent.config || {}).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center">
                  <label className="text-sm text-base-content/70">{key}</label>
                  <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    className="w-32 input input-sm input-bordered"
                    value={value}
                    onChange={(e) =>
                      onConfigChange(
                        key,
                        typeof value === 'number'
                          ? parseFloat(e.target.value)
                          : e.target.value
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Runs */}
        <div className="mt-4">
          <h3 className="flex items-center gap-2 mb-2 font-medium text-sm">
            <Icon icon="lucide--history" className="w-4 h-4" />
            Recent Runs
          </h3>

          {runs.length === 0 ? (
            <p className="py-4 text-base-content/50 text-center text-sm">
              No runs yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 10).map((run) => (
                    <tr key={run.id}>
                      <td>
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="text-base-content/70">
                        {formatRelativeTime(run.startedAt)}
                      </td>
                      <td className="text-base-content/70">
                        {formatDuration(run.durationMs)}
                      </td>
                      <td className="max-w-xs text-base-content/70 truncate">
                        {run.status === 'skipped' && run.skipReason}
                        {(run.status === 'failed' ||
                          run.status === 'error') && (
                          <span className="text-error">{run.errorMessage}</span>
                        )}
                        {(run.status === 'completed' ||
                          run.status === 'success') &&
                          run.summary && (
                            <span title={formatSummary(run.summary)}>
                              {formatSummary(run.summary)}
                            </span>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lastRun && (
            <p className="mt-2 text-base-content/50 text-xs">
              Last run: {new Date(lastRun.startedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Agents management page
 */
export default function AgentsPage() {
  const { apiBase, fetchJson } = useApi();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runsMap, setRunsMap] = useState<Record<string, AgentRun[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const client = useMemo(
    () => createAgentsClient(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  // Load agents and their runs
  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const agentsList = await client.listAgents();
      setAgents(agentsList);

      // Load runs for each agent
      const runsPromises = agentsList.map(async (agent) => {
        const runs = await client.getAgentRuns(agent.id);
        return { id: agent.id, runs };
      });

      const runsResults = await Promise.all(runsPromises);
      const newRunsMap: Record<string, AgentRun[]> = {};
      runsResults.forEach(({ id, runs }) => {
        newRunsMap[id] = runs;
      });
      setRunsMap(newRunsMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Handle toggle enabled
  const handleToggle = async (agent: Agent) => {
    setSavingId(agent.id);
    try {
      const updated = await client.updateAgent(agent.id, {
        enabled: !agent.enabled,
      });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? updated : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle agent');
    } finally {
      setSavingId(null);
    }
  };

  // Handle trigger
  const handleTrigger = async (agent: Agent) => {
    setTriggeringId(agent.id);
    try {
      const result = await client.triggerAgent(agent.id);
      if (!result.success) {
        setError(result.error || 'Failed to trigger agent');
      } else {
        // Reload runs after a short delay
        setTimeout(async () => {
          const runs = await client.getAgentRuns(agent.id);
          setRunsMap((prev) => ({ ...prev, [agent.id]: runs }));
        }, 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to trigger agent');
    } finally {
      setTriggeringId(null);
    }
  };

  // Handle config change (debounced save)
  const handleConfigChange = async (agent: Agent, key: string, value: any) => {
    const newConfig = { ...agent.config, [key]: value };

    // Optimistic update
    setAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, config: newConfig } : a))
    );

    // Save to server
    setSavingId(agent.id);
    try {
      await client.updateAgent(agent.id, { config: newConfig });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save config');
      // Revert on error
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
    } finally {
      setSavingId(null);
    }
  };

  // Handle trigger type change
  const handleTriggerTypeChange = async (
    agent: Agent,
    triggerType: AgentTriggerType
  ) => {
    // Optimistic update
    setAgents((prev) =>
      prev.map((a) => (a.id === agent.id ? { ...a, triggerType } : a))
    );

    // Save to server
    setSavingId(agent.id);
    try {
      await client.updateAgent(agent.id, { triggerType });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to update trigger type'
      );
      // Revert on error
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PageContainer maxWidth="5xl" testId="page-agents">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Agents</h1>
        <p className="mt-1 text-base-content/70">
          Manage automated background tasks that run on a schedule or manually
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error mb-4">
          <Icon icon="lucide--alert-circle" className="w-5 h-5" />
          <span>{error}</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setError(null)}
          >
            <Icon icon="lucide--x" className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Saving indicator */}
      {savingId && (
        <div className="top-4 right-4 z-50 fixed">
          <div className="alert alert-info py-2 shadow-lg">
            <Icon icon="lucide--loader-2" className="w-4 h-4 animate-spin" />
            <span className="text-sm">Saving...</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <LoadingEffect />
        </div>
      )}

      {/* Agents List */}
      {!loading && agents.length > 0 && (
        <div className="space-y-6">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              runs={runsMap[agent.id] || []}
              onToggle={() => handleToggle(agent)}
              onTrigger={() => handleTrigger(agent)}
              onTriggerTypeChange={(triggerType) =>
                handleTriggerTypeChange(agent, triggerType)
              }
              onConfigChange={(key, value) =>
                handleConfigChange(agent, key, value)
              }
              triggering={triggeringId === agent.id}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && agents.length === 0 && (
        <div className="bg-base-200 shadow-sm card">
          <div className="items-center py-20 text-center card-body">
            <Icon
              icon="lucide--bot"
              className="mb-4 w-16 h-16 text-base-content/30"
            />
            <h3 className="mb-2 font-semibold text-xl">No agents configured</h3>
            <p className="text-base-content/70">
              Agents are configured in the database and will appear here once
              registered.
            </p>
          </div>
        </div>
      )}

      {/* Refresh button */}
      {!loading && (
        <div className="flex justify-center mt-6">
          <button className="gap-2 btn btn-ghost btn-sm" onClick={loadData}>
            <Icon icon="lucide--refresh-cw" className="w-4 h-4" />
            Refresh
          </button>
        </div>
      )}
    </PageContainer>
  );
}
