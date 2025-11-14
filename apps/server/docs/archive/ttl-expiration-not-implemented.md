# TTL-Based Auto-Expiration (NOT IMPLEMENTED)

> **⚠️ ARCHIVED SPECIFICATION - FEATURE NOT IMPLEMENTED**
>
> This document describes a planned TTL-based expiration feature (Phase 3 - Task 7c) that was **never implemented**.
>
> - The `expires_at` column was **removed** from the database schema in the InitialSchema migration
> - The utility functions and integration code were **removed** in November 2024
> - This document is preserved for historical reference only
>
> If TTL-based expiration is needed in the future, this spec can serve as a starting point for re-implementation.

## Overview (Planned Feature)

The TTL-based auto-expiration feature was designed to provide automatic temporal validity checks for graph objects based on expiration timestamps. Objects would optionally be assigned an `expires_at` timestamp, after which they would be automatically excluded from all search and traversal operations.

This feature was planned as part of **Phase 3 - Task 7c** and would have enabled:

- **Automatic content lifecycle management** - Objects naturally expire without manual deletion
- **Temporal validity filtering** - Expired content is never returned in queries
- **Graceful degradation** - Objects without expiration never expire
- **Zero-config operation** - No background jobs or configuration required for filtering

## Key Features

### 1. Optional Expiration Timestamps

- Objects can have an optional `expires_at` TIMESTAMPTZ column
- NULL `expires_at` means the object never expires (default behavior)
- Non-NULL `expires_at` causes automatic exclusion after that timestamp

### 2. Automatic Query Filtering

All graph operations automatically exclude expired objects:

- **Graph traversal** (both phased and non-phased)
- **Object search** (searchObjects)
- **Full-text search** (searchObjectsFts)
- **List edges** operations

### 3. Performance-Optimized

Three specialized indexes support efficient expiration queries:

- `idx_graph_objects_expires_at` - Fast expiration lookups
- `idx_graph_objects_active` - Optimized for non-expired objects
- `idx_graph_objects_expired` - Background job support

## Database Schema

### Migration: 004_object_expiration.sql

```sql
-- Add optional expires_at timestamp
ALTER TABLE kb.graph_objects
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_graph_objects_expires_at
  ON kb.graph_objects(expires_at)
  WHERE expires_at IS NOT NULL;

-- Index for active object queries
CREATE INDEX IF NOT EXISTS idx_graph_objects_active
  ON kb.graph_objects(deleted_at, expires_at)
  WHERE deleted_at IS NULL OR expires_at IS NULL;

-- Index for expired object cleanup
CREATE INDEX IF NOT EXISTS idx_graph_objects_expired
  ON kb.graph_objects(expires_at, deleted_at)
  WHERE expires_at IS NOT NULL AND expires_at <= now();
```

### Table Schema

The `kb.graph_objects` table now includes:

```sql
CREATE TABLE kb.graph_objects (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL,
    key TEXT,
    properties JSONB,
    labels TEXT[],
    deleted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,  -- NEW: Optional expiration timestamp
    -- ... other columns ...
);
```

## API Integration

### Expiration Filter Clause

The `buildExpirationFilterClause()` utility generates SQL WHERE clause fragments:

```typescript
import { buildExpirationFilterClause } from './utils/expiration-filter.util';

// Without table alias
const clause = buildExpirationFilterClause();
// Returns: "(expires_at IS NULL OR expires_at > now())"

// With table alias
const clause = buildExpirationFilterClause('o');
// Returns: "(o.expires_at IS NULL OR o.expires_at > now())"
```

### Integration in GraphService

The expiration filter is automatically applied in all query operations:

**1. Graph Traversal (Non-Phased)**

```typescript
// Root node query includes expiration filter
const objQueryParts: string[] = [
  'SELECT id, type, key, labels, deleted_at, branch_id, properties FROM kb.graph_objects o WHERE id=$1',
];
objQueryParts.push('AND ' + buildExpirationFilterClause('o'));
```

**2. Graph Traversal (Phased)**

```typescript
// Both root nodes and discovered nodes check expiration
const objectQueryParts: string[] = [
  'SELECT id, type, key, labels, deleted_at, branch_id, properties FROM kb.graph_objects o WHERE id=$1',
];
objectQueryParts.push('AND ' + buildExpirationFilterClause('o'));
```

**3. Object Search**

```typescript
const outerFilters: string[] = [
  't.deleted_at IS NULL',
  buildExpirationFilterClause('t'),
];
```

**4. Full-Text Search**

```typescript
WHERE h.deleted_at IS NULL
  AND ${buildExpirationFilterClause('h')}
```

## Utility Functions

### buildExpirationFilterClause(tableAlias?)

Generate SQL WHERE clause to exclude expired objects.

```typescript
buildExpirationFilterClause(); // "(expires_at IS NULL OR expires_at > now())"
buildExpirationFilterClause('o'); // "(o.expires_at IS NULL OR o.expires_at > now())"
```

