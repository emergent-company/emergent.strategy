# Authorization Audit Trail (Phase 3 - Task 6a)

## Overview
Comprehensive audit logging system for tracking all authorization and access events across the API. Provides compliance-ready audit trail with detailed information about who accessed what resources, when, and with what permissions.

## Features

### 1. Audit Event Types
- **Authentication**: Token validation, login/logout events
- **Authorization**: Scope checks (allowed/denied), permission evaluations
- **Resource Access**: Create, read, update, delete operations
- **Search & Graph**: Query operations with metadata

### 2. Audit Log Fields
Each audit entry captures:
- **Timestamp**: When the event occurred
- **Event Type**: Category of event (auth, authz, resource, search, graph)
- **Outcome**: success, failure, or denied
- **User Identity**: user_id, user_email
- **Resource**: resource_type, resource_id
- **Action**: HTTP method and endpoint
- **Scopes**: required, effective, and missing scopes
- **Request Context**: IP address, user agent, request ID
- **Metadata**: Custom data (search queries, graph parameters, etc.)

### 3. Storage
- **Database**: PostgreSQL table `kb.audit_log` with JSONB for flexible metadata
- **Indexes**: Optimized for common queries (user, time range, event type)
- **Retention**: Configurable (default: retain all logs)

### 4. Integration Points

#### ScopesGuard
Automatically logs:
- ✅ Successful authorization (scopes granted)
- ❌ Authorization denial (missing scopes)

#### AuditInterceptor
Logs all API requests:
- Resource access (GET, POST, PUT, DELETE)
- Request/response metadata
- Error details for failures

## Configuration

### Environment Variables

```bash
# Enable/disable database logging (default: enabled)
AUDIT_DATABASE_LOGGING=true

# Enable/disable console logging (default: disabled)
AUDIT_CONSOLE_LOGGING=false

# Enable/disable audit interceptor (default: enabled)
AUDIT_INTERCEPTOR_ENABLED=true
```

## Usage

### Query Audit Logs

```typescript
// Get audit logs for a specific user
const logs = await auditService.queryLogs({
  userId: 'user-123',
  limit: 50,
  offset: 0,
});

// Get audit logs for date range
const logs = await auditService.queryLogs({
  startDate: new Date('2025-10-01'),
  endDate: new Date('2025-10-31'),
  outcome: AuditOutcome.DENIED, // Only show denials
  limit: 100,
});

// Get all authorization denials
const denials = await auditService.queryLogs({
  eventType: AuditEventType.AUTHZ_DENIED,
  limit: 200,
});
```

### Manual Logging

```typescript
// Log custom resource access
await auditService.logResourceAccess({
  eventType: AuditEventType.RESOURCE_UPDATE,
  userId: user.sub,
  userEmail: user.email,
  resourceType: 'document',
  resourceId: 'doc-456',
  action: 'PATCH /documents/doc-456',
  endpoint: '/documents/:id',
  httpMethod: 'PATCH',
  outcome: AuditOutcome.SUCCESS,
  metadata: {
    fields_updated: ['title', 'content'],
  },
});
```

## Database Schema

```sql
CREATE TABLE kb.audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    user_id TEXT,
    user_email TEXT,
    resource_type TEXT,
    resource_id TEXT,
    action TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    http_method TEXT NOT NULL,
    status_code INTEGER,
    error_code TEXT,
    error_message TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Key Indexes
- `idx_audit_log_timestamp`: Fast time-based queries
- `idx_audit_log_user_id`: User-specific audit trails
- `idx_audit_log_event_type`: Filter by event category
- `idx_audit_log_compliance`: Composite index for compliance queries
- `idx_audit_log_details`: GIN index for JSONB querying

## Compliance Features

### 1. Who, What, When
Every audit entry captures:
- **Who**: User ID and email
- **What**: Action performed on which resource
- **When**: Precise timestamp (with timezone)

### 2. Authorization Tracking
- Required scopes for each endpoint
- Effective scopes of the user
- Missing scopes when access denied

### 3. Tamper-Evident
- Append-only log structure
- No DELETE or UPDATE operations on audit table
- Timestamp immutability

### 4. Query Capabilities
- User activity reports
- Authorization denial analysis
- Resource access history
- Time-range compliance reports

## Performance Considerations

### 1. Asynchronous Logging
- Audit logging never blocks API requests
- Errors in audit system don't affect application
- Fire-and-forget pattern with error handling

### 2. Database Optimization
- Indexes for common query patterns
- JSONB for flexible metadata storage
- Partitioning recommended for high-volume (future)

### 3. Minimal Overhead
- Lightweight data collection
- Selective field inclusion
- Configurable enable/disable per environment

## Security

### 1. Data Protection
- IP addresses anonymized (optional)
- Sensitive data excluded from metadata
- Access control for audit log queries

### 2. Retention Policy
- Configurable retention period
- Automatic archival (future)
- Secure deletion procedures

## Example Audit Entries

### Successful Authorization
```json
{
  "timestamp": "2025-10-01T14:30:00Z",
  "event_type": "authz.allowed",
  "outcome": "success",
  "user_id": "user-123",
  "user_email": "alice@example.com",
  "action": "GET /search",
  "endpoint": "/search",
  "http_method": "GET",
  "required_scopes": ["documents:read"],
  "effective_scopes": ["documents:read", "documents:write"],
  "ip_address": "192.168.1.100",
  "request_id": "req-abc-123"
}
```

### Authorization Denial
```json
{
  "timestamp": "2025-10-01T14:35:00Z",
  "event_type": "authz.denied",
  "outcome": "denied",
  "user_id": "user-456",
  "user_email": "bob@example.com",
  "action": "DELETE /documents/doc-789",
  "endpoint": "/documents/:id",
  "http_method": "DELETE",
  "required_scopes": ["documents:delete"],
  "effective_scopes": ["documents:read"],
  "missing_scopes": ["documents:delete"],
  "status_code": 403,
  "error_code": "forbidden"
}
```

### Resource Access
```json
{
  "timestamp": "2025-10-01T14:40:00Z",
  "event_type": "search.query",
  "outcome": "success",
  "user_id": "user-789",
  "user_email": "charlie@example.com",
  "resource_type": "search",
  "action": "GET /search",
  "endpoint": "/search",
  "http_method": "GET",
  "metadata": {
    "query": "machine learning",
    "mode": "hybrid",
    "result_count": 42,
    "query_time_ms": 125.3
  }
}
```

## Migration

Run the migration to create the audit_log table:

```bash
psql -U postgres -d spec_db -f migrations/003_audit_log.sql
```

## Testing

Comprehensive test coverage:
- ✅ Audit service: 13 unit tests
- ✅ Database persistence
- ✅ Error handling (never throws)
- ✅ Query functionality
- ✅ Configuration options

## Future Enhancements

1. **Real-time Monitoring**: WebSocket or SSE for live audit feed
2. **Anomaly Detection**: ML-based suspicious activity detection
3. **Aggregated Reports**: Pre-computed compliance reports
4. **Audit Log Viewer UI**: Admin interface for browsing logs
5. **Export Capabilities**: CSV/JSON export for external analysis
6. **Retention Management**: Automatic archival and deletion
7. **Advanced Queries**: Full-text search on audit metadata
