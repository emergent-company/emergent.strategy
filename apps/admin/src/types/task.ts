/**
 * Task types for Admin Inbox
 *
 * Tasks are project-scoped actionable items that can be resolved
 * by any project member. They are separate from personal notifications.
 */

export type TaskStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type TaskSourceType = 'agent' | 'user' | 'system';

export interface Task {
  id: string;
  projectId: string;

  // Content
  title: string;
  description: string | null;
  type: string; // e.g., 'merge_suggestion'

  // Status
  status: TaskStatus;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null; // Display name of user who resolved
  resolutionNotes: string | null;

  // Source tracking
  sourceType: TaskSourceType | null;
  sourceId: string | null;

  // Task-specific data
  metadata: Record<string, unknown>;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface TaskCounts {
  pending: number;
  accepted: number;
  rejected: number;
  cancelled: number;
}

export interface TaskFilter {
  status?: TaskStatus;
  type?: string;
  page?: number;
  limit?: number;
}

export interface ResolveTaskPayload {
  status: 'accepted' | 'rejected';
  notes?: string;
}

export interface TasksResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
}