### isExpired(expiresAt)

Check if an object is currently expired.

```typescript
isExpired('2025-01-01T00:00:00Z'); // true if current time > 2025-01-01
isExpired(null); // false - never expires
isExpired(undefined); // false - never expires
```

### getTTL(expiresAt)

Calculate time-to-live in seconds.

```typescript
getTTL('2025-10-02T12:00:00Z'); // Returns seconds until expiration
getTTL(null); // null - never expires
getTTL('2025-01-01T00:00:00Z'); // 0 - already expired
```

### createExpirationTimestamp(ttlSeconds)

Create expiration timestamp from TTL.

```typescript
createExpirationTimestamp(3600); // Returns timestamp 1 hour from now
createExpirationTimestamp(86400); // Returns timestamp 24 hours from now
```

## Usage Examples

### Setting Object Expiration

When creating a graph object, optionally set `expires_at`:

```typescript
// Create object that expires in 7 days
const expiresAt = createExpirationTimestamp(7 * 24 * 60 * 60);

await graphService.createObject({
  type: 'TempDocument',
  key: 'temp-doc-123',
  properties: {
    expires_at: expiresAt,
    // ... other properties
  },
});
```

### Checking Object Expiration

```typescript
// Check if object is expired
const object = await graphService.getObject(id);
const expired = isExpired(object.properties.expires_at);

if (expired) {
  console.log('Object has expired');
}

// Get time until expiration
const ttl = getTTL(object.properties.expires_at);
if (ttl === null) {
  console.log('Object never expires');
} else if (ttl === 0) {
  console.log('Object has expired');
} else {
  console.log(`Object expires in ${ttl} seconds`);
}
```

### Query Behavior

**Before Expiration:**

```typescript
// Traverse from object before it expires
const result = await graphService.traverse({
  root_ids: ['expired-obj-id'],
  max_depth: 2,
});
// Returns: Object and its neighbors
```

**After Expiration:**

```typescript
// Same query after expiration
const result = await graphService.traverse({
  root_ids: ['expired-obj-id'],
  max_depth: 2,
});
// Returns: Empty result - object excluded automatically
```

## Use Cases

### 1. Temporary Data Management

```typescript
// Create session data that expires in 1 hour
const sessionObject = await graphService.createObject({
    type: 'Session',
    key: `session-${userId}`,
    properties: {
        expires_at: createExpirationTimestamp(3600),
        user_id: userId,
        session_data: { ... }
    }
});
```

### 2. Cache Invalidation

```typescript
// Create cached computation that expires in 5 minutes
const cacheObject = await graphService.createObject({
  type: 'CachedResult',
  key: `cache-${queryHash}`,
  properties: {
    expires_at: createExpirationTimestamp(300),
    result: computedValue,
  },
});
```

### 3. Time-Limited Permissions

```typescript
// Grant temporary access that expires in 24 hours
const accessGrant = await graphService.createObject({
  type: 'AccessGrant',
  key: `grant-${userId}-${resourceId}`,
  properties: {
    expires_at: createExpirationTimestamp(86400),
    granted_to: userId,
    resource: resourceId,
  },
});
```

### 4. Draft Content Cleanup

```typescript
// Create draft that expires if not published within 30 days
const draft = await graphService.createObject({
  type: 'Draft',
  key: `draft-${draftId}`,
  properties: {
    expires_at: createExpirationTimestamp(30 * 24 * 60 * 60),
    content: draftContent,
    author: userId,
  },
});
```

## Performance Considerations

### Index Usage

**Active Object Queries (Most Common)**

```sql
-- Uses idx_graph_objects_active
WHERE deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now())
```

**Expiration Lookups**

```sql
-- Uses idx_graph_objects_expires_at
WHERE expires_at IS NOT NULL
```

**Expired Object Cleanup (Background Jobs)**

```sql
-- Uses idx_graph_objects_expired
WHERE expires_at IS NOT NULL
  AND expires_at <= now()
```

### Query Optimization

The expiration filter is lightweight:

- **No table scans** - All queries use indexes
- **Minimal overhead** - Simple timestamp comparison
- **Efficient** - `now()` is a fast PostgreSQL function
- **Cacheable** - PostgreSQL can cache `now()` within transaction

## Background Jobs (Future Enhancement)

While filtering is automatic, you may want to implement background cleanup:

```typescript
// Pseudocode for background job
async function cleanupExpiredObjects() {
  // Find expired objects
  const expired = await db.query(`
        SELECT id 
        FROM kb.graph_objects
        WHERE expires_at IS NOT NULL 
          AND expires_at <= now()
          AND deleted_at IS NULL
        LIMIT 1000
    `);

  // Soft delete expired objects
  for (const obj of expired.rows) {
    await graphService.deleteObject(obj.id);
  }
}

// Run every hour
setInterval(cleanupExpiredObjects, 60 * 60 * 1000);
```

## Testing

### Unit Tests

