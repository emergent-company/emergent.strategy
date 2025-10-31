# ClickUp Integration E2E Testing - Status Report

**Date:** October 6, 2025  
**Status:** IN PROGRESS - Partially Complete  
**Overall Progress:** ~60% Complete

## Executive Summary

The ClickUp integration E2E testing work has made significant progress but is currently blocked by notification API mocking issues. The core functionality (OrgAndProjectGate bypass, modal detection) has been fixed, but tests are failing due to console errors from unmocked notification endpoints.

### Quick Stats
- **Tests Written:** 8 complete E2E test scenarios
- **Tests Passing:** 1/8 (12.5%)
- **Tests Failing:** 1/8 (notification errors)
- **Tests Interrupted:** 6/8 (cascading failures from modal issue)
- **Storybook Stories:** 6/6 files, 35+ stories ✅ COMPLETE
- **Build Status:** ✅ Passing (0 TypeScript errors)

---

## Test File Location

```
/Users/mcj/code/spec-server/apps/admin/e2e/specs/integrations.clickup.spec.ts
```

**File Size:** 672 lines  
**Test Structure:**
- Gallery Tests: 1 test (display integration card)
- Configuration Tests: 1 test (configure modal workflow)
- Sync Modal Tests: 5 tests (workspace tree, list selection, wizard flow)
- Error Handling Tests: 1 test (validation errors)

---

## What's Been Completed ✅

### 1. OrgAndProjectGate Fix (RESOLVED)
**Problem:** Tests were failing because `seedOrgProject()` used `page.evaluate()` which sets localStorage AFTER page load, causing the gate to block rendering.

**Solution:** Replaced `seedOrgProject()` with `ensureActiveOrgAndProject()` which uses `page.addInitScript()` to inject config BEFORE page loads.

**Impact:** Integration page now renders correctly, cards are visible.

### 2. Modal Detection Fix (RESOLVED)
**Problem:** Tests were looking for `.modal.modal-open` class but the ConfigureIntegrationModal uses native `<dialog>` element.

**Solution:** Changed selectors from `.modal.modal-open` to `page.getByRole('dialog')`.

**Changes Made:**
```typescript
// OLD (wrong):
const modal = page.locator('.modal.modal-open');

// NEW (correct):
const modal = page.getByRole('dialog');
```

**Impact:** Modal opening/closing detection now works correctly.

### 3. Button Text Fix (RESOLVED)
**Problem:** Configuration test was looking for "Save" button but modal uses "Connect" button.

**Solution:** Updated button selector to use `.last()` for disambiguation and correct button text.

```typescript
// Configuration test now uses:
await page.getByRole('button', { name: /connect/i }).last().click();
```

### 4. Storybook Stories (COMPLETE)
All 6 integration components have comprehensive Storybook stories:
- IntegrationCard.stories.tsx (10 stories)
- ConfigureIntegrationModal.stories.tsx (7 stories)
- WorkspaceTree.stories.tsx (10 stories)
- ImportConfigForm.stories.tsx (8 stories)
- ImportProgress.stories.tsx (2 stories)
- ClickUpSyncModal.stories.tsx (9 stories)

**Status:** ✅ All passing, 0 TypeScript errors, organization fixed to Pages/Integrations/*

---

## Current Blocking Issue ⚠️

### Notification API Mocking Issue

**Problem:** The admin layout/navbar makes notification API calls on page load, causing 401 errors that fail the `expectNoRuntimeErrors()` assertion.

**Error Pattern:**
```
Failed to load resource: the server responded with a status of 401 (Unauthorized)
Failed to fetch notification stats: Error: Invalid or expired access token
Failed to fetch notification counts: Error: Invalid or expired access token
```

**Current Mock Attempt:**
```typescript
// In stubClickUpBackend():
await page.route('**/notifications**', async (route) => {
    const url = route.request().url();
    if (url.includes('/stats')) {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ unread: 0, total: 0 })
        });
    } else if (url.includes('/counts')) {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ unread: 0 })
        });
    } else {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [] })
        });
    }
});
```

**Why It's Not Working:**
The route pattern `**/notifications**` is not matching the actual notification endpoint URLs. The requests are still reaching the backend and getting 401 responses.

**Affected Tests:**
- Gallery test fails on "No console or page errors" step
- All subsequent tests interrupted due to cascading failures

---

## Test Results Summary

### Last Test Run
```bash
E2E_FORCE_TOKEN=1 npx playwright test \
  "apps/admin/e2e/specs/integrations.clickup.spec.ts" \
  --config=apps/admin/e2e/playwright.config.ts \
  --project=chromium --workers=1
