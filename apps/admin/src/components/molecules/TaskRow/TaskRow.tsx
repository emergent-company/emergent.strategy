/**
 * TaskRow Molecule
 * Single task row for the Tasks inbox view
 */
import React from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import type { Task } from '@/types/task';

export interface TaskRowProps {
  task: Task;
  onResolve?: (
    taskId: string,
    status: 'accepted' | 'rejected',
    notes?: string
  ) => void;
  onClick?: (task: Task) => void;
  /** Show project name badge (for cross-project views) */
  showProjectName?: boolean;
}

export const TaskRow: React.FC<TaskRowProps> = ({
  task,
  onResolve,
  onClick,
  showProjectName = false,
}) => {
  const isPending = task.status === 'pending';
  const isResolved = task.status === 'accepted' || task.status === 'rejected';
  const isCancelled = task.status === 'cancelled';

  const handleClick = () => {
    onClick?.(task);
  };

  const handleResolve = (
    e: React.MouseEvent,
    status: 'accepted' | 'rejected'
  ) => {
    e.stopPropagation();
    onResolve?.(task.id, status);
  };

  // Format relative time
  const formatRelativeTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get task type label
  const getTypeLabel = (type: string): string => {
    const typeLabels: Record<string, string> = {
      merge_suggestion: 'Merge Suggestion',
      review_request: 'Review Request',
      approval_needed: 'Approval Needed',
    };
    return typeLabels[type] || type;
  };

  // Get icon based on task type
  const getTypeIcon = (type: string): string => {
    const typeIcons: Record<string, string> = {
      merge_suggestion: 'lucide--git-merge',
      review_request: 'lucide--eye',
      approval_needed: 'lucide--check-circle',
    };
    return typeIcons[type] || 'lucide--clipboard-list';
  };

  return (
    <div
      className="group flex items-start gap-3 hover:bg-base-200/50 px-4 py-3 border-b border-base-300/50 w-full text-left transition-colors cursor-pointer"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Task type icon */}
      <div className="flex-shrink-0 mt-1">
        <div
          className={`p-2 rounded-lg ${
            isPending
              ? 'bg-warning/10 text-warning'
              : 'bg-base-200 text-base-content/50'
          }`}
        >
          <Icon icon={getTypeIcon(task.type)} className="w-4 h-4" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Type badge */}
        <div className="flex items-center gap-2 mb-1">
          <span className="badge badge-sm badge-ghost">
            {getTypeLabel(task.type)}
          </span>
          {showProjectName && task.projectName && (
            <span className="badge badge-sm badge-outline badge-primary">
              {task.projectName}
            </span>
          )}
        </div>

        {/* Title */}
        <div
          className={`text-base-content ${isPending ? 'font-semibold' : ''}`}
        >
          {task.title}
        </div>

        {/* Description */}
        {task.description && (
          <div className="mt-1 text-sm text-base-content/60 line-clamp-2">
            {task.description}
          </div>
        )}

        {/* Action buttons for pending tasks */}
        {isPending && (
          <div className="flex gap-2 mt-3">
            <Button
              size="xs"
              color="success"
              onClick={(e) => handleResolve(e, 'accepted')}
            >
              Accept
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => handleResolve(e, 'rejected')}
            >
              Reject
            </Button>
          </div>
        )}

        {/* Resolved status */}
        {isResolved && (
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`badge badge-sm ${
                task.status === 'accepted' ? 'badge-success' : 'badge-ghost'
              }`}
            >
              {task.status === 'accepted' ? 'Accepted' : 'Rejected'}
            </span>
            {task.resolvedByName && (
              <span className="text-xs text-base-content/50">
                by {task.resolvedByName}
              </span>
            )}
            {task.resolvedAt && (
              <span className="text-xs text-base-content/50">
                {formatRelativeTime(task.resolvedAt)}
              </span>
            )}
          </div>
        )}

        {/* Cancelled status */}
        {isCancelled && (
          <div className="mt-2">
            <span className="badge badge-sm badge-neutral">Cancelled</span>
          </div>
        )}
      </div>

      {/* Right side - timestamp */}
      <div className="flex-shrink-0 text-xs text-base-content/50">
        {formatRelativeTime(task.createdAt)}
      </div>
    </div>
  );
};

export default TaskRow;
