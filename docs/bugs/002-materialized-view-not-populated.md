# Bug Report: Materialized View Not Populated

**Status:** Open  
**Severity:** Medium  
**Component:** Database / Background Jobs  
**Discovered:** 2025-11-18  
**Discovered by:** AI Agent  
**Assigned to:** Unassigned

---

## Summary

Materialized view refresh job is attempting to refresh a view that has not been populated, causing errors in background job processing.

---

## Description

The background job system is attempting to refresh a materialized view named `conversation_participants_mv`, but this view appears to not exist or not be properly populated in the database.

**Actual Behavior:**

- Error: "relation 'conversation_participants_mv' does not exist"
- Background job fails when attempting to refresh materialized view
- Job continues to retry, potentially wasting resources

**Expected Behavior:**

- Materialized view should exist before refresh attempts
- Background job should handle missing views gracefully
- Database schema should be fully initialized

**When it occurs:**

- Happens during scheduled background job execution
- Occurs when RefreshMaterializedViewsJob runs

---

## Reproduction Steps

1. Start the server application
2. Wait for background job scheduler to trigger RefreshMaterializedViewsJob
3. Observe error in server logs about missing relation
4. Check database for existence of `conversation_participants_mv`

---

## Logs / Evidence

```
Error refreshing materialized views: relation "conversation_participants_mv" does not exist
```

**Log Location:** `apps/logs/server/out.log`  
**Timestamp:** Multiple recent occurrences (2025-11-18)

---

## Impact

- **User Impact:** May affect conversation participant queries if they rely on this materialized view
- **System Impact:** Background jobs failing; potential performance degradation if queries fall back to non-materialized views
- **Frequency:** Occurs on every scheduled refresh attempt
- **Workaround:** If the materialized view is optional, queries may fall back to direct table access (slower)

---

## Root Cause Analysis

**Suspected Causes:**

1. Database migration to create the materialized view was not run
2. Materialized view was dropped or never created
3. Database initialization scripts incomplete
4. Migration ordering issue causing view creation to be skipped

**Related Files:**

- Background job that refreshes views (likely in `apps/server/src/modules/jobs/`)
- Database migration files (look for materialized view creation)
- Database initialization scripts

**Investigation Needed:**

- Check if migration to create `conversation_participants_mv` exists
- Verify migration has been executed in current database
- Review database schema for materialized views
- Check if view creation is part of bootstrap process

---

## Proposed Solution

**Investigation Steps:**

1. Search codebase for `conversation_participants_mv` creation
2. Check migration history in database
3. Review `RefreshMaterializedViewsJob` implementation
4. Verify database initialization sequence

**Potential Fixes:**

1. Create missing migration to add materialized view
2. Add materialized view creation to database bootstrap
3. Update RefreshMaterializedViewsJob to check for view existence before refresh
4. Add error handling to gracefully skip missing views

**Testing Plan:**

- [ ] Verify migration creates materialized view
- [ ] Run migration on test database
- [ ] Confirm background job succeeds after fix
- [ ] Test that queries using the view work correctly
- [ ] Verify no errors in logs after deployment

---

## Related Issues

- May be related to database schema initialization
- Could affect conversation-related queries and performance

---

## Notes

This may be a deployment/migration issue rather than a code bug. Need to determine if the materialized view is required or if it's a legacy reference that should be removed.

Priority: Medium - System continues to function but with degraded performance and repeated errors.

---

**Last Updated:** 2025-11-18 by AI Agent
