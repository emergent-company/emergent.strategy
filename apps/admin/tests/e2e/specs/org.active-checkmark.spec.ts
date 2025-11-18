import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { openOrgMenu } from '../utils/orgs';
import { expectNoRuntimeErrors } from '../utils/assertions';

/**
 * Verifies that the currently active organization in the profile dropdown menu
 * displays a lucide--check icon next to its name.
 * Preconditions: authenticated storageState (auth.setup) with org & project already set up.
 */

test.describe('Organizations - active org indicator', () => {
  test('shows checkmark icon next to active org', async ({
    page,
    consoleErrors,
    pageErrors,
  }) => {
    await test.step('Navigate to documents page', async () => {
      // No mocks - testing with real backend
      await navigate(page, '/admin/apps/documents');
      await expect(page).toHaveURL(/\/admin\/apps\/documents/);
    });

    await test.step('Open profile/avatar menu', async () => {
      await openOrgMenu(page);
    });

    await test.step('Locate active org row and assert lucide--check icon present', async () => {
      const dropdown = page
        .locator('.dropdown-content')
        .filter({ hasText: /Organizations/i })
        .first();
      await dropdown.waitFor({ state: 'visible', timeout: 10_000 });
      const orgRow = dropdown
        .getByRole('button', { name: /E2E Test Org/i })
        .first();
      await orgRow.waitFor({ state: 'visible', timeout: 10_000 });
      await expect(
        orgRow.locator('.lucide--check'),
        'Active org should render a lucide--check icon'
      ).toHaveCount(1);
    });

    await test.step('No runtime console/page errors', async () => {
      expectNoRuntimeErrors('active org checkmark', consoleErrors, pageErrors);
    });
  });
});
