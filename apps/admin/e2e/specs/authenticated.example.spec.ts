import { test, expect } from '../fixtures/consoleGate';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { navigate } from '../utils/navigation';
import { ensureReadyToTest } from '../helpers/test-user';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Authenticated route smoke example – uses real API with adaptive auth/setup
// Uses accessible locators (roles / names) per project Playwright guidelines.
// Tests adaptively handle auth and org/project guards by checking what's on screen.

test.describe('Documents Page (authenticated)', () => {
    test('loads without redirect and exposes nav + token', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Navigate to admin and handle any guards', async () => {
            await page.goto('http://localhost:5176/admin');

            // Adaptively handle auth/org/project guards if they appear
            await ensureReadyToTest(page);
        });

        await test.step('Verify URL did not redirect away from documents', async () => {
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
        });

        await test.step('Assert page contains document content', async () => {
            // Look for main content or sidebar to confirm page loaded
            const pageLoaded = page.locator('main, #layout-sidebar, [role="main"]');
            await expect(pageLoaded.first()).toBeVisible({ timeout: 10000 });
        });

        await test.step('Sidebar contains and links to Documents', async () => {
            const sidebarDocsLink = page.locator('#layout-sidebar').getByRole('link', { name: /^Documents$/i });
            await expect(sidebarDocsLink).toBeVisible();
            await expect(sidebarDocsLink).toHaveAttribute('href', '/admin/apps/documents');
        });

        await test.step('No runtime console/page errors', async () => {
            expectNoRuntimeErrors('documents page', consoleErrors, pageErrors);
        });
    });
});
