# Tests Requiring Org/Project Bootstrap

## Problem
Tests that navigate to `/admin/apps/*` or `/admin/objects` pages require an active organization and project in localStorage. Without these, users are redirected to the organization creation form, causing test failures.

## Root Cause
The `auth.setup.ts` only injects an authentication token but doesn't create an organization or project. Most tests assume these already exist.

## Solution
Use the new `ensureOrgAndProject()` helper in test beforeEach/beforeAll hooks:

```typescript
import { ensureOrgAndProject } from '../helpers/test-user';

test.beforeEach(async ({ page }) => {
    await ensureOrgAndProject(page);
});
```

## Tests Requiring Fix

### High Priority (Confirmed Failing - Navigate to /admin/apps/*)

1. **authenticated.example.spec.ts**
   - Line 11: `navigate(page, '/admin/apps/documents')`
   - Needs: `ensureOrgAndProject()` in beforeEach

2. **chat.lifecycle.spec.ts**
   - Line 73: `navigate(page, '/admin/apps/chat/c/new')`
   - Line 120: `navigate(page, '/admin/apps/chat/c/new')`
   - Needs: `ensureOrgAndProject()` in beforeEach

3. **chat.new-conversation.spec.ts**
   - Line 21: `navigate(page, '/admin/apps/chat/c/new')`
   - Line 61: `navigate(page, '/admin/apps/chat/c/new')`
   - Needs: `ensureOrgAndProject()` in beforeEach

4. **documents.aria.spec.ts**
   - Line 13: `navigate(page, '/admin/apps/documents')`
   - Needs: `ensureOrgAndProject()` in beforeEach

5. **extraction.manual-flow.spec.ts**
   - Line 271: `navigate(page, '/admin/apps/documents')`
   - Line 398: `navigate(page, '/admin/apps/documents')`
   - Line 446: `navigate(page, '/admin/apps/documents')`
   - Needs: `ensureOrgAndProject()` in test.beforeAll (shared across tests)

6. **notifications-auto-extraction.spec.ts**
   - Line 228: `navigate(page, '/admin/apps/documents')`
   - Line 254: `navigate(page, '/admin/apps/documents')`
   - Line 321: `navigate(page, '/admin/apps/documents')`
   - Line 380: `navigate(page, '/admin/apps/documents')`
   - Needs: `ensureOrgAndProject()` in test.beforeAll (shared across tests)

7. **org.active-checkmark.spec.ts**
   - Line 21: `navigate(page, '/admin/apps/documents')`
   - Needs: `ensureOrgAndProject()` BUT careful - this test creates its own orgs
   - Solution: Ensure at least one org/project exists before test logic

8. **org.switch.spec.ts**
   - Line 42: `navigate(page, '/admin/apps/documents')`
   - Needs: `ensureOrgAndProject()` BUT careful - this test creates multiple orgs
   - Solution: Ensure at least one org/project exists before test logic

9. **console-errors.all-pages.spec.ts**
   - Tests multiple /admin/apps/* pages:
     - `/admin/apps/documents`
     - `/admin/apps/chunks`
     - `/admin/apps/chat`
     - `/admin/apps/chat/c/new`
   - Needs: `ensureOrgAndProject()` in test.beforeAll (shared across all page tests)

10. **objects.spec.ts**
    - Navigates to `/admin/objects` (requires project context)
    - All tests failing with Zitadel redirect
    - Needs: `ensureOrgAndProject()` in test.beforeAll

11. **integrations.clickup.spec.ts**
    - Navigates to `/admin/integrations` (requires project context)
    - Needs: `ensureOrgAndProject()` in test.beforeAll

12. **extraction-jobs.monitoring.spec.ts**
    - Navigates to `/admin/extraction-jobs` (requires project context)
    - Needs: `ensureOrgAndProject()` in test.beforeAll

### Special Cases

13. **onboarding.first-login.spec.ts**
   - This test INTENTIONALLY tests the onboarding flow (creating first org/project)
   - Should NOT use `ensureOrgAndProject()`
   - Uses `chromium-clean` project (no storage state)
   - Current failure is actually a fixture issue (cleanUser timeout)

14. **setup-guard.spec.ts** ✅
   - Already creates org/project correctly using `createTestOrg()` and `createTestProject()`
   - No changes needed (this is the reference implementation)

## Implementation Pattern

### For most tests (simple beforeEach):

```typescript
import { test, expect } from '@playwright/test';
import { ensureOrgAndProject } from '../helpers/test-user';

test.beforeEach(async ({ page }) => {
    await ensureOrgAndProject(page);
});

test('my test', async ({ page }) => {
    await navigate(page, '/admin/apps/documents');
    // Test continues...
});
```

### For test suites with shared setup (beforeAll):

```typescript
import { test, expect } from '@playwright/test';
import { ensureOrgAndProject } from '../helpers/test-user';

test.describe('My Test Suite', () => {
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await ensureOrgAndProject(page);
        await context.close();
    });

    test('test 1', async ({ page }) => {
        // Org/project already exist
    });
});
```

### For tests that create their own orgs:

```typescript
import { test, expect } from '@playwright/test';
import { ensureOrgAndProject, createTestOrg } from '../helpers/test-user';

test('switch org test', async ({ page }) => {
    // Ensure at least one org/project exists
    await ensureOrgAndProject(page);
    
    // Now create additional orgs for test logic
    const org2Id = await createTestOrg(page, 'Second Org');
    // ... test switching logic
});
```

## Key Features of ensureOrgAndProject()

1. **Idempotent** - Safe to call multiple times
2. **Reuses existing** - Won't create duplicates if org/project already exist
3. **Fast** - Checks localStorage first, API calls only if needed
4. **Flexible** - Can specify custom org/project names
5. **Logs clearly** - Console output shows whether reusing or creating

## Verification Checklist

After adding `ensureOrgAndProject()` to a test:

- [ ] Test passes when run in isolation
- [ ] Test passes when run as part of full suite
- [ ] No duplicate org/project creation (check console logs)
- [ ] Test still covers intended functionality
- [ ] localStorage has activeOrgId and activeProjectId after beforeEach

## Alternative: Fix auth.setup.ts

Instead of adding `ensureOrgAndProject()` to every test, we could modify `auth.setup.ts` to create a default org/project after login. This would fix all tests at once but has tradeoffs:

**Pros:**
- One change fixes all tests
- Closer to real user experience (users must create org/project)

**Cons:**
- Slower auth setup (API calls every test run)
- Tests that intentionally test onboarding flow would need special handling
- Less explicit about test requirements

**Recommendation:** Use per-test `ensureOrgAndProject()` for now. It's more explicit and gives tests more control.
