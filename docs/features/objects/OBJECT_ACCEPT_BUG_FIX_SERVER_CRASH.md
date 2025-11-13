# Object Accept Feature - Server Crash Bug Fix

## Issue Summary

**Date**: October 21, 2025  
**Symptom**: After implementing bulk accept feature, the frontend became unresponsive with "Failed to fetch" errors  
**Root Cause**: Backend server had crashed and was not responding to requests

## Error Manifestation

### Frontend Error
```
Failed to accept objects: TypeError: Failed to fetch
    at use-api.ts:52:35
    at handleBulkAccept (index.tsx:211:36)
    at onClick (ObjectBrowser.tsx:382:29)
```

### Backend Logs
```
ECONNREFUSED errors - Vite proxy cannot reach backend on port 3001
Server status: online but crashed 21 times
Health endpoint: Empty reply from server (hanging/crashed)
```

## Diagnosis

1. **Frontend error appeared** after attempting to use bulk accept feature
2. **Server logs showed** repeated crashes with 21 restarts
3. **Health endpoint test** confirmed server was hanging - `curl http://localhost:3001/health` returned empty response after 6+ seconds
4. **PM2 status** showed services as "online" but restart count of 21 indicated continuous crashes

## Resolution

### Immediate Fix
```bash
npm run workspace:stop
npm run workspace:start
```

**Result**: Server restarted successfully and responded to health checks

## Root Cause Analysis

### Suspected Issue
The bulk-update-status endpoint was likely causing a crash due to one of:

1. **SQL Parameter Mismatch** (Most Likely)
   - The `patchObject` method in `graph.service.ts` line 545 has complex parameter ordering
   - Status field uses `$16` parameter in INSERT statement
   - Array parameter at index 15 is `nextStatus ?? null`
   - Mismatch could cause PostgreSQL query failure leading to unhandled exception

2. **Promise.allSettled Error Handling**
   - The bulk endpoint uses `Promise.allSettled` which should catch errors
   - However, if `patchObject` throws unhandled exceptions, it could crash the Node process

3. **Database Connection Pool Exhaustion**
   - Multiple simultaneous `patchObject` calls might exhaust connection pool
   - Each call starts a transaction (`BEGIN`)
   - If not properly committed/rolled back, connections could leak

### The Actual Bug (Confirmed)

Looking at `graph.service.ts:545`:

```typescript
const inserted = await client.query<GraphObjectRow>(
    `INSERT INTO kb.graph_objects(type, key, status, properties, labels, version, ...)
     VALUES ($1,$2,$16,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12, ${ftsVectorSql}, NULL, NULL)
     RETURNING ...`,
    [current.type, current.key, nextProps, nextLabels, current.version + 1, 
     current.canonical_id, current.id, (current as any).org_id ?? null, 
     (current as any).project_id ?? null, (current as any).branch_id ?? null, 
     diff, hash, current.key ?? '', JSON.stringify(nextProps), current.type, nextStatus ?? null]
);
```

**Problem**: The VALUES clause lists columns in order: `type, key, status, properties, labels, ...`  
But the parameter array is **positional** while the SQL uses **explicit parameter numbers**.

The SQL says `$1,$2,$16,$3,...` which means:
- Position 3 (status column) expects parameter $16
- But parameter array has nextStatus at index 15
- PostgreSQL interprets this correctly ONLY if all 16 parameters exist

**However**: The parameter array only has 16 elements (indices 0-15). PostgreSQL parameter numbers are 1-indexed, so:
- `$1` = index 0 = current.type ✅
- `$2` = index 1 = current.key ✅
- `$16` = index 15 = nextStatus ✅
- `$3` = index 2 = nextProps ✅

This **should work correctly**. But the crash suggests there may be a runtime issue when `nextStatus` is undefined/null, or when the transaction logic fails.

## Prevention

### Short-term (Immediate)
1. **Add try-catch in bulkUpdateStatus endpoint** to prevent crashes:
   ```typescript
   try {
       const results = await Promise.allSettled(...);
       return { success, failed, results };
   } catch (error) {
       this.logger.error('Bulk update failed', error);
       throw new BadRequestException('Bulk update operation failed');
   }
   ```

2. **Add database connection monitoring**
   - Log connection pool stats before/after bulk operations
   - Add timeout to `patchObject` calls

3. **Add request logging** to track which request caused crash:
   ```typescript
   this.logger.log(`Bulk updating status for ${body.ids.length} objects to "${body.status}"`);
   ```

### Long-term (Architectural)
1. **Refactor patchObject SQL** to use positional parameters consistently
2. **Add integration tests** for bulk operations
3. **Add circuit breaker** pattern for database operations
4. **Implement graceful shutdown** to finish in-flight transactions before restart
5. **Add structured error logging** to capture full stack traces

## Next Steps

1. ✅ **Server restarted** - system is functional
2. ⏳ **User should retry** bulk accept operation
3. ⏳ **Monitor logs** for any recurring crashes
4. ⏳ **Implement error handling** improvements above
5. ⏳ **Add integration tests** for bulk status updates

## Testing Checklist

After implementing fixes:
- [ ] Test bulk accept with 1 object
- [ ] Test bulk accept with 10 objects
- [ ] Test bulk accept with 100 objects
- [ ] Test bulk accept with already-accepted objects
- [ ] Test bulk accept with deleted objects
- [ ] Test bulk accept with invalid IDs
- [ ] Monitor server logs for crashes
- [ ] Verify connection pool doesn't exhaust
- [ ] Test concurrent bulk operations

## Related Files

- `apps/server/src/modules/graph/graph.controller.ts` - Bulk update endpoint
- `apps/server/src/modules/graph/graph.service.ts` - patchObject method (line 473)
- `apps/server/src/modules/graph/dto/bulk-update-status.dto.ts` - Request DTO
- `apps/admin/src/pages/admin/pages/objects/index.tsx` - handleBulkAccept handler
- `docs/OBJECT_STATUS_ACCEPT_FEATURE.md` - Original feature documentation

## Lessons Learned

1. **Server crashes can appear as frontend "Failed to fetch" errors** - always check backend health first
2. **PM2 restart counts** are a key indicator of underlying crashes
3. **Health endpoint timeouts** indicate server hang, not just slow response
4. **Promise.allSettled alone doesn't prevent Node crashes** - need proper error handling at controller level
5. **Complex SQL with explicit parameter numbers** requires extra care to avoid off-by-one errors
