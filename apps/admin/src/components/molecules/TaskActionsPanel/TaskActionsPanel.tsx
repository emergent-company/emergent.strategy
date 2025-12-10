/**
 * TaskActionsPanel Molecule
 * Inline task actions panel for notifications linked to tasks
 * Shows Accept/Reject buttons and a "View Details" button for merge suggestions
 */
import React from 'react';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';

export interface TaskActionsPanelProps {
  taskId: string;
  taskType: string;
  taskStatus: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  onAccept?: (taskId: string) => void;
  onReject?: (taskId: string) => void;
  onViewDetails?: (taskId: string) => void;
  loading?: boolean;
}

export const TaskActionsPanel: React.FC<TaskActionsPanelProps> = ({
  taskId,
  taskType,
  taskStatus,
  onAccept,
  onReject,
  onViewDetails,
  loading = false,
}) => {
  const isPending = taskStatus === 'pending';
  const isResolved = taskStatus === 'accepted' || taskStatus === 'rejected';
  const isMergeSuggestion = taskType === 'merge_suggestion';

  const handleAccept = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAccept?.(taskId);
  };

  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReject?.(taskId);
  };

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewDetails?.(taskId);
  };

  if (isResolved) {
    return (
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-base-300/50">
        <span
          className={`badge badge-sm ${
            taskStatus === 'accepted' ? 'badge-success' : 'badge-ghost'
          }`}
        >
          {taskStatus === 'accepted' ? 'Accepted' : 'Rejected'}
        </span>
        {isMergeSuggestion && onViewDetails && (
          <Button
            size="xs"
            variant="link"
            onClick={handleViewDetails}
            className="text-xs"
          >
            <Icon icon="lucide--eye" className="w-3 h-3 mr-1" />
            View
          </Button>
        )}
      </div>
    );
  }

  if (!isPending) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-base-300/50">
      {/* Accept/Reject buttons */}
      <Button
        size="xs"
        color="success"
        variant="soft"
        onClick={handleAccept}
        disabled={loading}
      >
        <Icon icon="lucide--check" className="w-3 h-3 mr-1" />
        Accept
      </Button>
      <Button
        size="xs"
        color="error"
        variant="soft"
        onClick={handleReject}
        disabled={loading}
      >
        <Icon icon="lucide--x" className="w-3 h-3 mr-1" />
        Reject
      </Button>

      {/* View Details button for merge suggestions */}
      {isMergeSuggestion && onViewDetails && (
        <Button
          size="xs"
          variant="link"
          onClick={handleViewDetails}
          disabled={loading}
          className="ml-auto"
        >
          <Icon icon="lucide--columns-2" className="w-3 h-3 mr-1" />
          Compare
        </Button>
      )}
    </div>
  );
};

export default TaskActionsPanel;
