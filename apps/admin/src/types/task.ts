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

  // Cross-project view fields (optional)
  projectName?: string; // Project name for cross-project task views
  isOutdated?: boolean; // For merge_suggestion tasks: true if versions are no longer HEAD
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

/**
 * LLM-powered merge suggestion types
 */
export interface PropertyMergeSuggestion {
  /** Property key */
  key: string;
  /** Value from source object */
  sourceValue: unknown;
  /** Value from target object */
  targetValue: unknown;
  /** Suggested merged value */
  suggestedValue: unknown;
  /** Explanation of why this value was chosen */
  explanation: string;
  /** Whether the property values differ */
  hasDifference: boolean;
  /** Action taken: 'keep_source', 'keep_target', 'combine', 'new_value' */
  action: 'keep_source' | 'keep_target' | 'combine' | 'new_value';
}

export interface MergeSuggestionResult {
  /** Suggested merged properties */
  suggestedProperties: Record<string, unknown>;
  /** Per-property explanations and suggestions */
  propertyMergeSuggestions: PropertyMergeSuggestion[];
  /** Overall explanation of the merge suggestion */
  overallExplanation: string;
  /** Confidence score (0-1) in the merge suggestion */
  confidence: number;
  /** Any warnings or notes about the merge */
  warnings: string[];
}