```

**Results:**
- ✅ 1 passed: ClickUpSyncModal test passed (confirms fixes work)
- ❌ 1 failed: Gallery test (notification errors)
- ⚠️ 1 interrupted: Configuration test (timeout on modal field)
- ⏭️ 5 did not run: Interrupted due to worker failure

### Test Details

#### Test 1: Gallery - Display ClickUp Card
**Status:** ❌ FAILING  
**Issue:** Console errors from notification API 401s  
**What Works:** Card displays correctly, all UI elements visible  
**What Fails:** `expectNoRuntimeErrors()` assertion  

#### Test 2: Configuration - Configure Modal
**Status:** ⚠️ INTERRUPTED  
**Issue:** Timeout waiting for "api token" label (90s timeout)  
**Likely Cause:** Modal opens but label selector not matching actual form field  
**Screenshot:** Modal is visible with form fields in error-context.md  

#### Tests 3-8: Sync Modal Tests
**Status:** ⏭️ DID NOT RUN  
**Reason:** Test runner stopped after configuration test timeout

---

## Next Steps to Resume

### Immediate Priority (30-60 minutes)

#### 1. Fix Notification Mocking (CRITICAL)
**Approach A: Use Correct Route Pattern**
```typescript
// Check actual notification endpoint URLs from network tab
// Then use specific patterns like:
await page.route('**/api/v1/orgs/*/projects/*/notifications**', ...);
// OR
await page.route(/\/notifications/, ...);
```

**Approach B: Check Existing Chat Test Patterns**
Look at `apps/admin/e2e/utils/chat.ts` - the `stubChatBackend()` function might already handle notifications correctly.

**Approach C: Bypass Notification Errors in Tests**
```typescript
// Option: Filter out notification errors in expectNoRuntimeErrors
// Only for these specific tests, not ideal but unblocks progress
```

#### 2. Fix Configuration Modal Form Labels
**Issue:** `getByLabel(/api token/i)` not finding the field

**Investigation Needed:**
```typescript
// Check error-context.md - fields are visible as:
// - textbox "Enter api token" [ref=e125]
// - textbox "Enter workspace id" [ref=e130]

// Try alternative selectors:
await page.getByPlaceholder(/enter api token/i).fill('...');
// OR
await page.getByRole('textbox', { name: /api token/i }).fill('...');
```

#### 3. Run Tests Individually
Test each scenario in isolation to avoid cascading failures:
```bash
# Test 1
E2E_FORCE_TOKEN=1 npx playwright test -g "displays ClickUp integration card"

# Test 2
E2E_FORCE_TOKEN=1 npx playwright test -g "opens configuration modal"

# etc.
```

---

## Remaining Work Estimate

### E2E Tests (40-60 minutes)
- [ ] Fix notification mocking (15-20 min)
- [ ] Fix modal form field selectors (10-15 min)
- [ ] Run all 8 tests to completion (10-15 min)
- [ ] Debug any remaining failures (10-20 min)
- [ ] Remove debug code, clean up (5 min)

### Unit Tests (NOT STARTED - 4-6 hours)
- [ ] IntegrationCard component tests
- [ ] ConfigureIntegrationModal tests
- [ ] WorkspaceTree component tests
- [ ] ImportConfigForm tests
- [ ] ImportProgress tests
- [ ] ClickUpSyncModal tests
- [ ] IntegrationsClient API tests
- [ ] ClickUp service tests

Estimated: 6-8 test files, ~500-800 lines total

### Documentation (NOT STARTED - 6-8 hours)
- [ ] OpenAPI/Swagger updates
  - Document GET /api/v1/integrations/clickup/structure
  - Document enhanced POST /api/v1/integrations/clickup/sync
  - Add request/response schemas
  
- [ ] User-facing docs
  - README section for ClickUp integration
  - Setup guide with screenshots
  - Configuration guide
  - Troubleshooting section

Estimated: ~1,900 lines across multiple docs

---

## Key Technical Insights

### 1. Config Loading Timing Issue
**Learning:** `page.evaluate()` runs AFTER page load, but React components need config during initial render. Use `page.addInitScript()` for config that must be available before React initializes.

### 2. Native Dialog Elements
**Learning:** DaisyUI modal components can use either:
- CSS-based: `.modal.modal-open` classes
- Native HTML: `<dialog>` element with `open` attribute

Always check actual implementation before writing selectors.

### 3. Route Mocking Patterns
**Learning:** Playwright route patterns must match the EXACT URL structure. Wildcards like `**/notifications**` may not work as expected. Consider using RegExp patterns for more control:
```typescript
await page.route(/\/api\/v1\/.*\/notifications/, ...);
```

### 4. Modal Form Field Selectors
**Learning:** Form fields can have multiple selector strategies:
- `getByLabel()` - looks for associated `<label>` element
- `getByPlaceholder()` - uses placeholder text
- `getByRole('textbox')` - uses ARIA role

Check error-context.md to see actual DOM structure.

---

## Code Changes Made

### Files Modified

1. **apps/admin/e2e/specs/integrations.clickup.spec.ts**
   - Replaced `seedOrgProject()` with `ensureActiveOrgAndProject()` (all 8 tests)
   - Updated import statement
   - Added notification API mocking in `stubClickUpBackend()`
   - Changed modal selectors from `.modal.modal-open` to `getByRole('dialog')`
   - Updated button selectors (Connect vs Save)
   - Removed debug console.log statements

**Changes:** ~50 lines modified across 670-line file

---

## Test Infrastructure

### Helper Functions

#### `stubClickUpBackend(page: Page)` (Lines 23-257)
Mocks all ClickUp integration API endpoints:
- Notification endpoints (IN PROGRESS - not working yet)
- Organization endpoints
- Project endpoints
- Available integrations list
- Configured integrations list (with state tracking)
- Single integration details
- ClickUp workspace structure
- ClickUp sync trigger

**State Management:**
```typescript
let integrationConfigured = false;
let integrationEnabled = true;
```

#### `configureIntegration(page: Page)` (Lines 289-310)
Reusable helper to configure ClickUp integration:
1. Find ClickUp card
2. Click Connect button
3. Wait for modal
4. Fill API token and workspace ID
5. Click Connect
6. Wait for modal to close

#### `ensureActiveOrgAndProject(page: Page)` (From chat.ts)
Sets up org/project context BEFORE page loads:
- Uses `page.addInitScript()` for timing
- Sets localStorage keys: `__NEXUS_CONFIG_v3.0__`, `__nexus_config_v1__`
- Mocks org and project API endpoints
- Default IDs: org=22222222..., project=33333333...

---

## Debug Artifacts

### Test Results Location
```
/Users/mcj/code/spec-server/apps/admin/test-results/
```

Each failed test generates:
- `error-context.md` - Page snapshot and console errors
- `test-failed-*.png` - Screenshot at failure point
- `video.webm` - Video recording of test run

### Useful Debug Commands
```bash
# Run single test with UI
npx playwright test -g "displays ClickUp" --ui

