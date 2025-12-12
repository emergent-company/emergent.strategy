import { useDataUpdatesConnection } from '@/contexts/data-updates';
import { Icon } from '../Icon';
import type { ConnectionState } from '@/types/realtime-events';

interface ConnectionIndicatorProps {
  /** Show text label alongside the indicator */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const stateConfig: Record<
  ConnectionState,
  { icon: string; color: string; label: string; animate?: boolean }
> = {
  connected: {
    icon: 'lucide--wifi',
    color: 'text-success',
    label: 'Connected',
  },
  connecting: {
    icon: 'lucide--loader-2',
    color: 'text-info',
    label: 'Connecting...',
    animate: true,
  },
  disconnected: {
    icon: 'lucide--wifi-off',
    color: 'text-base-content/40',
    label: 'Disconnected',
  },
  error: {
    icon: 'lucide--alert-circle',
    color: 'text-warning',
    label: 'Connection error',
  },
};

const sizeClasses = {
  sm: 'size-3',
  md: 'size-4',
  lg: 'size-5',
};

/**
 * ConnectionIndicator displays the real-time SSE connection status.
 *
 * Shows a small icon indicating whether the app is connected to the
 * real-time updates stream. Optionally displays a text label.
 *
 * @example
 * // Icon only (default)
 * <ConnectionIndicator />
 *
 * @example
 * // With label
 * <ConnectionIndicator showLabel />
 *
 * @example
 * // In a footer or status bar
 * <div className="flex items-center gap-2 text-sm text-base-content/60">
 *   <ConnectionIndicator size="sm" showLabel />
 * </div>
 */
export function ConnectionIndicator({
  showLabel = false,
  size = 'md',
  className = '',
}: ConnectionIndicatorProps) {
  const { connectionState, reconnect } = useDataUpdatesConnection();
  const config = stateConfig[connectionState];

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={config.label}
    >
      <Icon
        icon={config.icon}
        className={`${sizeClasses[size]} ${config.color} ${
          config.animate ? 'animate-spin' : ''
        }`}
      />
      {showLabel && (
        <span className={`text-xs ${config.color}`}>{config.label}</span>
      )}
      {connectionState === 'error' && (
        <button
          className="btn btn-ghost btn-xs"
          onClick={reconnect}
          title="Retry connection"
        >
          <Icon icon="lucide--refresh-cw" className={sizeClasses[size]} />
        </button>
      )}
    </div>
  );
}

export default ConnectionIndicator;
