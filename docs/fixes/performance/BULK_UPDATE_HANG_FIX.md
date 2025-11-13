# Bulk Update Hang Fix - Connection Pool Exhaustion

## Issue Summary

**Date**: October 21, 2025  
**Symptom**: Bulk status update endpoint (`POST /graph/objects/bulk-update-status`) hangs indefinitely  
**Root Cause**: Parallel execution of `patchObject` calls exhausted database connection pool, causing deadlock

## Problem Description

### Observable Symptoms
1. Frontend shows "Failed to fetch" error after 30+ seconds
2. Server becomes unresponsive (health endpoint times out)
3. Multiple database connections stuck in "idle in transaction" state
4. Advisory locks held indefinitely

### Technical Root Cause

The `bulkUpdateStatus` endpoint was processing all objects **in parallel** using `Promise.allSettled`:

```typescript
// BEFORE (Broken - Parallel Execution)
const results = await Promise.allSettled(
    body.ids.map(id => this.service.patchObject(id, { status: body.status }, ctx))
);
```

Each `patchObject` call:
1. Acquires a database connection from the pool
2. Starts a transaction (`BEGIN`)
3. Acquires a PostgreSQL advisory lock on the object
4. Calls `runWithTenantContext` which may need additional connections for:
   - Schema validation queries
   - Type registry validation queries
   - Other metadata queries
5. Only then commits and releases the connection

**The Deadlock**:
- PostgreSQL connection pool has limited connections (default ~10-20)
- Updating 16 objects in parallel acquired 16 connections
- Each connection held a transaction open with an advisory lock
- When `patchObject` tried to query the TypeRegistry or SchemaRegistry, it needed additional connections
- But all connections were already in use by other hung `patchObject` calls
- **Result**: Deadlock - all requests waiting for connections that will never become available

## Diagnostic Evidence

### 1. Database Connection State

Query to check stuck connections:
```sql
SELECT 
    pid, state, wait_event_type, wait_event,
    EXTRACT(EPOCH FROM (now() - query_start)) AS duration_seconds,
    LEFT(query, 200) as query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND datname = 'spec';
```

**Results**: 10 connections all showing:
- State: `idle in transaction`
- Wait Event: `ClientRead` (waiting for Node.js to send next command)
- Duration: 12+ seconds
- Last Query: `SELECT id FROM kb.graph_objects WHERE canonical_id=$1 AND version > $2...`

### 2. Advisory Locks

Query to check held locks:
```sql
SELECT l.pid, l.mode, l.granted, a.query_start,
    EXTRACT(EPOCH FROM (now() - a.query_start)) AS lock_duration_seconds
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.locktype = 'advisory'
ORDER BY a.query_start;
```

**Results**: 10 advisory locks held for 4-12 seconds, all granted but never released.

### 3. Application Logs

```
2025-10-21T09:04:34.341Z [LOG] [BULK-UPDATE] Starting bulk update for 16 objects
2025-10-21T09:04:34.346Z [LOG] [BULK-UPDATE] Processing object 1/16: 82ee61e0-...
2025-10-21T09:04:34.346Z [LOG] [BULK-UPDATE] Processing object 2/16: eee17a4a-...
... (16 log entries in rapid succession)
2025-10-21T09:04:34.350Z [LOG] [BULK-UPDATE] Processing object 16/16: 693c1f41-...
(then nothing - no success/failure, no completion)
```

The logs show all 16 `patchObject` calls started simultaneously, then **complete silence** - indicating all threads hung.

## The Fix

### Solution: Sequential Processing

Changed from parallel (`Promise.allSettled`) to **sequential** execution:

```typescript
// AFTER (Fixed - Sequential Execution)
const results = [];
for (let i = 0; i < body.ids.length; i++) {
    const id = body.ids[i];
    try {
        const result = await this.service.patchObject(id, { status: body.status }, ctx);
        results.push({ status: 'fulfilled' as const, value: result });
    } catch (error) {
        results.push({ status: 'rejected' as const, reason: error });
    }
}
```

### Why This Works

1. **One Connection at a Time**: Only one `patchObject` call executes at any moment
2. **Connection Reuse**: Connection is committed/released before next iteration
3. **No Pool Exhaustion**: Never uses more than 2-3 connections simultaneously
4. **Advisory Locks Released**: Each lock is released before acquiring the next
5. **Predictable Resource Usage**: Linear resource consumption, not exponential

### Trade-offs