# Run with headed browser (slow-mo)
npx playwright test -g "displays ClickUp" --headed

# Check last test results
cat apps/admin/test-results/*/error-context.md

# View test HTML report
npx playwright show-report
```

---

## Recommended Approach to Resume

### Session Plan (45-60 minutes)

1. **Investigate Notification Mocking (15 min)**
   - Check browser network tab to see actual notification URLs
   - Review chat.ts stubChatBackend() for reference
   - Try alternative route patterns
   - Consider checking if notifications can be disabled for tests

2. **Fix Form Field Selectors (10 min)**
   - Check error-context.md for actual field structure
   - Update selectors to use placeholder or role
   - Test configuration modal workflow in isolation

3. **Run Full Test Suite (15 min)**
   - Execute all 8 tests with fixes
   - Document any new failures
   - Capture screenshots/videos for debugging

4. **Address Remaining Issues (15 min)**
   - Fix any newly discovered problems
   - Ensure all 8 tests pass
   - Clean up debug code

5. **Final Validation (5 min)**
   - Run tests 2-3 times to ensure stability
   - Verify no console errors
   - Update this status document

---

## Questions for Next Session

1. **Notification Endpoints:** What is the actual URL pattern for notification APIs? Check:
   - `apps/admin/src/services/notification.service.ts`
   - `apps/admin/src/hooks/useNotifications.ts`
   - Browser network tab during test run

2. **Form Labels:** Why is `getByLabel(/api token/i)` not finding the field? The field is visible in snapshots. Is the label element missing the `for` attribute?

3. **Alternative Testing Strategy:** Should we:
   - Mock all layout/navbar dependencies globally?
   - Create a test-specific layout that doesn't load notifications?
   - Filter notification errors from the assertion?

---

## Related Documentation

- **Storybook Stories:** All 6 component story files in `apps/admin/src/pages/admin/pages/integrations/`
- **Test Utilities:** `apps/admin/e2e/utils/chat.ts` (ensureActiveOrgAndProject, seedOrgProject)
- **Test Fixtures:** `apps/admin/e2e/fixtures/app.ts` (consoleErrors, pageErrors tracking)
- **Assertions:** `apps/admin/e2e/utils/assertions.ts` (expectNoRuntimeErrors)

---

## Success Criteria

E2E tests will be considered complete when:

- [ ] All 8 tests pass consistently (3+ runs)
- [ ] No console errors (401s, fetch failures)
- [ ] No page errors (runtime exceptions)
- [ ] Tests complete in < 2 minutes total
- [ ] Test code is clean (no debug logs, good comments)
- [ ] Tests follow Playwright best practices (role selectors, auto-retry assertions)

---

## Final Notes

The core E2E testing work is well-structured and ~60% complete. The remaining issues are **solvable tactical problems** (API mocking, selector specificity) rather than fundamental architectural issues. 

The fixes for OrgAndProjectGate and modal detection prove that the test infrastructure works correctly. Once the notification mocking is resolved, the remaining tests should pass with minimal additional work.

**Estimated time to completion:** 40-60 minutes of focused debugging and testing.

---

**Document Created:** October 6, 2025  
**Last Updated:** October 6, 2025  
**Next Review:** When resuming E2E testing work
