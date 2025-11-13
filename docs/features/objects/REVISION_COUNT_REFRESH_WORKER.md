# Revision Count Refresh Worker Implementation

**Date:** October 20, 2025  
**Status:** ✅ Complete and Operational

## Summary

Implemented a background worker service to periodically refresh the materialized view containing revision counts for all graph objects. This ensures the `revision_count` field stays current as objects are created, updated, or deleted.

---

## Implementation Details

### 1. Service Creation

**File:** `apps/server/src/modules/graph/revision-count-refresh-worker.service.ts`

Key features:
- Implements NestJS lifecycle hooks (`OnModuleInit`, `OnModuleDestroy`)
- Runs immediately on startup, then periodically every 5 minutes (configurable)
- Calls `kb.refresh_revision_counts()` function to refresh materialized view
- Comprehensive error handling and logging
- Exposes manual trigger method for testing (`triggerRefresh()`)
- Provides statistics method for monitoring (`getStatistics()`)

### 2. Module Registration

**File:** `apps/server/src/modules/graph/graph.module.ts`

Changes:
- Added import for `RevisionCountRefreshWorkerService`
- Added service to providers array
- Worker starts automatically when GraphModule initializes

### 3. Database Function Enhancement

**Issue Discovered:** Permission denied when refreshing materialized view

**Root Cause:** The `kb.refresh_revision_counts()` function was executing with caller permissions, not owner permissions. When the application user called the function, it didn't have permission to refresh the view.

**Solution:** Added `SECURITY DEFINER` to the function:

```sql
CREATE OR REPLACE FUNCTION kb.refresh_revision_counts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER  -- ← Added this
AS $$
DECLARE
    refresh_start TIMESTAMPTZ;
    refresh_end TIMESTAMPTZ;
    refresh_duration INTERVAL;
BEGIN
    refresh_start := clock_timestamp();
    
    REFRESH MATERIALIZED VIEW CONCURRENTLY kb.graph_object_revision_counts;
    
    refresh_end := clock_timestamp();
    refresh_duration := refresh_end - refresh_start;
    
    RAISE NOTICE 'Revision counts refreshed in %', refresh_duration;
    
    RETURN (SELECT COUNT(*)::INTEGER FROM kb.graph_object_revision_counts);
END;
$$;
```

**Effect:** Function now runs with the permissions of the function owner (`spec` user), allowing it to refresh the materialized view regardless of who calls it.

---

## Configuration

**Environment Variable:**
```bash
# How often to refresh revision counts (in milliseconds)
# Default: 300000 (5 minutes)
REVISION_COUNT_REFRESH_INTERVAL_MS=300000

# Examples:
# Every 1 minute: REVISION_COUNT_REFRESH_INTERVAL_MS=60000
# Every 10 minutes: REVISION_COUNT_REFRESH_INTERVAL_MS=600000
# Every 15 minutes: REVISION_COUNT_REFRESH_INTERVAL_MS=900000
```

---

## Verification

### Log Output

**Startup:**
```
[RevisionCountRefreshWorkerService] Revision count refresh worker starting (interval=300000ms)
[RevisionCountRefreshWorkerService] Starting revision count refresh...
[RevisionCountRefreshWorkerService] Revision count refresh complete: 11762 objects tracked (took 86ms)
```

**Periodic Refresh:**
```
[RevisionCountRefreshWorkerService] Starting revision count refresh...
[RevisionCountRefreshWorkerService] Revision count refresh complete: 11762 objects tracked (took 92ms)
```

### Statistics Check

Via service method:
```typescript
const stats = await revisionCountRefreshWorkerService.getStatistics();
// Returns:
// {
//   total_objects: 11762,
//   avg_revisions: 1.05,
//   max_revisions: 36,
//   objects_with_multiple_versions: 585
// }
```

Via SQL:
```sql
SELECT 
  COUNT(*) as total_objects,
  AVG(revision_count) as avg_revisions,
  MAX(revision_count) as max_revisions,
  COUNT(*) FILTER (WHERE revision_count > 1) as objects_with_multiple_versions
FROM kb.graph_object_revision_counts;

-- Result:
-- total_objects: 11762
-- avg_revisions: 1.05
-- max_revisions: 36
-- objects_with_multiple_versions: 585
```

