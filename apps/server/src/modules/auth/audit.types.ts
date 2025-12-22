/**
 * Phase 3: Authorization Audit Trail (6a)
 *
 * Audit event types for tracking authorization and access events
 */

export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN = 'auth.login',
  AUTH_LOGOUT = 'auth.logout',
  AUTH_TOKEN_VALIDATED = 'auth.token_validated',
  AUTH_TOKEN_INVALID = 'auth.token_invalid',

  // Authorization events
  AUTHZ_ALLOWED = 'authz.allowed',
  AUTHZ_DENIED = 'authz.denied',
  AUTHZ_SCOPE_MISSING = 'authz.scope_missing',

  // Resource access events
  RESOURCE_READ = 'resource.read',
  RESOURCE_CREATE = 'resource.create',
  RESOURCE_UPDATE = 'resource.update',
  RESOURCE_DELETE = 'resource.delete',

  // Search and graph operations
  SEARCH_QUERY = 'search.query',
  GRAPH_TRAVERSE = 'graph.traverse',
  GRAPH_SEARCH = 'graph.search',
}

export enum AuditOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure',
  DENIED = 'denied',
}

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  timestamp: Date;
  event_type: AuditEventType;
  outcome: AuditOutcome;
  user_id?: string;
  user_email?: string;
  resource_type?: string;
  resource_id?: string;
  action: string;
  required_scopes?: string[];
  effective_scopes?: string[];
  missing_scopes?: string[];
  ip_address?: string;
  user_agent?: string;
  request_id?: string;
  endpoint: string;
  http_method: string;
  status_code?: number;
  error_code?: string;
  error_message?: string;
  metadata?: Record<string, any>;
  view_as_user_id?: string;
  superadmin_user_id?: string;
}

/**
 * Minimal audit log entry for lightweight tracking
 */
export interface AuditLogEntryMinimal {
  timestamp: Date;
  event_type: AuditEventType;
  outcome: AuditOutcome;
  user_id?: string;
  action: string;
  endpoint: string;
  http_method: string;
}
