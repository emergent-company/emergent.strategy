# ClickUp Integration E2E Tests

**Created:** October 5, 2025  
**Status:** ✅ Tests Created, Ready for Execution  
**Location:** `apps/admin/e2e/specs/integrations.clickup.spec.ts`

## Overview

This document describes the comprehensive end-to-end test suite for the ClickUp integration feature. The tests cover the complete user workflow from viewing available integrations to completing a selective sync.

## Test File

**File:** `apps/admin/e2e/specs/integrations.clickup.spec.ts`  
**Lines:** ~600  
**Test Groups:** 4  
**Total Tests:** 8

## Test Structure

### Test Group 1: ClickUp Integration - Gallery

Tests the display of ClickUp integration in the integrations gallery page.

#### Test: "displays ClickUp integration card in gallery"
- **Steps:**
  1. Seed org/project config
  2. Stub backend APIs
  3. Navigate to `/admin/integrations`
  4. Verify ClickUp card displays
  5. Verify capabilities badges show
  6. Check for console/page errors

### Test Group 2: ClickUp Integration - Configuration

Tests the configuration modal flow for setting up ClickUp API credentials.

#### Test: "opens configuration modal and saves settings"
- **Steps:**
  1. Seed org/project config
  2. Stub backend APIs
  3. Navigate to integrations page
  4. Click "Connect" button
  5. Verify modal opens
  6. Fill in API token and workspace ID
  7. Save configuration
  8. Verify modal closes
  9. Check for console/page errors

### Test Group 3: ClickUp Integration - Sync Modal

Tests the complete sync workflow including workspace structure loading, list selection, configuration, and sync triggering.

#### Test: "opens sync modal and loads workspace structure"
- **Steps:**
  1. Mock configured integration
  2. Navigate to integrations page
  3. Click "Sync Now" button
  4. Verify sync modal opens
  5. Verify loading state appears
  6. Verify workspace structure loads
  7. Verify steps indicator displays
  8. Check for console/page errors

#### Test: "selects lists and proceeds through wizard"
- **Steps:**
  1. Mock configured integration
  2. Open sync modal
  3. Wait for structure to load
  4. Verify "Next" button disabled initially
  5. Expand Marketing space
  6. Select a list
  7. Verify "Next" button enabled
  8. Click "Next" to configure step
  9. Verify configure options display
  10. Test "Back" button
  11. Adjust configuration (include archived, batch size)
  12. Start import
  13. Verify progress step
  14. Verify completion step
  15. Close modal
  16. Check for console/page errors

#### Test: "validates list selection requirement"
- **Steps:**
  1. Mock configured integration
  2. Open sync modal
  3. Wait for structure to load
  4. Verify "Next" button disabled with no selection
  5. Check for console/page errors

#### Test: "uses Select All and Deselect All buttons"
- **Steps:**
  1. Mock configured integration
  2. Open sync modal
  3. Wait for structure to load
  4. Click "Select All" button
  5. Verify "Next" button enabled
  6. Click "Deselect All" button
  7. Verify "Next" button disabled again
  8. Check for console/page errors

### Test Group 4: ClickUp Integration - Error Handling

Tests error handling when backend APIs fail.

#### Test: "displays error when structure fails to load"
- **Steps:**
  1. Mock structure endpoint to return 500 error
  2. Open sync modal
  3. Verify error alert displays
  4. Verify error can be dismissed
  5. (Note: Console errors expected in this test)

## Backend Stubbing

The test file includes a comprehensive `stubClickUpBackend(page)` function that mocks all required API endpoints:

### Mocked Endpoints

1. **GET /api/v1/integrations/available**
   - Returns ClickUp integration definition
   - Includes capabilities and configuration fields

2. **GET /api/v1/integrations**
   - Returns list of configured integrations
   - Initially empty, then populated after configuration

3. **POST /api/v1/integrations**
   - Creates new integration instance
   - Returns integration with ID and settings

4. **GET /api/v1/integrations/clickup/structure**
   - Returns mock workspace structure
   - 2 spaces (Marketing, Engineering)
   - 1 folder (Q1 2025) with 2 lists
   - 3 additional standalone lists

