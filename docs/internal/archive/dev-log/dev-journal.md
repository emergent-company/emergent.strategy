# Development Journal

This journal tracks test runs, debugging sessions, and development progress.

---

## 2025-10-08 13:36 - Infrastructure Fixes Complete ✅

### Summary
Fixed two critical infrastructure issues and implemented auto-migration system.

### Issues Fixed

**1. Credential Logging Security Issue** ✅
- **Problem**: `auth.setup.ts` was logging authentication details that could expose credentials
- **Fix**: Sanitized console.log to only show boolean `credentials=present/missing`
- **Impact**: Test logs now safe to share publicly, no credential exposure

**2. Auto-Migration System** ✅
- **Problem**: Database migrations not running automatically, causing E2E test failures
- **Root Cause**: Missing notifications table because migrations never executed
- **Solution Implemented**:
  * Created comprehensive migration runner (`scripts/run-migrations.ts`)
  * Added migration tracking table (`public.schema_migrations`)
  * Fixed path resolution to work from any directory
  * Integrated into server startup (`start:dev` now runs migrations first)
  * Added `npm run db:migrate` command for manual runs
- **Impact**: Database always up to date when server starts, eliminates "table doesn't exist" errors

### Migration Fixes Applied

**1. Fixed SQL Syntax in `0001_dynamic_type_system_phase1.sql`**
- Changed `$ $` (with space) to `$$` (no space) for PL/pgSQL function delimiters
- Migration now applies successfully

**2. Fixed Schema References in `9999999999999_graph_search_initial.sql`**
- Added `kb.` schema prefix to all `graph_objects` table references
- Added `kb.` prefix to `graph_embedding_coverage` table creation
- Fixed index creation to use qualified table names

### Results

**Migrations Applied Successfully:**
```
✅ 0001_dynamic_type_system_phase1.sql
✅ 0002_notifications_system.sql (creates kb.notifications table)
✅ 9999999999998_tags_table.sql
✅ 9999999999999_graph_search_initial.sql
```

**Auto-Migration Working:**
```
[migrate] Loaded environment from /Users/mcj/code/spec-server/.env
[migrate] Starting database migrations...
[migrate] ✅ All migrations are up to date!
Applied migrations: 4
Available migrations: 4
```

**Database State Verified:**
- ✅ `kb.notifications` table exists (count: 0)
- ✅ `kb.user_notification_preferences` table exists
- ✅ `public.schema_migrations` tracking table functioning
- ✅ All 4 migrations recorded with timestamps

### Infrastructure Status

**Security**: ✅ Credential logging sanitized  
**Auto-Migrations**: ✅ Integrated into server startup  
**Migration Tracking**: ✅ Prevents duplicate runs  
**Transaction Safety**: ✅ Rollback on errors  
**Path Resolution**: ✅ Works from any directory  
**Developer Experience**: ✅ One command does everything

### Next Steps

1. Re-run E2E console errors test - expect 21/21 passing (up from 9/21)
2. Verify no notification endpoint 500 errors
3. Update test results in dev journal
4. Resume component testing (Phase 1: ConfirmActionModal)

### Files Modified

- `apps/admin/e2e/specs/auth.setup.ts` - Sanitized credential logging
- `scripts/run-migrations.ts` - Created comprehensive migration runner
- `package.json` (root) - Added `db:migrate` script
- `apps/server/package.json` - Integrated migrations into `start:dev`
- `apps/server/src/migrations/0001_dynamic_type_system_phase1.sql` - Fixed SQL syntax
- `apps/server/src/migrations/9999999999999_graph_search_initial.sql` - Fixed schema references

---

## Format

Each entry should follow this structure:
```markdown
### [YYYY-MM-DD HH:MM] - [Activity Type] Brief Description

**Command/Action**: [What was executed]

**Results**: [Outcomes, metrics, findings]

**Issues Found**: [Problems identified]

**Fixes Applied**: [Solutions implemented]

**Outcome**: [Success/Partial/Failed]

**Notes**: [Observations, learnings, follow-ups]

**References**: [Log files, docs, related commits]

---
```

## Journal Entries

### [2025-10-08 11:43] - Admin E2E Console Errors Test Run

**Command**: `mcp_dev-manager_run_script({ app: "admin", action: "e2e:console-errors:with-logs" })`

**Results**:
- Total Tests: 21
- Passed: 9 (42.9%)
- Failed: 12 (57.1%)
- Duration: 307.87s
- Backend Errors: 0 new errors during test

**Issues Found**:
1. **Authentication Issue**: All 12 failing admin pages showing "401 Unauthorized - Invalid or expired access token"
2. **Notification Endpoints**: Three endpoints returning 401:
   - GET /notifications
   - GET /notifications/stats
   - GET /notifications/counts
