# E2E Test Mock Removal - Complete

**Date:** November 18, 2024  
**Status:** ✅ Complete

## Overview

Removed all API mocks from passing E2E tests, ensuring tests use real authentication and real backend APIs. Tests now verify actual user behavior rather than mocked responses.

## Principle

> "If something is not possible to do with a user in a browser, that would not be a test."

All passing E2E tests now:

- Use **real OAuth/OIDC authentication** via `auth.setup.ts` storage state
- Call **real backend APIs** (no `page.route()` mocking)
- Test with **actual data** from the database
- Verify **real user interactions** only

## Test Results

**Before:** 20 passing, 56 skipped, 0 failing  
**After:** 17 passing, 54 skipped, 0 failing

The slight decrease in passing tests is because some tests were removed/simplified when they couldn't work without mocks.

## Files Modified

### 1. `org.active-checkmark.spec.ts` ✅

- **Removed:** Documents API mock (lines 20-31)
- **Now:** Navigates to `/admin/apps/documents` with real backend data
- **Tests:** Active org checkmark in dropdown menu

### 2. `documents.aria.spec.ts` ✅

- **Removed:** Documents API mock
- **Now:** Tests ARIA structure with whatever documents exist in database
- **Tests:** Accessibility snapshot of documents page

### 3. `objects.spec.ts` ✅

- **Removed:** All mocks and tests requiring specific mock data:
  - Type filtering (required specific object types)
  - Bulk selection (required exact counts)
  - Empty/error states (can't guarantee without mocks)
- **Kept:** Tests for basic UI rendering, search interaction, ARIA structure
- **Fixed:** Updated selector to `getByPlaceholder(/search objects/i)` to match actual DOM

### 4. `smoke.spec.ts` ✅

- **Removed:** All `page.route()` mocks that were intercepting API calls
- **Now:** Tests all routes with real backend, accepting whatever data exists
- **Tests:** All routes render without console/page errors

### 5. Previous Files (Already Completed)

- `chat.lifecycle.spec.ts` - Removed fake auth and SSE mocking
- `chat.new-conversation.spec.ts` - Removed fake auth
- `extraction.manual-flow.spec.ts` - Already skipped (requires mocks)
- `integrations.clickup.spec.ts` - Already skipped (requires mocks)
- `onboarding.first-login.spec.ts` - Already skipped (requires mocks)

## Files Still Using Mocks (All Skipped)

All tests requiring extensive mocks have been **properly skipped** with clear comments:

### `onboarding.first-login.spec.ts` (skipped)

- **Why:** Requires org/project creation flow
- **Comment:** "DISABLED: This test requires complex mocking of organization/project creation flow."

### `notifications-auto-extraction.spec.ts` (skipped)

- **Why:** Requires extraction workflow and notifications
- **Uses:** `stubNotificationBackend()`, `seedOrgProject()`

### `integrations.clickup.spec.ts` (skipped)

- **Why:** Requires ClickUp API and workspace structure
- **Uses:** `stubClickUpBackend()`

### `org.switch.spec.ts` (skipped)

- **Why:** Requires multiple orgs in database
- **Comment:** "DISABLED: This test requires mocked orgs/projects that don't exist in the real backend."

### `extraction.manual-flow.spec.ts` (skipped)

- **Why:** Requires extraction jobs and entity tracking
- **Uses:** `stubDocumentsBackend()`, `stubExtractionBackend()`

## Unused Mock Utilities

The following utilities in `apps/admin/tests/e2e/utils/chat.ts` are now only used in skipped tests:

- `ensureDevAuth()` - Was injecting fake tokens
- `stubChatBackend()` - Was mocking chat SSE streaming
- `ensureActiveOrgAndProject()` - Was mocking org/project APIs
- `seedOrgProject()` - Was setting fake org/project in localStorage

These could be removed in future cleanup, but are kept for now in case skipped tests are re-enabled.

## Authentication Approach

All passing tests now use the **real auth flow**:

1. **Setup Phase** (`auth.setup.ts`):

   - Authenticates with real Zitadel OAuth/OIDC
   - Uses credentials from `.env.e2e`
   - Stores tokens in Playwright storage state

2. **Test Execution**:
   - Tests load with authenticated storage state
   - All API calls use real auth tokens
   - No fake tokens or localStorage manipulation

## Testing Philosophy

Tests should only verify **what a real user can do in a browser**:

✅ **Good:** Click button, type text, verify visible elements  
✅ **Good:** Submit form, verify navigation  
✅ **Good:** Check for console errors after page load

❌ **Bad:** Mock API to force specific responses  
❌ **Bad:** Test behavior with fake data that doesn't exist  
❌ **Bad:** Verify exact counts of items (depends on mock data)

## Running Tests

```bash
# Run all E2E tests
nx run admin:e2e

# Run specific test file
nx run admin:e2e --grep="Objects Page"

# Run with UI mode (debugging)
nx run admin:e2e-ui
```

## Prerequisites

Before running E2E tests:

1. Backend server must be running (`nx run server:serve`)
2. Admin app must be running (`nx run admin:serve`)
3. Test user must exist in Zitadel (run `scripts/setup-e2e-tests.mjs` if needed)
4. Database must have at least one org and project for test user

## Next Steps (Optional)

1. **Re-evaluate skipped tests**: Decide if they should be:

   - Deleted (can't work without mocks)
   - Rewritten as minimal smoke tests (just verify page renders)
   - Kept for future when backend features are complete

2. **Clean up mock utilities**: Remove unused functions from `utils/chat.ts` if skipped tests are deleted

3. **Document testing patterns**: Update `AI_AGENT_GUIDE.md` with "no mocks" principle

## Success Metrics

- ✅ All passing tests use real authentication
- ✅ All passing tests use real backend APIs
- ✅ No `page.route()` in any passing test
- ✅ Tests pass consistently with real data
- ✅ Skipped tests are clearly documented

## Related Documentation

- `docs/testing/e2e/E2E_TEST_USER_SETUP.md` - Setting up test user
- `docs/testing/AI_AGENT_GUIDE.md` - Test writing guidelines
- `apps/admin/tests/e2e/auth.setup.ts` - Authentication setup
