/**
 * SystemStatusDropdown Component
 *
 * A dropdown component that displays system health status including:
 * - Real-time SSE connection status
 * - Backend API health
 * - Database status
 *
 * Shows a collapsed summary indicator that expands to show detailed status.
 */

import { useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Dropdown } from '@/components/molecules/Dropdown';
import { useDataUpdatesConnection } from '@/contexts/data-updates';
import { useHealthCheck, type HealthStatus } from '@/hooks/use-health-check';
import type { ConnectionState } from '@/types/realtime-events';

export interface SystemStatusDropdownProps {
  /** Additional CSS classes */
  className?: string;
}

type OverallStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

interface StatusItemConfig {
  label: string;
  icon: string;
  status: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  description: string;
}

// Map connection states to status item configs
const connectionStateConfig: Record<ConnectionState, StatusItemConfig> = {
  connected: {
    label: 'Real-time Updates',
    icon: 'lucide--wifi',
    status: 'success',
    description: 'Connected',
  },
  connecting: {
    label: 'Real-time Updates',
    icon: 'lucide--loader-2',
    status: 'info',
    description: 'Connecting...',
  },
  disconnected: {
    label: 'Real-time Updates',
    icon: 'lucide--wifi-off',
    status: 'neutral',
    description: 'Disconnected',
  },
  error: {
    label: 'Real-time Updates',
    icon: 'lucide--alert-circle',
    status: 'warning',
    description: 'Connection error',
  },
};

// Map health status to status item configs
const healthStatusConfig: Record<
  HealthStatus,
  Omit<StatusItemConfig, 'label'>
> = {
  healthy: {
    icon: 'lucide--server',
    status: 'success',
    description: 'Healthy',
  },
  degraded: {
    icon: 'lucide--server',
    status: 'warning',
    description: 'Degraded',
  },
  unhealthy: {
    icon: 'lucide--server-off',
    status: 'error',
    description: 'Unhealthy',
  },
  unknown: {
    icon: 'lucide--server',
    status: 'neutral',
    description: 'Unknown',
  },
};

const statusColorClasses: Record<StatusItemConfig['status'], string> = {
  success: 'status-success',
  warning: 'status-warning',
  error: 'status-error',
  info: 'status-info',
  neutral: 'status-neutral',
};

const textColorClasses: Record<StatusItemConfig['status'], string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  neutral: 'text-base-content/50',
};

// Calculate overall status from individual statuses
function calculateOverallStatus(
  connectionState: ConnectionState,
  healthStatus: HealthStatus,
  dbStatus: 'up' | 'down' | null
): OverallStatus {
  // If backend is unhealthy or DB is down, overall is unhealthy
  if (healthStatus === 'unhealthy' || dbStatus === 'down') {
    return 'unhealthy';
  }

  // If there's degraded health or SSE connection error, overall is degraded
  if (healthStatus === 'degraded' || connectionState === 'error') {
    return 'degraded';
  }

  // If we don't have health data yet, status is unknown
  if (healthStatus === 'unknown') {
    return 'unknown';
  }

  // Everything is good
  return 'healthy';
}

const overallStatusConfig: Record<
  OverallStatus,
  { label: string; status: StatusItemConfig['status'] }
> = {
  healthy: { label: 'System running smoothly', status: 'success' },
  degraded: { label: 'System partially degraded', status: 'warning' },
  unhealthy: { label: 'System issues detected', status: 'error' },
  unknown: { label: 'Checking system status...', status: 'neutral' },
};

function StatusItem({
  config,
  isAnimating = false,
}: {
  config: StatusItemConfig;
  isAnimating?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon
        icon={config.icon}
        className={`size-4 ${textColorClasses[config.status]} ${
          isAnimating ? 'animate-spin' : ''
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-base-content">{config.label}</p>
        <p className={`text-xs ${textColorClasses[config.status]}`}>
          {config.description}
        </p>
      </div>
      <span
        className={`status ${statusColorClasses[config.status]}`}
        aria-hidden="true"
      />
    </div>
  );
}

function formatLastChecked(date: Date | null): string {
  if (!date) return 'Never';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 120) return '1 minute ago';
  return `${Math.floor(seconds / 60)} minutes ago`;
}

export function SystemStatusDropdown({
  className = '',
}: SystemStatusDropdownProps) {
  const { connectionState, reconnect } = useDataUpdatesConnection();
  const {
    data: healthData,
    status: healthStatus,
    lastChecked,
    refetch,
    isLoading,
  } = useHealthCheck();

  // Build status items
  const connectionConfig = connectionStateConfig[connectionState];
  const backendConfig: StatusItemConfig = {
    label: 'Backend API',
    ...healthStatusConfig[healthStatus],
  };
  const dbConfig: StatusItemConfig = useMemo(() => {
    if (!healthData) {
      return {
        label: 'Database',
        icon: 'lucide--database',
        status: 'neutral' as const,
        description: 'Unknown',
      };
    }
    return {
      label: 'Database',
      icon: 'lucide--database',
      status:
        healthData.db === 'up' ? ('success' as const) : ('error' as const),
      description: healthData.db === 'up' ? 'Connected' : 'Disconnected',
    };
  }, [healthData]);

  const overallStatus = calculateOverallStatus(
    connectionState,
    healthStatus,
    healthData?.db ?? null
  );
  const overall = overallStatusConfig[overallStatus];

  const handleRefresh = async () => {
    await refetch();
    if (connectionState === 'error' || connectionState === 'disconnected') {
      reconnect();
    }
  };

  return (
    <Dropdown vertical="top" className={className}>
      <Dropdown.Trigger>
        <div
          className="flex items-center gap-2.5 bg-base-100 hover:bg-base-200 shadow-xs px-2.5 py-1 border border-base-300 rounded-full transition-colors cursor-pointer"
          role="button"
          aria-label="System status"
          data-testid="system-status-trigger"
        >
          <span
            className={`status ${statusColorClasses[overall.status]}`}
            aria-label={`System Status: ${overallStatus}`}
          />
          <p className="text-sm text-base-content/80">{overall.label}</p>
          <Icon
            icon="lucide--chevron-up"
            className="size-3.5 text-base-content/60"
          />
        </div>
      </Dropdown.Trigger>

      <Dropdown.Menu className="w-72 mb-2">
        {/* Header */}
        <div className="px-3 py-2 border-b border-base-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
              System Status
            </span>
            <button
              className="btn btn-ghost btn-xs gap-1"
              onClick={handleRefresh}
              disabled={isLoading}
              title="Refresh status"
            >
              <Icon
                icon="lucide--refresh-cw"
                className={`size-3 ${isLoading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Status Items */}
        <div className="divide-y divide-base-300">
          <StatusItem
            config={connectionConfig}
            isAnimating={connectionState === 'connecting'}
          />
          <StatusItem config={backendConfig} />
          <StatusItem config={dbConfig} />
        </div>

        {/* Footer with embeddings and last checked */}
        <div className="px-3 py-2 border-t border-base-300 bg-base-200/50">
          <div className="flex items-center justify-between text-xs text-base-content/60">
            <span>
              Embeddings:{' '}
              <span
                className={
                  healthData?.embeddings === 'enabled'
                    ? 'text-success'
                    : 'text-base-content/60'
                }
              >
                {healthData?.embeddings ?? 'unknown'}
              </span>
            </span>
            <span>Checked {formatLastChecked(lastChecked)}</span>
          </div>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default SystemStatusDropdown;
