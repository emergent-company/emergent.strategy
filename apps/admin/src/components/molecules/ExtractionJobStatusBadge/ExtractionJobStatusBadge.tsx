/**
 * Extraction Job Status Badge Component
 *
 * Displays the current status of an extraction job with appropriate styling
 */

import { Icon } from '@/components/atoms/Icon';

export type ExtractionJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'requires_review'
  | 'failed'
  | 'cancelled';

export interface ExtractionJobStatusBadgeProps {
  status: ExtractionJobStatus;
  /** Show icon alongside text */
  showIcon?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_CONFIG: Record<
  ExtractionJobStatus,
  {
    label: string;
    icon: string;
    badgeClass: string;
  }
> = {
  queued: {
    label: 'Queued',
    icon: 'lucide--clock',
    badgeClass: 'badge-secondary badge-soft',
  },
  running: {
    label: 'Running',
    icon: 'lucide--loader-circle',
    badgeClass: 'badge-info',
  },
  completed: {
    label: 'Completed',
    icon: 'lucide--check-circle',
    badgeClass: 'badge-success',
  },
  requires_review: {
    label: 'Needs Review',
    icon: 'lucide--eye',
    badgeClass: 'badge-warning',
  },
  failed: {
    label: 'Failed',
    icon: 'lucide--x-circle',
    badgeClass: 'badge-error',
  },
  cancelled: {
    label: 'Cancelled',
    icon: 'lucide--ban',
    badgeClass: 'badge-neutral badge-soft',
  },
};

export function ExtractionJobStatusBadge({
  status,
  showIcon = true,
  size = 'md',
}: ExtractionJobStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    icon: 'lucide--help-circle',
    badgeClass: 'badge-ghost',
  };

  const sizeClass = {
    sm: 'badge-sm',
    md: 'badge-md',
    lg: 'badge-lg',
  }[size];

  return (
    <span className={`badge ${config.badgeClass} ${sizeClass} gap-1`}>
      {showIcon && (
        <Icon
          icon={config.icon}
          className={status === 'running' ? 'animate-spin' : ''}
        />
      )}
      <span>{config.label}</span>
    </span>
  );
}