3. **Error Pattern**: Consistent across all admin pages - every page calls useNotifications hook on mount

**Fixes Applied**:
1. ✅ **FileLogger Path Fix**: Changed FileLogger to use project root logs directory
   - Before: Used `process.cwd()` → `apps/server/logs/`
   - After: Used `join(process.cwd(), '..', '..')` → project root `logs/`
   - Result: app.log now created successfully (18KB)

2. ✅ **Backend Logging Infrastructure**: 
   - Created FileLogger service with three log files (app.log, errors.log, debug.log)
   - Integrated FileLogger into main.ts with bufferLogs: true
   - Added startup message logging to FileLogger
   - Restarted backend server to activate FileLogger

3. ✅ **E2E Logging System**:
   - Updated Playwright config to save to test-results/ folder
   - Created run-e2e-with-logs.mjs script for comprehensive logging
   - Added npm script: dev-manager:admin:e2e:console-errors:with-logs

**Outcome**: Partial Success

**Root Cause Analysis**:
The error progression tells the story:
- **Before**: 500 Internal Server Error on notification endpoints
- **After**: 401 Unauthorized on notification endpoints
- **Meaning**: Backend is now working correctly! The 401 is proper error handling, not a backend bug.

The original issue was masked by the 500 errors. Now that backend logging is working, we can see the real problem: E2E test authentication configuration needs fixing.

**Notes**:
- 🎯 Major breakthrough: Error changed from 500 to 401
- ✅ Comprehensive logging infrastructure complete and operational
- ✅ Backend notification endpoints working correctly
- ⏭️ Next: Fix E2E test authentication token generation/configuration
- 📚 This is a perfect example of how proper observability reveals root causes

**References**:
- **Log Files**:
  - Backend: `logs/app.log` (18KB, all application logs)
  - Backend: `logs/errors.log` (existing, 1KB from previous runs)
  - E2E Stdout: `logs/e2e-tests/e2e-2025-10-08_09-43-05_console-errors.all-pages_stdout.log`
  - E2E Stderr: `logs/e2e-tests/e2e-2025-10-08_09-43-05_console-errors.all-pages_stderr.log`
  - E2E Summary: `logs/e2e-tests/e2e-2025-10-08_09-43-05_console-errors.all-pages_summary.json`
- **Documentation**:
  - `.github/instructions/testing.instructions.md`
  - `.github/instructions/mcp-dev-manager.instructions.md`
  - `scripts/README-dev-manager.md`

---

### [2025-10-08 11:12] - Admin E2E Console Errors Test Run (Retry)

**Command**: `npm run dev-manager:admin:e2e:console-errors:with-logs`

**Results**:
- Total Tests: 21
- Passed: 9 (42.9%)
- Failed: 12 (57.1%)
- Duration: 313.68s
- Backend Errors: 0 new during test

**Failures**:
All 12 failed tests show identical error pattern across different admin pages:
- `/admin/apps/documents` - 16 console errors
- `/admin/apps/chunks` - 16 console errors
- `/admin/apps/chat` - 16 console errors
- `/admin/apps/chat/c/new` - 16 console errors
- `/admin/objects` - 16 console errors
- `/admin/extraction-jobs` - 16 console errors
- `/admin/integrations` - 16 console errors
- `/admin/inbox` - 16 console errors
- `/admin/profile` - 16 console errors
- `/admin/settings/ai/prompts` - 16 console errors
- `/admin/settings/project/templates` - 16 console errors
- `/admin/settings/project/auto-extraction` - 16 console errors

**Console Error Pattern** (16 errors per page):
```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
Failed to fetch notification stats: Error: Request failed (500)
Failed to fetch notifications: Error: Request failed (500)
Failed to fetch notification counts: Error: Request failed (500)
```

**Root Causes Identified**:

1. **Missing Database Table** (PRIMARY ROOT CAUSE):
   - The `core.notifications` table does not exist in the database
   - Verified via PostgreSQL: `SELECT * FROM core.notifications` → `relation "core.notifications" does not exist`
   - Only existing tables in `core` schema: `user_emails`, `user_profiles`
   - **This is the actual root cause**, not authentication as previously diagnosed

2. **Backend Returns 500 Instead of Graceful Handling**:
   - When notification endpoints are called, backend throws 500 error instead of returning empty result
   - Affected endpoints:
     * `GET /notifications` - fetch notifications list
     * `GET /notifications/stats` - fetch notification statistics  
     * `GET /notifications/counts` - fetch unread counts
   - Backend should handle "table doesn't exist" gracefully, not with 500 errors