The `expiration-filter.util.spec.ts` test suite provides comprehensive coverage:

- **buildExpirationFilterClause** - SQL clause generation (3 tests)
- **isExpired** - Expiration checking (6 tests)
- **getTTL** - Time-to-live calculation (7 tests)
- **createExpirationTimestamp** - Timestamp creation (6 tests)
- **Roundtrip consistency** - Integration tests (2 tests)
- **Edge cases** - Boundary conditions (3 tests)

**Total: 26 passing tests**

### Running Tests

```bash
npm --prefix apps/server-nest run test -- expiration-filter.util.spec.ts
```

### Test Coverage

All utility functions have 100% code coverage including:

- Normal operation
- Edge cases (null, undefined, expired, future)
- Boundary conditions (current time, very large TTLs)
- Roundtrip consistency (create → get → check)

## Migration Guide

### Applying the Migration

```bash
# Run the migration SQL script
psql -d your_database -f apps/server-nest/migrations/004_object_expiration.sql
```

### Backward Compatibility

The feature is **100% backward compatible**:

- Existing objects have `expires_at = NULL` (never expire)
- No changes required to existing queries
- All operations continue to work as before
- New objects default to `expires_at = NULL`

### Enabling Expiration for Objects

To enable expiration, simply set the `expires_at` property when creating or updating:

```typescript
// New object with expiration
await graphService.createObject({
  type: 'MyType',
  properties: {
    expires_at: createExpirationTimestamp(3600),
  },
});

// Update existing object to add expiration
await graphService.patchObject(objectId, {
  properties: {
    expires_at: createExpirationTimestamp(86400),
  },
});
```

## Security & Compliance

### Audit Trail Integration

Expiration events can be logged to the audit trail (Task 6a):

```typescript
// Log when object is auto-excluded due to expiration
auditService.log({
  event_type: 'RESOURCE_EXPIRED',
  outcome: 'success',
  resource_type: 'graph_object',
  resource_id: objectId,
  metadata: {
    expires_at: expiresAt,
    current_time: new Date().toISOString(),
  },
});
```

### Data Retention Policies

Use expiration for compliance with data retention policies:

```typescript
// Personal data expires after 90 days per GDPR
const personalData = await graphService.createObject({
  type: 'PersonalData',
  properties: {
    expires_at: createExpirationTimestamp(90 * 24 * 60 * 60),
    user_id: userId,
    data: sensitiveData,
  },
});
```

## Troubleshooting

### Issue: Objects Not Expiring

**Symptom:** Objects with `expires_at` in the past are still returned in queries.

**Cause:** The migration was not applied.

**Solution:**

```bash
psql -d your_database -f apps/server-nest/migrations/004_object_expiration.sql
```

### Issue: Slow Queries with Expiration Filter

**Symptom:** Queries are slower after adding expiration filter.

**Cause:** Indexes were not created.

**Solution:** Verify indexes exist:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'graph_objects'
AND indexname LIKE '%expires%';
```

### Issue: Unexpected Expiration Behavior

**Symptom:** Objects expire earlier or later than expected.

**Cause:** Timezone mismatch or incorrect TTL calculation.

**Solution:** Always use UTC timestamps:

```typescript
// Correct - UTC timestamp
createExpirationTimestamp(3600);

// Incorrect - Local timezone may cause issues
new Date(Date.now() + 3600000).toISOString();
```

## Related Features

- **Task 1f: Temporal Validity Filtering** - Time-range filtering for historical queries
- **Task 6a: Authorization Audit Trail** - Logging expiration events
- **Task 8a: Sensitive Data Redaction** - Combined with expiration for data protection

## Future Enhancements

1. **Background Cleanup Service**

   - Automated soft-deletion of expired objects
   - Configurable cleanup intervals
   - Batch processing for efficiency

2. **Expiration Events**

   - Webhook notifications on expiration
   - Event streaming for real-time monitoring
   - Integration with message queues

3. **Flexible Expiration Policies**

   - Policy-based expiration (e.g., "expire 30 days after last access")
   - Cascading expiration (expire related objects)
   - Expiration extension APIs

4. **Metrics & Monitoring**

   - Dashboard for expiration tracking
   - Alerts for expiration thresholds
   - Analytics on expiration patterns

5. **Soft vs. Hard Expiration**
   - Soft expiration (filter from queries but keep data)
   - Hard expiration (automatic deletion)
   - Configurable grace periods

## Conclusion

TTL-based auto-expiration provides a robust, zero-config solution for automatic content lifecycle management. By integrating seamlessly with all graph operations, it ensures expired content is never exposed to users while maintaining excellent query performance through specialized indexes.

The feature is designed for:

- **Simplicity** - No configuration or background jobs required for filtering
- **Performance** - Optimized indexes for all query patterns
- **Flexibility** - Optional per-object expiration timestamps
- **Reliability** - Automatic filtering in all operations
- **Backward Compatibility** - Zero impact on existing objects and queries