---

## Performance

- **Refresh Duration:** 80-120ms for ~12,000 objects
- **Concurrency:** Uses `REFRESH MATERIALIZED VIEW CONCURRENTLY` to avoid blocking reads
- **Impact:** Minimal - no blocking of read queries during refresh
- **Frequency:** Every 5 minutes by default (adjustable)

---

## Troubleshooting

### Issue: "must be owner of materialized view"

**Symptom:** Error logs showing permission denied when trying to refresh

**Cause:** Function lacks `SECURITY DEFINER` or materialized view has wrong owner

**Solution:**
1. Ensure materialized view is owned by the application user:
   ```sql
   ALTER MATERIALIZED VIEW kb.graph_object_revision_counts OWNER TO spec;
   ```

2. Ensure function has `SECURITY DEFINER`:
   ```sql
   ALTER FUNCTION kb.refresh_revision_counts() SECURITY DEFINER;
   ```

3. Restart server to trigger fresh refresh attempt

### Issue: Refresh taking too long

**Symptom:** Refresh duration > 1 second

**Possible Causes:**
- Large number of objects (>100k)
- Missing indexes on `graph_objects` table
- Concurrent heavy write load

**Solutions:**
- Increase refresh interval to reduce frequency
- Ensure indexes exist on `canonical_id` and `deleted_at`
- Consider partitioning for very large datasets

---

## Testing

### Manual Trigger Test

```typescript
// Via service method (requires access to NestJS app context)
await revisionCountRefreshWorkerService.triggerRefresh();
```

### Verify Fresh Data Test

1. Create a new object version:
   ```bash
   PATCH /api/graph/objects/<object-id>
   { "properties": { "updated": true } }
   ```

2. Wait for next refresh (max 5 minutes)

3. Check revision count:
   ```bash
   GET /api/graph/objects/<object-id>
   # Should show revision_count incremented
   ```

---

## Files Modified

### New Files
- `/Users/mcj/code/spec-server/apps/server/src/modules/graph/revision-count-refresh-worker.service.ts`
- `/Users/mcj/code/spec-server/docs/REVISION_COUNT_REFRESH_WORKER.md` (this file)

### Modified Files
- `apps/server/src/modules/graph/graph.module.ts`:
  * Added `RevisionCountRefreshWorkerService` import
  * Added to providers array

- `apps/server/migrations/0006_revision_tracking.sql`:
  * Added `SECURITY DEFINER` to `kb.refresh_revision_counts()` function

- `docs/TAG_CLEANUP_AND_REVISION_TRACKING.md`:
  * Added section for Feature 3: Revision Count Refresh Worker
  * Updated status to show all three features operational
  * Added configuration and monitoring details

---

## Integration with Existing Features

This worker complements the existing revision tracking features:

1. **Materialized View** (Migration 0006):
   - Pre-computes revision counts for fast lookups
   - This worker keeps it fresh

2. **GraphService.getObject()** (graph.service.ts):
   - Returns revision_count by joining with materialized view
   - This worker ensures the count is current

3. **Tag Cleanup Worker** (tag-cleanup-worker.service.ts):
   - Runs independently on same 5-minute schedule
   - Both workers use similar patterns and logging

---

## Future Enhancements

- [ ] Add admin API endpoint: `POST /api/admin/revision-counts/refresh` (manual trigger)
- [ ] Add admin API endpoint: `GET /api/admin/revision-counts/stats` (get statistics)
- [ ] Add refresh history tracking table (`kb.revision_count_refresh_log`)
- [ ] Add alerting if refresh fails repeatedly (>3 consecutive failures)
- [ ] Add metrics dashboard showing refresh duration trends
- [ ] Consider incremental refresh for very large datasets

---

## Related Documentation

- `docs/TAG_CLEANUP_AND_REVISION_TRACKING.md` - Main feature documentation
- `apps/server/migrations/0006_revision_tracking.sql` - Database schema
- `.github/instructions/self-learning.instructions.md` - AI assistant learning log
- `docs/DATABASE_MIGRATIONS.md` - Migration system guide

---

**Status:** ✅ Deployed and operational since October 20, 2025  
**Next Steps:** Monitor for 24-48 hours, then consider adding admin API endpoints
