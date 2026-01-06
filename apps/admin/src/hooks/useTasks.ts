/**
 * Task Data Hooks
 * Custom hooks for task data fetching and mutations using React state
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task, TaskCounts, TaskFilter } from '@/types/task';
import { createTasksClient } from '@/api/tasks';
import { useApi } from '@/hooks/use-api';
import { usePageVisibility } from '@/hooks/use-page-visibility';

/**
 * Hook to fetch tasks for a project
 */
export function useTasks(projectId: string | null, filters: TaskFilter = {}) {
  const { apiBase, fetchJson } = useApi();
  const tasksApi = useMemo(
    () => createTasksClient(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [data, setData] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize filter values to prevent infinite loops from object recreation
  const { status, type, page, limit } = filters;
  const memoizedFilters = useMemo(
    () => ({ status, type, page, limit }),
    [status, type, page, limit]
  );

  const refetch = useCallback(async () => {
    if (!projectId) {
      setData([]);
      setTotal(0);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const response = await tasksApi.getTasks(projectId, memoizedFilters);
      setData(response.tasks);
      setTotal(response.total);
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.log('Failed to fetch tasks:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [tasksApi, projectId, memoizedFilters]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, total, isLoading, error, refetch };
}

/**
 * Hook to fetch task counts for a project
 * Pauses polling when tab is not visible
 */
export function useTaskCounts(projectId: string | null) {
  const { apiBase, fetchJson } = useApi();
  const isVisible = usePageVisibility();
  const tasksApi = useMemo(
    () => createTasksClient(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [data, setData] = useState<TaskCounts>({
    pending: 0,
    accepted: 0,
    rejected: 0,
    cancelled: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) {
      setData({ pending: 0, accepted: 0, rejected: 0, cancelled: 0 });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const counts = await tasksApi.getTaskCounts(projectId);
      setData(counts);
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.log('Failed to fetch task counts:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [tasksApi, projectId]);

  useEffect(() => {
    // Don't poll when tab is hidden
    if (!isVisible) return;

    refetch();
    // Refetch every minute
    const interval = setInterval(() => {
      refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch, isVisible]);

  return { data, isLoading, error, refetch };
}

/**
 * Hook for task mutations
 */
export function useTaskMutations(onSuccess?: () => void) {
  const { apiBase, fetchJson } = useApi();
  const tasksApi = useMemo(
    () => createTasksClient(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const resolve = useCallback(
    async (
      taskId: string,
      status: 'accepted' | 'rejected',
      notes?: string
    ): Promise<Task> => {
      try {
        setIsLoading(true);
        setError(null);
        const task = await tasksApi.resolveTask(taskId, { status, notes });
        onSuccess?.();
        return task;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [tasksApi, onSuccess]
  );

  const cancel = useCallback(
    async (taskId: string, reason?: string): Promise<Task> => {
      try {
        setIsLoading(true);
        setError(null);
        const task = await tasksApi.cancelTask(taskId, reason);
        onSuccess?.();
        return task;
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [tasksApi, onSuccess]
  );

  return {
    resolve,
    cancel,
    isLoading,
    error,
  };
}

/**
 * Hook to fetch tasks across all projects the user has access to
 */
export function useAllTasks(filters: TaskFilter = {}) {
  const { apiBase, fetchJson } = useApi();
  const tasksApi = useMemo(
    () => createTasksClient(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [data, setData] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize filter values to prevent infinite loops from object recreation
  const { status, type, page, limit } = filters;
  const memoizedFilters = useMemo(
    () => ({ status, type, page, limit }),
    [status, type, page, limit]
  );

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await tasksApi.getAllTasks(memoizedFilters);
      setData(response.tasks);
      setTotal(response.total);
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.log('Failed to fetch all tasks:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [tasksApi, memoizedFilters]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, total, isLoading, error, refetch };
}

/**
 * Hook to fetch task counts across all projects the user has access to
 * Pauses polling when tab is not visible
 */
export function useAllTaskCounts() {
  const { apiBase, fetchJson } = useApi();
  const isVisible = usePageVisibility();
  const tasksApi = useMemo(
    () => createTasksClient(apiBase, fetchJson),
    [apiBase, fetchJson]
  );

  const [data, setData] = useState<TaskCounts>({
    pending: 0,
    accepted: 0,
    rejected: 0,
    cancelled: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const counts = await tasksApi.getAllTaskCounts();
      setData(counts);
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.log('Failed to fetch all task counts:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [tasksApi]);

  useEffect(() => {
    // Don't poll when tab is hidden
    if (!isVisible) return;

    refetch();
    // Refetch every minute
    const interval = setInterval(() => {
      refetch();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetch, isVisible]);

  return { data, isLoading, error, refetch };
}
