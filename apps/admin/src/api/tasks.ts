/**
 * Tasks API Client
 *
 * TypeScript client for task management endpoints
 */

import {
  Task,
  TaskCounts,
  TaskFilter,
  ResolveTaskPayload,
  TasksResponse,
  MergeSuggestionResult,
} from '../types/task';

/**
 * API response wrapper
 */
export interface TaskApiResponse<T> {
  success: boolean;
  data?: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
  error?: string;
}

/**
 * API client interface
 */
export interface TasksClient {
  /**
   * Get tasks for a project
   */
  getTasks(projectId: string, filters?: TaskFilter): Promise<TasksResponse>;

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): Promise<Task | null>;

  /**
   * Get task counts by status for a project
   */
  getTaskCounts(projectId: string): Promise<TaskCounts>;

  /**
   * Resolve a task (accept or reject)
   */
  resolveTask(taskId: string, payload: ResolveTaskPayload): Promise<Task>;

  /**
   * Cancel a task
   */
  cancelTask(taskId: string, reason?: string): Promise<Task>;

  /**
   * Get LLM-powered merge suggestion for a merge_suggestion task
   */
  getMergeSuggestion(taskId: string): Promise<MergeSuggestionResult | null>;

  /**
   * Get tasks across all projects the user has access to
   */
  getAllTasks(filters?: TaskFilter): Promise<TasksResponse>;

  /**
   * Get task counts across all projects the user has access to
   */
  getAllTaskCounts(): Promise<TaskCounts>;
}

/**
 * Create tasks API client
 *
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @returns Tasks client
 */
export function createTasksClient(
  apiBase: string,
  fetchJson: <T>(url: string, init?: any) => Promise<T>
): TasksClient {
  const baseUrl = `${apiBase}/api/tasks`;

  return {
    async getTasks(projectId: string, filters: TaskFilter = {}) {
      const params = new URLSearchParams({ project_id: projectId });

      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));

      const response = await fetchJson<
        TaskApiResponse<Task[]> & {
          meta?: { total: number; page: number; limit: number };
        }
      >(`${baseUrl}?${params.toString()}`);

      return {
        tasks: response.data || [],
        total: response.meta?.total || 0,
        page: response.meta?.page || 1,
        limit: response.meta?.limit || 50,
      };
    },

    async getTask(taskId: string) {
      const response = await fetchJson<TaskApiResponse<Task>>(
        `${baseUrl}/${taskId}`
      );
      return response.data || null;
    },

    async getTaskCounts(projectId: string) {
      const response = await fetchJson<TaskApiResponse<TaskCounts>>(
        `${baseUrl}/counts?project_id=${projectId}`
      );
      return (
        response.data || { pending: 0, accepted: 0, rejected: 0, cancelled: 0 }
      );
    },

    async resolveTask(taskId: string, payload: ResolveTaskPayload) {
      const response = await fetchJson<TaskApiResponse<Task>>(
        `${baseUrl}/${taskId}/resolve`,
        {
          method: 'POST',
          body: payload,
        }
      );
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to resolve task');
      }
      return response.data;
    },

    async cancelTask(taskId: string, reason?: string) {
      const response = await fetchJson<TaskApiResponse<Task>>(
        `${baseUrl}/${taskId}/cancel`,
        {
          method: 'POST',
          body: { reason },
        }
      );
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to cancel task');
      }
      return response.data;
    },

    async getMergeSuggestion(taskId: string) {
      const response = await fetchJson<TaskApiResponse<MergeSuggestionResult>>(
        `${baseUrl}/${taskId}/merge-suggestion`
      );
      if (!response.success) {
        throw new Error(response.error || 'Failed to get merge suggestion');
      }
      return response.data || null;
    },

    async getAllTasks(filters: TaskFilter = {}) {
      const params = new URLSearchParams();

      if (filters.status) params.append('status', filters.status);
      if (filters.type) params.append('type', filters.type);
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));

      const queryString = params.toString();
      const url = queryString
        ? `${baseUrl}/all?${queryString}`
        : `${baseUrl}/all`;

      const response = await fetchJson<
        TaskApiResponse<Task[]> & {
          meta?: { total: number; page: number; limit: number };
        }
      >(url);

      return {
        tasks: response.data || [],
        total: response.meta?.total || 0,
        page: response.meta?.page || 1,
        limit: response.meta?.limit || 50,
      };
    },

    async getAllTaskCounts() {
      const response = await fetchJson<TaskApiResponse<TaskCounts>>(
        `${baseUrl}/all/counts`
      );
      return (
        response.data || { pending: 0, accepted: 0, rejected: 0, cancelled: 0 }
      );
    },
  };
}