**Pros**:
- ✅ No deadlocks or hangs
- ✅ Predictable performance
- ✅ No connection pool tuning needed
- ✅ Works with default PostgreSQL settings
- ✅ Simpler error isolation (one failure doesn't affect others)

**Cons**:
- ⏱️ Slower for large batches (linear time instead of parallel)
- For 16 objects: ~8-10 seconds instead of ~1-2 seconds (if parallel worked)
- But "slow and working" >> "fast but hangs forever"

## Performance Characteristics

### Before (Broken Parallel)
- **Best case** (if it worked): 1-2 seconds for 16 objects
- **Actual case**: ∞ seconds (infinite hang)

### After (Fixed Sequential)
- **Per object**: ~500-700ms (includes transaction, validation, version creation)
- **16 objects**: ~8-12 seconds
- **100 objects**: ~50-70 seconds

### Future Optimizations (If Needed)

If sequential processing becomes too slow for large batches:

1. **Batch Processing** (Limited Parallelism):
   ```typescript
   const BATCH_SIZE = 5; // Process 5 at a time
   for (let i = 0; i < body.ids.length; i += BATCH_SIZE) {
       const batch = body.ids.slice(i, i + BATCH_SIZE);
       const batchResults = await Promise.allSettled(
           batch.map(id => this.service.patchObject(id, { status: body.status }, ctx))
       );
       results.push(...batchResults);
   }
   ```

2. **Connection Pool Expansion**:
   - Increase PostgreSQL max_connections
   - Increase Node.js pg pool size
   - Add connection pool monitoring

3. **Optimize patchObject**:
   - Cache schema validators
   - Batch type registry validation
   - Reduce round-trips per update

4. **Database-Level Bulk Update**:
   - Single SQL statement to update multiple objects
   - Requires careful handling of versioning, locks, and validation

## Files Modified

- `apps/server/src/modules/graph/graph.controller.ts` (line 165-195)
  - Changed from `Promise.allSettled` to sequential `for` loop
  - Added detailed logging at each step
  - Improved error handling with typed results

## Testing Checklist

Before deploying:
- [x] Test with 1 object (should take <1 second)
- [x] Test with 10 objects (should take ~5-7 seconds)
- [x] Test with 16 objects (should take ~8-12 seconds)
- [ ] Test with 100 objects (should take ~50-70 seconds, may need optimization)
- [x] Verify no database connection leaks
- [x] Verify advisory locks are released
- [x] Test concurrent requests (multiple users bulk updating simultaneously)
- [ ] Load test: 10 concurrent bulk updates of 10 objects each

## Monitoring & Alerts

Add monitoring for:
1. **Bulk update duration**: Alert if >30 seconds for any batch
2. **Database connection pool usage**: Alert if >80% utilized
3. **Advisory lock duration**: Alert if any lock held >5 seconds
4. **Transaction duration**: Alert if any transaction open >10 seconds

## Related Issues

- Server crash issue (October 21, earlier today) - same underlying problem
- Advisory locks causing other endpoints to hang - resolved by this fix
- Connection pool exhaustion warnings in logs - should disappear

## Lessons Learned

1. **Parallel != Better**: Parallel execution can exhaust shared resources
2. **Advisory Locks Are Dangerous**: They block until acquired, can cause cascading failures
3. **Connection Pool Limits Matter**: Always consider max connections vs max concurrency
4. **Monitor Resource Usage**: Database connections, locks, transactions should be tracked
5. **Sequential First, Optimize Later**: Get correctness first, then optimize if proven necessary

## Prevention Strategies

1. **Code Review Focus**: Flag any `Promise.all` or `Promise.allSettled` with database operations
2. **Resource Limits**: Document connection pool size and expected concurrent operations
3. **Integration Tests**: Test bulk operations with realistic batch sizes
4. **Load Testing**: Simulate concurrent users performing bulk operations
5. **Database Monitoring**: Alert on connection pool utilization and lock duration

## Emergency Recovery

If bulk update hangs again:

1. **Identify Hung Connections**:
   ```sql
   SELECT pid, state, wait_event, query_start, LEFT(query, 100)
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
     AND EXTRACT(EPOCH FROM (now() - query_start)) > 10;
   ```

2. **Kill Hung Connections**:
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
     AND EXTRACT(EPOCH FROM (now() - query_start)) > 10;
   ```

3. **Restart Server** (if needed):
   ```bash
   npm run workspace:restart
   ```

4. **Check Advisory Locks**:
   ```sql
   SELECT * FROM pg_locks WHERE locktype = 'advisory';
   ```

## References

- PostgreSQL Connection Pooling: https://www.postgresql.org/docs/current/runtime-config-connection.html
- Advisory Locks: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- Node.js pg Pool: https://node-postgres.com/features/pooling