5. **POST /api/v1/integrations/clickup/sync**
   - Accepts sync configuration
   - Returns success response with started timestamp

6. **GET /api/v1/integrations/clickup**
   - Returns single integration details
   - Includes last sync status and timestamp

### Mock Workspace Structure

```typescript
{
  workspace: {
    id: 'workspace_123',
    name: 'E2E Test Workspace'
  },
  spaces: [
    {
      id: 'space_1',
      name: 'Marketing',
      folders: [
        {
          id: 'folder_1',
          name: 'Q1 2025',
          lists: [
            { id: 'list_1', name: 'Social Media', task_count: 25 },
            { id: 'list_2', name: 'Email Campaigns', task_count: 15 }
          ]
        }
      ],
      lists: [
        { id: 'list_3', name: 'General Marketing', task_count: 10 }
      ]
    },
    {
      id: 'space_2',
      name: 'Engineering',
      lists: [
        { id: 'list_4', name: 'Backend', task_count: 50 },
        { id: 'list_5', name: 'Frontend', task_count: 40 }
      ]
    }
  ]
}
```

## Running the Tests

### Prerequisites

Both dev servers must be running:

```bash
# Start all development servers
npm run dev
```

Or manually:

```bash
# Terminal 1: Backend API
cd apps/server && npm run start:dev

# Terminal 2: Admin Frontend
cd apps/admin && npm run dev
```

### Run All ClickUp Tests

```bash
# From project root
npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --project=chromium

# From apps/admin directory
npx playwright test e2e/specs/integrations.clickup.spec.ts --config=e2e/playwright.config.ts --project=chromium
```

### Run Specific Test Group

```bash
# Run only gallery tests
npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --project=chromium --grep="Gallery"

# Run only sync modal tests
npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --project=chromium --grep="Sync Modal"

# Run only error handling tests
npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --project=chromium --grep="Error Handling"
```

### Run in Headed Mode (See Browser)

```bash
npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --project=chromium --headed
```

### Run in Debug Mode

```bash
npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --project=chromium --debug
```

### Run with UI Mode (Interactive)

```bash
npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --ui
```

## Test Patterns Used

### 1. Fixture Pattern

Tests use custom fixtures from `../fixtures/app`:

```typescript
import { test, expect } from '../fixtures/app';

test('my test', async ({ page, consoleErrors, pageErrors }) => {
  // page: Playwright Page object
  // consoleErrors: Array of console errors
  // pageErrors: Array of page errors
});
```

### 2. Helper Functions

Tests import reusable helpers from `../utils/`:

```typescript
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { seedOrgProject } from '../utils/chat';

// Navigation
await navigate(page, '/admin/integrations');

// Org/Project seeding
await seedOrgProject(page);

// Error checking
expectNoRuntimeErrors('test context', consoleErrors, pageErrors);
```

### 3. Test Steps

Tests use `test.step()` for organization:

```typescript
await test.step('Navigate to integrations page', async () => {
  await navigate(page, '/admin/integrations');
  await expect(page).toHaveURL(/\/admin\/integrations/);
});

await test.step('Verify ClickUp card displays', async () => {
  const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
  await expect(clickupCard).toBeVisible();
});
```

### 4. Network Stubbing

Tests stub backend APIs using `page.route()`:

```typescript
await page.route('**/api/v1/integrations/available', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([...integrations])
  });
});
```

### 5. LocalStorage Injection

Tests seed org/project configuration:

```typescript
await seedOrgProject(page); // From chat.ts utility

// Or manually:
await page.addInitScript(() => {
  localStorage.setItem('__NEXUS_CONFIG_v3.0__', JSON.stringify({
    activeOrgId: '22222222-2222-4222-8222-222222222222',
    activeProjectId: '33333333-3333-4333-8333-333333333333'
  }));
});
```

## Expected Test Results

### Success Criteria

All 8 tests should pass:
- ✅ Gallery display test
- ✅ Configuration modal test
- ✅ Sync modal opening test
- ✅ Complete wizard flow test
- ✅ Validation test (disabled Next button)
- ✅ Select All/Deselect All test
- ✅ Error handling test

### Failure Scenarios

