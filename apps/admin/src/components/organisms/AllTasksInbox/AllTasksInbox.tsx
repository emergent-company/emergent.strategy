/**
 * AllTasksInbox Organism
 * Cross-project tasks inbox UI for actionable items across all accessible projects
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskRow } from '@/components/molecules/TaskRow';
import { Button } from '@/components/atoms/Button';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import type { Task, TaskCounts, TaskStatus } from '@/types/task';

export interface AllTasksInboxProps {
  tasks: Task[];
  counts: TaskCounts;
  statusFilter?: TaskStatus;
  loading?: boolean;
  onStatusFilterChange?: (status: TaskStatus | undefined) => void;
  onResolve?: (
    taskId: string,
    status: 'accepted' | 'rejected',
    notes?: string
  ) => void;
  onTaskClick?: (task: Task) => void;
}

interface TimeGroup {
  title: string;
  tasks: Task[];
}

export const AllTasksInbox: React.FC<AllTasksInboxProps> = ({
  tasks,
  counts,
  statusFilter = 'pending',
  loading = false,
  onStatusFilterChange,
  onResolve,
  onTaskClick,
}) => {
  // Group tasks by time
  const groupByTime = (taskList: Task[]): TimeGroup[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: TimeGroup[] = [
      { title: 'Today', tasks: [] },
      { title: 'Yesterday', tasks: [] },
      { title: 'Last 7 days', tasks: [] },
      { title: 'Older', tasks: [] },
    ];

    taskList.forEach((task) => {
      const date = new Date(task.createdAt);
      if (date >= today) {
        groups[0].tasks.push(task);
      } else if (date >= yesterday) {
        groups[1].tasks.push(task);
      } else if (date >= lastWeek) {
        groups[2].tasks.push(task);
      } else {
        groups[3].tasks.push(task);
      }
    });

    return groups.filter((group) => group.tasks.length > 0);
  };

  const timeGroups = groupByTime(tasks);

  return (
    <div className="flex flex-col bg-base-100 border border-base-300 rounded h-full">
      {/* Top bar with status filters */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-base-300">
        {/* Status filter tabs */}
        <div className="flex items-center gap-1" role="tablist">
          <Button
            size="sm"
            variant={statusFilter === 'pending' ? 'solid' : 'soft'}
            color={statusFilter === 'pending' ? 'warning' : undefined}
            onClick={() => onStatusFilterChange?.('pending')}
          >
            Pending
            {counts.pending > 0 && (
              <span className="badge badge-xs ml-1">{counts.pending}</span>
            )}
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'accepted' ? 'solid' : 'soft'}
            color={statusFilter === 'accepted' ? 'success' : undefined}
            onClick={() => onStatusFilterChange?.('accepted')}
          >
            Accepted
            {counts.accepted > 0 && (
              <span className="badge badge-xs ml-1">{counts.accepted}</span>
            )}
          </Button>
          <Button
            size="sm"
            variant={statusFilter === 'rejected' ? 'solid' : 'soft'}
            onClick={() => onStatusFilterChange?.('rejected')}
          >
            Rejected
            {counts.rejected > 0 && (
              <span className="badge badge-xs ml-1">{counts.rejected}</span>
            )}
          </Button>
          <Button
            size="sm"
            variant={statusFilter === undefined ? 'solid' : 'soft'}
            onClick={() => onStatusFilterChange?.(undefined)}
          >
            All
          </Button>
        </div>

        {/* Info text */}
        <div className="text-xs text-base-content/50">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} across all projects
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto" role="tabpanel">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Spinner size="md" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col justify-center items-center gap-3 py-16 text-center">
            <Icon
              icon="lucide--clipboard-check"
              className="w-12 h-12 text-base-content/30"
            />
            <div className="text-sm text-base-content/60">
              {statusFilter === 'pending'
                ? 'No pending tasks across your projects. You are all caught up!'
                : statusFilter === 'accepted'
                ? 'No accepted tasks yet.'
                : statusFilter === 'rejected'
                ? 'No rejected tasks.'
                : 'No tasks across your projects.'}
            </div>
          </div>
        ) : (
          timeGroups.map((group) => (
            <div key={group.title} className="mb-4">
              <div className="px-4 py-2 font-semibold text-xs text-base-content/50">
                {group.title}
              </div>
              <AnimatePresence mode="popLayout">
                {group.tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
                    transition={{
                      opacity: { duration: 0.2 },
                      x: { duration: 0.2 },
                      height: { duration: 0.2, delay: 0.1 },
                      layout: { duration: 0.2 },
                    }}
                  >
                    <TaskRow
                      task={task}
                      onClick={onTaskClick}
                      onResolve={onResolve}
                      showProjectName
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AllTasksInbox;
