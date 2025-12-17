/**
 * Real-time event types for SSE updates
 *
 * These types mirror the backend event types in:
 * apps/server/src/modules/events/events.types.ts
 */

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
 * Entity event payload received via SSE
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
  data?: Record<string, unknown>;
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * SSE connection states
 */
export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/**
 * Connected event payload from SSE
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
 * Heartbeat event payload from SSE
 */
export interface HeartbeatEvent {
  timestamp: string;
  health?: HealthStatus;
}

/**
 * Subscription pattern for filtering events
 * Examples:
 * - 'document:*' - all document events
 * - 'document:abc123' - events for specific document
 * - 'chunk:*' - all chunk events
 * - '*' - all events
 */
export type SubscriptionPattern = string;

/**
 * Callback for entity event handlers
 */
export type EntityEventHandler = (event: EntityEvent) => void;

/**
 * Data updates context value
 */
export interface DataUpdatesContextValue {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Connection ID (if connected) */
  connectionId: string | null;
  /** Subscribe to events matching a pattern */
  subscribe: (
    pattern: SubscriptionPattern,
    handler: EntityEventHandler
  ) => () => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Health status from the latest heartbeat */
  healthData: HealthStatus | null;
  /** Timestamp of the last heartbeat with health data */
  lastHealthUpdate: Date | null;
}