Tests may fail if:
1. **Dev servers not running** - Ensure `npm run dev` is active
2. **Port conflicts** - Check that ports 3001 (API) and 5175 (admin) are available
3. **Database issues** - Ensure PostgreSQL is running and schema is initialized
4. **Timing issues** - Some waits may need adjustment based on machine speed
5. **Element selectors changed** - UI changes may require selector updates

## Debugging Failed Tests

### 1. Check Error Context

Playwright generates error context files:

```bash
apps/admin/test-results/<test-name>/error-context.md
```

This file contains:
- Page URL at time of failure
- Console errors
- Accessibility tree snapshot

### 2. View Screenshots

```bash
apps/admin/test-results/<test-name>/test-failed-*.png
```

### 3. Watch Video

```bash
apps/admin/test-results/<test-name>/video.webm
```

### 4. Check Trace

If trace-on-first-retry is enabled:

```bash
npx playwright show-trace apps/admin/test-results/<test-name>/trace.zip
```

### 5. Common Issues

**Issue: Element not found**
- Check if UI component class names changed
- Verify role/text selectors match current UI
- Add explicit waits if timing is the issue

**Issue: Modal not opening**
- Verify button click succeeded
- Check if modal route is stubbed correctly
- Ensure org/project config is seeded

**Issue: Structure not loading**
- Verify workspace structure stub is correctly formatted
- Check network tab in headed mode
- Ensure route pattern matches actual request

**Issue: Next button not enabling**
- Verify checkbox selection logic
- Check if list selection state is tracked
- Test with longer timeout

## Future Test Enhancements

### Phase 1: Coverage Expansion
- [ ] Test folder selection (selects all child lists)
- [ ] Test partial selection (tri-state checkboxes)
- [ ] Test archived list filtering
- [ ] Test batch size validation
- [ ] Test sync cancellation
- [ ] Test concurrent sync prevention

### Phase 2: Integration Testing
- [ ] Test with real backend (remove stubs)
- [ ] Test with actual ClickUp API (mocked)
- [ ] Test error recovery after failed sync
- [ ] Test sync progress updates
- [ ] Test last sync timestamp display

### Phase 3: Performance Testing
- [ ] Test with large workspace (100+ lists)
- [ ] Test tree rendering performance
- [ ] Test selection state updates
- [ ] Test modal open/close speed

### Phase 4: Accessibility Testing
- [ ] Keyboard navigation through wizard
- [ ] Screen reader announcements
- [ ] Focus management in modal
- [ ] ARIA labels and roles

## Integration with CI/CD

### GitHub Actions

Add to `.github/workflows/e2e-tests.yml`:

```yaml
- name: Run ClickUp E2E Tests
  run: |
    npm run dev & # Start dev servers
    sleep 10 # Wait for servers to be ready
    npx playwright test apps/admin/e2e/specs/integrations.clickup.spec.ts --project=chromium
```

### Test Coverage Reporting

```bash
# Generate coverage report
npx playwright test --coverage

# View coverage report
npx playwright show-report
```

## Maintenance

### Update Test Data

To modify mock workspace structure:

1. Edit `stubClickUpBackend()` function
2. Update `mockWorkspaceStructure` object
3. Adjust test assertions accordingly

### Update Selectors

If UI components change:

1. Update element selectors in tests
2. Use Playwright Inspector: `npx playwright test --debug`
3. Use codegen to generate new selectors: `npx playwright codegen http://localhost:5175`

### Performance Tuning

Adjust timeouts in `playwright.config.ts`:

```typescript
timeout: 90_000,        // Overall test timeout
expect: { timeout: 15_000 }, // Assertion timeout
```

## Related Documentation

- [ClickUp Integration Complete](./CLICKUP_INTEGRATION_COMPLETE.md) - Full feature documentation
- [Admin E2E Testing README](../apps/admin/e2e/README.md) - Test infrastructure guide
- [Playwright Best Practices](../apps/admin/e2e/README.refactor.md) - Testing patterns

## Conclusion

This E2E test suite provides comprehensive coverage of the ClickUp integration user flows. The tests are resilient, well-organized, and follow established patterns from the existing test suite. They serve as both validation and documentation of the integration's behavior.

**Status: Ready for execution pending dev server availability** ✅
