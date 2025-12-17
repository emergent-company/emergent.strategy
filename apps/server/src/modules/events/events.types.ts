/**
 * Entity event types for real-time updates
 */
export type EntityEventType =
  | 'entity.created'
  | 'entity.updated'
  | 'entity.deleted'
  | 'entity.batch';

/**
 * Supported entity types for real-time events
 */
export type EntityType =
  | 'document'
  | 'chunk'
  | 'extraction_job'
  | 'graph_object'
  | 'notification';

/**
 * Entity event payload sent via SSE
 */
export interface EntityEvent {
  /** Event type */
  type: EntityEventType;
  /** Entity type */
  entity: EntityType;
  /** Entity ID (null for batch events) */
  id: string | null;
  /** Entity IDs for batch events */
  ids?: string[];
  /** Project ID (events are always project-scoped) */
  projectId: string;
  /** Partial update payload */
  data?: Record<string, any>;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * SSE connection metadata
 */
export interface SSEConnection {
  /** Unique connection ID */
  connectionId: string;
  /** User ID */
  userId: string;
  /** Project ID */
  projectId: string;
  /** Response object for writing events */
  response: any;
  /** Last heartbeat timestamp */
  lastHeartbeat: Date;
}

/**
 * Connected event payload
 */
export interface ConnectedEvent {
  connectionId: string;
  projectId: string;
}

/**
 * Health status included in heartbeat events
 */
export interface HealthStatus {
  ok: boolean;
  model: string | null;
  db: 'up' | 'down';
  embeddings: 'enabled' | 'disabled';
  rls_policies_ok?: boolean;
  rls_policy_count?: number;
  rls_policy_hash?: string;
}

/**
 * Heartbeat event payload
 */
export interface HeartbeatEvent {
  timestamp: string;
  health?: HealthStatus;
}
