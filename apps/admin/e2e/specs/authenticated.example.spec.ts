import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';

// Authenticated route smoke example – demonstrates use of storageState + fixtures.
// Uses accessible locators (roles / names) per project Playwright guidelines.

test.describe('Documents Page (authenticated)', () => {
    test('loads without redirect and exposes nav + token', async ({ page, authToken, consoleErrors, pageErrors }) => {
        await test.step('Navigate to documents route', async () => { await navigate(page, '/admin/apps/documents'); });

        await test.step('Verify URL did not redirect away from documents', async () => {
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
        });

        await test.step('Assert page title is visible', async () => {
            // Prefer heading role; fallback to legacy selector if heading structure changes
            const heading = page.getByRole('heading', { name: /documents/i });
            if (await heading.first().isVisible().catch(() => false)) {
                await expect(heading.first()).toBeVisible();
            } else {
                await expect(page.locator('p.font-medium.text-lg', { hasText: 'Documents' })).toBeVisible();
            }
        });

        await test.step('Sidebar contains and links to Documents', async () => {
            const sidebarDocsLink = page.locator('#layout-sidebar').getByRole('link', { name: /^Documents$/i });
            await expect(sidebarDocsLink).toBeVisible();
            await expect(sidebarDocsLink).toHaveAttribute('href', '/admin/apps/documents');
        });

        await test.step('Fixture exposes auth token when provided via env', async () => {
            if (process.env.E2E_AUTH_TOKEN) {
                expect(authToken, 'authToken fixture should surface token when env set').toBeTruthy();
            }
        });

        await test.step('No runtime console/page errors', async () => {
            expectNoRuntimeErrors('documents page', consoleErrors, pageErrors);
        });
    });
});
