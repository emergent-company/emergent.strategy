# Tenant Context Isolation Fix

## Problem Description

When querying projects or documents in the system, requests would intermittently return 0 results even though data existed in the database. This manifested as:

- Project lists returning empty arrays despite projects existing for the organization
- Document queries failing with "Project not found (ingestion)" errors
- Inconsistent behavior that seemed to occur after background job execution

## Root Cause

The issue was caused by **PostgreSQL session variables being connection-scoped instead of transaction-scoped** when using `set_config` with the third parameter as `false`.

### Technical Details

1. **PostgreSQL `set_config` behavior:**

   - `set_config(param, value, false)` → **session-scoped**: Variable persists for the entire connection
   - `set_config(param, value, true)` → **transaction-scoped**: Variable only lasts for the current transaction

2. **Connection Pool Pollution:**

   ```
   Time  Connection   Action                              app.current_organization_id
   ----  ----------   --------------------------------    ---------------------------
   T1    Conn-1       Background job clears context       → '' (empty)
   T2    Conn-1       Returned to pool                    → '' (persists!)
   T3    Conn-1       Web request queries projects        → '' (inherited!)
   T4    Conn-1       Query returns 0 results             → '' (wrong context!)
   ```

3. **The Problematic Flow:**
   - Background jobs (extraction, embedding) clear tenant context: `setTenantContext(null, null)`
   - This sets `app.current_organization_id` to `''` on the database connection
   - With **session-scoped** variables, this empty value persists on the connection
   - When the connection is returned to the pool and reused by a web request
   - The web request inherits the empty tenant context
   - Queries filter by organization ID but get empty string, returning 0 results

## The Fix

Changed all `set_config` calls from **session-scoped (`false`)** to **transaction-scoped (`true`)** in three locations:

### Files Modified

**`apps/server/src/common/database/database.service.ts`**

1. **`applyTenantContext` method** (lines 898-901):

   ```typescript
   // BEFORE
   await this.dataSource.query(
     'SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)',
     [...]
   );

   // AFTER
   await this.dataSource.query(
     'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
     [...]
   );
   ```

2. **`query` method** (lines 494-497):

   ```typescript
   // Changed from false to true
   await queryRunner.query(
     'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
     [...]
   );
   ```

3. **`getClient` method** (lines 634-637):
   ```typescript
   // Changed from false to true
   await queryRunner.query(
     'SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)',
     [...]
   );
   ```

## Why This Works

With **transaction-scoped** variables:

1. Each transaction starts with fresh tenant context (no pollution from previous transactions)
2. Background jobs clearing context only affects their own transaction
3. Web requests setting context only affects their own transaction
4. Connections can be safely reused from the pool without context pollution

```
Time  Connection   Action                              app.current_organization_id
----  ----------   --------------------------------    ---------------------------
T1    Conn-1       Background job (transaction)        → '' (only for this txn)
T2    Conn-1       Transaction ends                    → (cleared)
T3    Conn-1       Web request (new transaction)       → 'org-123' (fresh context)
T4    Conn-1       Query returns correct results       → 'org-123' (isolated!)
```

## Verification

### Unit Tests

Created comprehensive unit tests in `tests/unit/database.tenant-isolation.spec.ts`:

- ✅ Verifies all `set_config` calls use transaction-scoped (`true`)
- ✅ Tests nested tenant context isolation
- ✅ Tests null tenant context handling
- ✅ Regression test ensuring no session-scoped calls remain
- ✅ Simulates connection pool reuse scenarios

Run with:

```bash
nx test server --testFile=tests/unit/database.tenant-isolation.spec.ts
```

### E2E Tests

Created end-to-end tests in `tests/e2e/tenant-context-isolation.e2e-spec.ts`:

- ✅ Tests real database queries with tenant context switching
- ✅ Simulates background job → web request → background job flow
- ✅ Tests concurrent operations with different tenant contexts
- ✅ Tests nested `runWithTenantContext` calls
- ✅ Tests error handling with context restoration

Run with:

```bash
nx test:e2e server --testFile=tests/e2e/tenant-context-isolation.e2e-spec.ts
```

## Impact Assessment

### Positive Impacts

- ✅ Eliminates intermittent "project not found" errors
- ✅ Ensures consistent project and document queries
- ✅ Prevents tenant data leakage across requests
- ✅ No performance impact (transaction-scoped is actually more efficient)

### No Breaking Changes

- ✅ Transparent fix - no API changes required
- ✅ Backward compatible - existing code works without modification
- ✅ No database schema changes needed

## Related Issues

This fix resolves the following symptoms:

1. **Project List Empty**: `/api/projects?orgId=...` returning `[]` despite projects existing
2. **Document Upload Fails**: `{"error":{"code":"project-not-found","message":"Project not found (ingestion)"}}`
3. **Intermittent Failures**: Issues occurring seemingly randomly, especially after background job execution
4. **Document List Empty**: Document queries returning no results for valid projects

## References

- PostgreSQL Documentation: [`set_config`](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET)
- NestJS Connection Pooling: Uses TypeORM which maintains a connection pool
- Related Code:
  - `apps/server/src/modules/extraction-jobs/extraction-job.service.ts` (line 501) - Background job context clearing
  - `apps/server/src/modules/projects/projects.service.ts` (line 46) - Project queries with tenant context

## Deployment Notes

1. Deploy the updated `database.service.ts` file
2. Restart the application to load the changes
3. No database migrations or configuration changes required
4. Monitor logs to confirm `set_config` calls now show `true` instead of `false`
5. Verify project and document queries return expected results

## Monitoring

To verify the fix is working, check server logs for `set_config` queries:

```bash
# Should see only 'true' in set_config calls
tail -f apps/logs/server/out.log | grep set_config
```

Expected output:

```
SELECT set_config($1,$2,true), set_config($3,$4,true), set_config($5,$6,true)
```

❌ If you see `false`, the old code is still running:

```
SELECT set_config($1,$2,false), set_config($3,$4,false), set_config($5,$6,false)
```
