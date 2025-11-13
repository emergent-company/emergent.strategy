---
description: Run chosen test
mode: agent
---


# Test Execution & Analysis Prompt

## Objective
Run the scripted test targets (npm/Nx), analyze the results, suggest fixes, and document findings in the dev journal.

## Step 1: Run Tests Using Workspace Scripts

Always use the checked-in npm targets so that required environment setup and logging hooks run consistently. Prefer `run_in_terminal` for execution (or Nx MCP utilities when available) instead of ad-hoc commands.

### Admin (Frontend)

```bash
npm --prefix apps/admin run test
npm --prefix apps/admin run test:coverage
npm --prefix apps/admin run e2e
npm --prefix apps/admin run e2e:clickup
npm --prefix apps/admin run e2e:chat
```

> For Playwright runs that rely on token seeding, export `E2E_FORCE_TOKEN=1` before invoking the command.

### Server (Backend)

```bash
npm --prefix apps/server run test
npm --prefix apps/server run test:coverage
npm --prefix apps/server run test:e2e
```

Use headed/debug E2E flows only when triaging failures and note any manual steps performed.

## Step 2: Analyze Test Results

### Check Test Output
Review the test execution output for:
- ✅ **Pass/Fail counts** - How many tests passed vs failed
- ⚠️ **Error messages** - What specifically failed
- 🔍 **Stack traces** - Where the failure occurred
- 📊 **Coverage reports** - Which code paths were tested

### Verify Logs in Case of Errors

**Admin E2E Test Logs:**
- **Test artifacts**: `apps/admin/test-results/`
  - `test-results.json` - Structured test results
  - `html-report/` - Visual HTML report
  - `<test-name>/` - Per-test screenshots, videos, error context

- **E2E run logs**: `logs/e2e-tests/`
  - `e2e-YYYY-MM-DD_HH-MM-SS_<test-name>_stdout.log` - Test output
  - `e2e-YYYY-MM-DD_HH-MM-SS_<test-name>_stderr.log` - Error output
  - `e2e-YYYY-MM-DD_HH-MM-SS_<test-name>_summary.json` - Summary with error delta

- **Error context files**: For each failed test:
  ```
  apps/admin/test-results/<test-slug>/error-context.md
  ```
  Contains: Page URL, console errors, page snapshot, network requests

**Backend Logs:**
- **Application logs**: `logs/app.log` - All log levels (verbose, debug, log, warn, error)
- **Error logs**: `logs/errors.log` - Error and fatal messages only
- **Debug logs**: `logs/debug.log` - Debug/verbose messages (development only)

**Server E2E Logs:**
- Check `apps/server/test/` for test output
- Review `logs/errors.log` for backend errors during test execution

### Analyze Error Context

**For Playwright E2E failures:**
1. Read `test-results/<test-name>/error-context.md` first
2. Check page URL - verify you're on the correct page
3. Review console errors - look for API failures, JavaScript errors
4. Check screenshot - verify UI state
5. Watch video - understand the failure sequence

**For Backend errors:**
1. Check `logs/errors.log` for 500+ errors with full context
2. Review `logs/app.log` for request lifecycle
3. Look for SQL errors, permission issues, missing data

**For Unit test failures:**
1. Read the assertion error message
2. Check expected vs actual values
3. Review stack trace for failing line
4. Verify mock/stub configuration

## Step 3: Suggest Fixes

Based on the error analysis, provide **specific, actionable fixes**:

### Common Error Patterns & Fixes:

**Authentication Errors (401 Unauthorized):**
- ✅ Verify E2E_FORCE_TOKEN=1 is set
- ✅ Check auth token generation in E2E setup
- ✅ Ensure AuthGuard is properly configured
- ✅ Verify JWT secret and expiration

**API Errors (500 Internal Server Error):**
- ✅ Check logs/errors.log for actual error
- ✅ Look for SQL syntax errors
- ✅ Verify database schema matches queries
- ✅ Check for null/undefined handling
- ✅ Verify request parameters

**Test Selector Failures:**
- ✅ Check if element exists in error-context.md snapshot
- ✅ Verify data-testid is static (not dynamic)
- ✅ Use getByRole/getByLabel for better resilience
- ✅ Check if element is hidden or in wrong state

**Database Errors:**
- ✅ Check table/column names (case-sensitive)
- ✅ Verify schema name (kb.*, core.*, public.*)
- ✅ Check RLS policies
- ✅ Verify foreign key constraints

**Timing Issues:**
- ✅ Add proper waitFor conditions
- ✅ Check if using auto-retrying assertions
- ✅ Verify async/await usage
- ✅ Consider adding delays for transient UI states

