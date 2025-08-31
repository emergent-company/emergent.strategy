import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';

/**
 * Template: copy this spec and replace PATH and SELECTOR to add a route-visit test
 * - Ensure the view is registered in src/router/register.tsx
 * - Prefer a stable selector (role/name, data-testid) to identify the view rendered
 */

test.describe('New view route visit', () => {
    const PATH = '/admin/path-to-new-view'; // TODO: replace
    const STABLE_SELECTOR = 'h1:has-text("Replace With View Title")'; // TODO: replace with a robust locator

    test('renders without console/page errors', async ({ page, consoleErrors, pageErrors }) => {
        await page.goto(PATH);

        // wait for a meaningful element of the view
        await expect(page.locator(STABLE_SELECTOR)).toBeVisible();

        // gate: no console or page errors
        expect(
            consoleErrors,
            `console errors on ${PATH}:\n${consoleErrors.join('\n')}`,
        ).toHaveLength(0);
        expect(pageErrors, `page errors on ${PATH}:\n${pageErrors.join('\n')}`).toHaveLength(0);
    });
});
