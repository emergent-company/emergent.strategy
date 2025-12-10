/**
 * Notification types for Admin Inbox
 * Based on docs/spec/35-admin-notification-inbox.md
 */

export enum NotificationCategory {
  // Integration events
  IMPORT_COMPLETED = 'import.completed',
  IMPORT_FAILED = 'import.failed',
  IMPORT_REQUIRES_REVIEW = 'import.requires_review',
  SYNC_CONFLICT = 'import.conflict',

  // Extraction events
  EXTRACTION_COMPLETED = 'extraction.completed',
  EXTRACTION_FAILED = 'extraction.failed',
  EXTRACTION_LOW_CONFIDENCE = 'extraction.low_confidence',
  ENTITY_REQUIRES_REVIEW = 'entity.requires_review',

  // Graph events
  OBJECT_CREATED = 'graph.object_created',
  OBJECT_UPDATED = 'graph.object_updated',
  OBJECT_DELETED = 'graph.object_deleted',
  RELATIONSHIP_CREATED = 'graph.relationship_created',

  // Collaboration
  MENTION = 'collaboration.mention',
  COMMENT = 'collaboration.comment',
  ASSIGNED = 'collaboration.assigned',
  REVIEW_REQUEST = 'collaboration.review_request',

  // System
  SYSTEM_ERROR = 'system.error',
  SYSTEM_WARNING = 'system.warning',
  RATE_LIMIT_HIT = 'system.rate_limit',
  MAINTENANCE_SCHEDULED = 'system.maintenance',
}

export type NotificationImportance = 'important' | 'other';
export type NotificationTab =
  | 'all'
  | 'important'
  | 'other'
  | 'snoozed'
  | 'cleared';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  url?: string;
  action?: 'accept' | 'reject'; // For actionable notifications
  style?: 'primary' | 'secondary' | 'warning' | 'danger' | 'success' | 'ghost';
}

export type ActionStatus = 'pending' | 'accepted' | 'rejected' | null;

export interface Notification {
  id: string;
  tenantId: string;
  organizationId?: string;
  projectId?: string;
  userId: string;

  // Classification
  category: NotificationCategory | string;
  importance: NotificationImportance;

  // Content
  title: string;
  message: string;
  details?: Record<string, unknown>;

  // Source tracking
  sourceType?: 'integration' | 'extraction_job' | 'graph_object' | 'user';
  sourceId?: string;

  // Actions (legacy single action)
  actionUrl?: string;
  actionLabel?: string;

  // New fields from migration 0005
  type?: string; // e.g., 'extraction_complete', 'extraction_failed'
  severity?: NotificationSeverity;
  relatedResourceType?: string; // e.g., 'extraction_job', 'document'
  relatedResourceId?: string;
  read?: boolean;
  dismissed?: boolean;
  dismissedAt?: string;
  actions?: NotificationAction[]; // Array of action buttons
  expiresAt?: string;

  // State (legacy)
  readAt?: string;
  clearedAt?: string;
  snoozedUntil?: string;

  // Grouping
  groupKey?: string;

  // Action status for actionable notifications (e.g., merge suggestions)
  actionStatus?: ActionStatus;
  actionStatusAt?: string;
  actionStatusBy?: string;

  createdAt: string;
}

export interface NotificationFilter {
  category?: string;
  unreadOnly?: boolean;
  search?: string;
}

export interface NotificationCounts {
  all: number;
  important: number;
  other: number;
  snoozed: number;
  cleared: number;
}

export interface NotificationStats {
  unread: number;
  dismissed: number;
  total: number;
}

/**
 * Extended notification with linked task data
 * Used when displaying notifications that are linked to tasks
 */
export interface NotificationWithTask extends Notification {
  linkedTask?: {
    id: string;
    type: string;
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
    metadata: Record<string, unknown>;
  };
}
