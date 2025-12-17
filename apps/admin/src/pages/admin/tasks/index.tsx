/**
 * Admin Tasks Page
 * Standalone page for viewing and managing project-scoped tasks
 */
import { useState } from 'react';
import { MetaData } from '@/components';
import { PageContainer } from '@/components/layouts';
import { TasksInbox } from '@/components/organisms/TasksInbox';
import { MergeComparisonModal } from '@/components/organisms/MergeComparisonModal';
import { useTasks, useTaskCounts, useTaskMutations } from '@/hooks/useTasks';
import { useNotifications } from '@/hooks/useNotifications';
import { useConfig } from '@/contexts/config';
import { useToast } from '@/hooks/use-toast';
import type { Task, TaskStatus } from '@/types/task';

// Stable filter object to prevent recreation on every render
const NOTIFICATION_FILTER = {
  category: 'all' as const,
  unreadOnly: false,
  search: '',
};

const TasksPage = () => {
  const [taskStatusFilter, setTaskStatusFilter] = useState<
    TaskStatus | undefined
  >('pending');

  // Merge comparison modal state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);

  // Toast notifications
  const { showToast } = useToast();

  // Get active project from config
  const { config } = useConfig();
  const projectId = config.activeProjectId || null;

  // Fetch tasks for active project
  const {
    data: tasks = [],
    isLoading: tasksLoading,
    refetch: refetchTasks,
  } = useTasks(projectId, { status: taskStatusFilter });

  // Fetch task counts
  const { data: taskCounts, refetch: refetchTaskCounts } =
    useTaskCounts(projectId);

  // Also refetch notifications when tasks change (in case linked notifications need updating)
  const { refetch: refetchNotifications } = useNotifications(
    'important',
    NOTIFICATION_FILTER
  );

  // Task mutation handlers
  const taskMutations = useTaskMutations(() => {
    refetchTasks();
    refetchTaskCounts();
    refetchNotifications();
  });

  const handleTaskResolve = async (
    taskId: string,
    status: 'accepted' | 'rejected',
    notes?: string
  ) => {
    try {
      await taskMutations.resolve(taskId, status, notes);
      showToast({
        message:
          status === 'accepted'
            ? 'Task accepted successfully'
            : 'Task rejected',
        variant: 'success',
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : 'Failed to resolve task',
        variant: 'error',
      });
    }
  };

  // Handle task click - open merge comparison modal for merge suggestions
  const handleTaskClick = (task: Task) => {
    if (task.type === 'merge_suggestion') {
      setSelectedTask(task);
      setIsMergeModalOpen(true);
    }
  };

  // Handle merge modal accept
  const handleMergeAccept = async (taskId: string) => {
    try {
      await taskMutations.resolve(taskId, 'accepted');
      showToast({
        message: 'Objects merged successfully',
        variant: 'success',
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : 'Failed to merge objects',
        variant: 'error',
      });
    } finally {
      setIsMergeModalOpen(false);
      setSelectedTask(null);
    }
  };

  // Handle merge modal reject
  const handleMergeReject = async (taskId: string) => {
    try {
      await taskMutations.resolve(taskId, 'rejected');
      showToast({
        message: 'Merge suggestion dismissed',
        variant: 'info',
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : 'Failed to reject task',
        variant: 'error',
      });
    } finally {
      setIsMergeModalOpen(false);
      setSelectedTask(null);
    }
  };

  // Close merge modal
  const handleMergeModalClose = () => {
    setIsMergeModalOpen(false);
    setSelectedTask(null);
  };

  return (
    <PageContainer maxWidth="7xl" testId="page-tasks">
      <MetaData title="Tasks" noIndex />

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-bold text-2xl">Tasks</h1>
        <p className="mt-1 text-base-content/70">
          Review and manage project tasks requiring your attention
        </p>
      </div>

      {/* Tasks content */}
      <TasksInbox
        tasks={tasks}
        counts={
          taskCounts || { pending: 0, accepted: 0, rejected: 0, cancelled: 0 }
        }
        statusFilter={taskStatusFilter}
        loading={tasksLoading}
        projectId={projectId}
        onStatusFilterChange={setTaskStatusFilter}
        onResolve={handleTaskResolve}
        onTaskClick={handleTaskClick}
      />

      {/* Merge Comparison Modal */}
      <MergeComparisonModal
        task={selectedTask}
        isOpen={isMergeModalOpen}
        onClose={handleMergeModalClose}
        onAccept={handleMergeAccept}
        onReject={handleMergeReject}
      />
    </PageContainer>
  );
};

export default TasksPage;