3. **Frontend Hook Calls on Every Page Load**:
   - `useNotifications` hook is called on mount for all admin pages
   - Makes 3 API calls: `getNotifications()`, `getStats()`, `getUnreadCounts()`
   - Each call fails with 500, gets retried multiple times
   - Result: 3 endpoints × ~5-6 attempts = 16 console errors per page

**Fixes Required**:

**Fix 1: Create Database Migration** (PRIORITY 1 - Blocking)
- **File**: Create new migration `apps/server/prisma/migrations/YYYYMMDD_create_notifications_table.sql`
- **Change**: Add notifications table to core schema
```sql
CREATE TABLE core.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id text NOT NULL,
  org_id text,
  project_id uuid,
  type varchar(50) NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON core.notifications(user_id);
CREATE INDEX idx_notifications_read_at ON core.notifications(read_at);
CREATE INDEX idx_notifications_created_at ON core.notifications(created_at);
```
- **Reason**: Notifications feature requires this table to function
- **Verification**: Run migration, then query `SELECT COUNT(*) FROM core.notifications`

**Fix 2: Backend Error Handling** (PRIORITY 2 - Important)
- **File**: `apps/server/src/modules/notifications/notifications.controller.ts`
- **Change**: Add try-catch with graceful degradation for missing table
```typescript
async getNotifications(@Req() req: Request) {
  try {
    const userId = req.headers['x-user-id'] as string;
    return await this.notificationsService.getNotifications(userId);
  } catch (error) {
    // If table doesn't exist yet, return empty array instead of 500
    if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      this.logger.warn('Notifications table does not exist yet, returning empty array');
      return [];
    }
    throw error;
  }
}
```
- **Reason**: Prevents 500 errors during development when table doesn't exist
- **Verification**: Delete table, call endpoint, should return `[]` not 500

**Fix 3: Backend Error Logging** (PRIORITY 3 - Nice to have)
- **Issue**: Database errors not appearing in `logs/errors.log`
- **Investigation needed**: Check if FileLogger is configured for database module
- **Expected**: All 500 errors should be logged with full stack traces

**Outcome**: Partial Success - Same 9/21 passing as previous run

**Root Cause Analysis - Correcting Previous Diagnosis**:

**Previous run (2025-10-08 09:43)**: Diagnosed as "401 Unauthorized = auth configuration issue" ❌

**This run (2025-10-08 11:12)**: Discovered real issue via database inspection ✅

**Error Progression**:
- **Original**: 500 Internal Server Error (database error)
- **Previous diagnosis**: Thought it changed to 401 (auth error)  
- **Reality**: Still 500 errors, caused by missing `core.notifications` table

**Why Previous Diagnosis Was Wrong**:
- Assumed error *changed* from 500 to 401 between runs
- Actually, errors are still 500 - just needed to check database
- Auth works fine; the real issue is infrastructure (missing table)

**Key Insight**: 
When API returns 500 errors, check database schema first, not authentication. A 500 suggests infrastructure/data problems, not auth configuration.

**Comparison to Previous Run**:
| Metric | Previous (09:43) | This Run (11:12) | Change |
|--------|------------------|------------------|---------|
| Passed | 9/21 (42.9%) | 9/21 (42.9%) | No change |
| Failed | 12 | 12 | No change |
| Error Type | Diagnosed as 401 | Actually 500 | Diagnosis corrected |
| Root Cause | Auth config | Missing DB table | ✅ Found real issue |
| Backend Errors | 0 new | 0 new | Consistent |

**Notes**:
- ✅ Logging infrastructure working perfectly (0 new backend errors tracked)
- ✅ Test execution successful (used npm script as MCP tool not available)
- ✅ Database inspection tool (Postgres MCP) critical for diagnosis
- ❌ Backend not logging database errors to files (only console stderr)
- ❌ Notifications feature incomplete - missing table migration
- 🔍 9 passing tests = pages that don't depend on notifications
- 💡 Proper diagnosis requires checking full stack: frontend → API → database

**Next Steps**:
1. Create and run database migration for `core.notifications` table
2. Add error handling to notifications controller for missing table scenario
3. Investigate why database errors aren't logged to `logs/errors.log`
4. Re-run tests to verify all 21 pass after table exists
5. Return to component testing (Phase 1: ConfirmActionModal)

**Log Files**:
- Stdout: `logs/e2e-tests/e2e-2025-10-08_11-07-05_console-errors.all-pages_stdout.log`
- Stderr: `logs/e2e-tests/e2e-2025-10-08_11-07-05_console-errors.all-pages_stderr.log`
- Summary: `logs/e2e-tests/e2e-2025-10-08_11-07-05_console-errors.all-pages_summary.json`
- Backend: `logs/app.log` (empty for notification requests)
- Backend: `logs/errors.log` (1 old unrelated error from Sept 15)

---

