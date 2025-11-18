import { test } from '../fixtures/consoleGate';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { ROUTES } from '../routes';

/**
 * Route smoke tests - verify all routes render without console/page errors
 *
 * Tests with REAL backend data (no mocks).
 * Routes should be able to handle whatever data exists in the database.
 */

const VISIBLE_SELECTORS = [
  '[role="main"]',
  'main',
  '#root',
  'nav',
  'form',
  'html',
  'body',
];

test.describe('Route smoke (no console/page errors)', () => {
  for (const path of ROUTES) {
    test(`path: ${path}`, async ({ page, consoleErrors, pageErrors }) => {
      await test.step('Navigate', async () => {
        await navigate(page, path);
      });

      await test.step('Wait for any meaningful container', async () => {
        const waits = VISIBLE_SELECTORS.map((sel) =>
          page
            .locator(sel)
            .first()
            .waitFor({ state: 'visible', timeout: 15_000 })
        );
        try {
          await Promise.any(waits);
        } catch {
          throw new Error(
            `No visible containers on ${path} after 15s. Tried: ${VISIBLE_SELECTORS.join(
              ', '
            )}`
          );
        }
      });

      await test.step('Assert no console/page errors', async () => {
        expectNoRuntimeErrors(path, consoleErrors, pageErrors);
      });
    });
  }
});