### Fix Template:

```markdown
## Root Cause
[Clear explanation of what's actually wrong]

## Recommended Fix
[Step-by-step fix instructions]

1. **File**: `path/to/file.ts`
   **Change**: [What to modify]
   **Reason**: [Why this fixes it]

2. **Verification**: [How to verify the fix]
   - Run: [specific test command]
   - Check: [what to verify]

## Alternative Solutions
[If applicable, other approaches]
```

## Step 4: Document in Dev Journal

After completing the test cycle, create or append to the dev journal:

**Location**: `dev-logs/dev-journal.md`

**Entry Format**:
```markdown
### [YYYY-MM-DD HH:MM] - [Test Type] Test Run

**Command**: [Exact command used]

**Results**:
- Total Tests: [X]
- Passed: [X] ([X]%)
- Failed: [X] ([X]%)
- Duration: [X]s

**Failures**: [If any]
- [Test name]: [Brief error description]
- [Test name]: [Brief error description]

**Root Causes Identified**:
1. [Issue 1]: [Description]
2. [Issue 2]: [Description]

**Fixes Applied**:
1. [Fix 1]: [What was changed]
2. [Fix 2]: [What was changed]

**Outcome**: [Success/Partial/Failed]

**Notes**: [Any observations, learnings, or follow-up items]

**Log Files**:
- Stdout: `logs/e2e-tests/...`
- Errors: `logs/errors.log`
- Summary: `logs/e2e-tests/..._summary.json`

---
```

### Example Dev Journal Entry:

```markdown
### [2025-10-08 11:43] - Admin E2E Console Errors Test Run

**Command**: `npm --prefix apps/admin run e2e`

**Results**:
- Total Tests: 21
- Passed: 9 (42.9%)
- Failed: 12 (57.1%)
- Duration: 307.87s

**Failures**:
- All admin pages: 401 Unauthorized errors on notification endpoints

**Root Causes Identified**:
1. Authentication Issue: E2E tests sending invalid/expired access tokens
2. Notification endpoints rejecting requests with 401 instead of 500
3. Backend authentication working correctly, test setup needs fixing

**Fixes Applied**:
1. Fixed FileLogger path to use project root logs directory
2. Verified backend logging system working (app.log, errors.log created)
3. Identified auth token configuration issue in E2E test setup

**Outcome**: Partial - Logging system complete, auth issue identified but not yet fixed

**Notes**: 
- Error changed from 500 to 401, indicating backend is now working correctly
- Comprehensive logging infrastructure complete and working
- Next: Fix E2E test authentication configuration

**Log Files**:
- Stdout: `logs/e2e-tests/e2e-2025-10-08_09-43-05_console-errors.all-pages_stdout.log`
- Errors: `logs/errors.log`
- Summary: `logs/e2e-tests/e2e-2025-10-08_09-43-05_console-errors.all-pages_summary.json`

---
```

## Quick Reference

### Preferred Command Patterns
- `npm --prefix apps/admin run <script>` for frontend unit/E2E targets
- `npm --prefix apps/server run <script>` for backend unit/E2E targets
- `npm run workspace:<target>` for cross-cutting orchestration (deps, status, logs)

### Log File Priority:
1. **First**: `test-results/<test-name>/error-context.md` (Playwright)
2. **Second**: `logs/errors.log` (Backend errors)
3. **Third**: `logs/e2e-tests/*_summary.json` (E2E summary)
4. **Fourth**: `logs/app.log` (Full backend trace)

### Never Do:
- ❌ Bypass the scripted commands with manual binary invocations
- ❌ Start services with ad-hoc shell pipelines
- ❌ Skip checking `error-context.md` files
- ❌ Ignore logging output when diagnosing failures
- ❌ Forget to document test runs in the dev journal

### Always Do:
- ✅ Use the provided npm/Nx scripts for repeatability
- ✅ Read error context files before suggesting fixes
- ✅ Provide specific, actionable remediation steps
- ✅ Document test results in the dev journal
- ✅ Check backend logs for 5xx errors
- ✅ Verify fixes with a follow-up test run

## Success Criteria

A successful test cycle includes:
1. ✅ Tests executed via the documented npm/Nx scripts
2. ✅ All logs reviewed and analyzed
3. ✅ Root causes identified with evidence
4. ✅ Specific fixes suggested or applied
5. ✅ Follow-up test run verifies fixes
6. ✅ Dev journal entry created
7. ✅ No regressions introduced

---

*This prompt ensures consistent, thorough testing practices with proper observability and documentation.*
