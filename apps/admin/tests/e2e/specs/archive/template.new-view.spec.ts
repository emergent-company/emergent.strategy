import { expect } from '@playwright/test';
import { test } from '../../fixtures/consoleGate';
import { navigate } from '../../utils/navigation';
import { expectNoRuntimeErrors } from '../../utils/assertions';

/**
 * Template: copy this spec and replace PATH and SELECTOR to add a route-visit test
 * - Ensure the view is registered in src/router/register.tsx
 * - Prefer a stable selector (role/name, data-testid) to identify the view rendered
 */

test.describe.skip('New view route visit (template - skipped)', () => {
  const PATH = '/admin/path-to-new-view'; // TODO: replace
  const STABLE_SELECTOR = 'h1:has-text("Replace With View Title")'; // TODO: replace with a robust locator

  test('renders without console/page errors', async ({
    page,
    consoleErrors,
    pageErrors,
  }) => {
    await navigate(page, PATH);
    await expect(page.locator(STABLE_SELECTOR)).toBeVisible();
    expectNoRuntimeErrors(PATH, consoleErrors, pageErrors);
  });
});
