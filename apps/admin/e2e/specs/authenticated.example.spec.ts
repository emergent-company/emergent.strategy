import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { ensureActiveOrgAndProject } from '../utils/chat';
import { expectNoRuntimeErrors } from '../utils/assertions';

// Authenticated route smoke example – demonstrates use of storageState + fixtures.
// Uses accessible locators (roles / names) per project Playwright guidelines.

test.describe('Documents Page (authenticated)', () => {
    test('loads without redirect and exposes nav + token', async ({ page, authToken, consoleErrors, pageErrors }) => {
        await test.step('Seed active org/project before navigation', async () => {
            await ensureActiveOrgAndProject(page);
            // Only stub fetch/XHR for documents JSON, not the initial HTML navigation.
            await page.route((url) => /\/documents($|\?)/.test(url.pathname), (route) => {
                if (route.request().resourceType() === 'document') return route.fallback();
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) });
            });
        });
        await test.step('Navigate to documents route', async () => { await navigate(page, '/admin/apps/documents'); });

        await test.step('Verify URL did not redirect away from documents', async () => {
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
        });

        await test.step('Assert page title is visible (robust with fallback)', async () => {
            const candidates = [
                () => page.getByRole('heading', { name: /documents/i }).first(),
                () => page.locator('p:has-text("Documents")').first(),
                () => page.getByText(/^Documents$/i).first(),
            ];
            let found = false;
            for (const fn of candidates) {
                const loc = fn();
                try {
                    await loc.waitFor({ state: 'visible', timeout: 5_000 });
                    found = true; break;
                } catch { /* try next */ }
            }
            if (!found) {
                // Fallback: if raw JSON body rendered (indicates API stub intercepted navigation), reload via /admin then retry
                const bodyHtml = await page.locator('body').innerHTML();
                if (/^<pre>\{"documents":\[\]\}/.test(bodyHtml.trim())) {
                    await navigate(page, '/admin');
                    await navigate(page, '/admin/apps/documents');
                    for (const fn of candidates) {
                        const loc = fn();
                        try { await loc.waitFor({ state: 'visible', timeout: 5_000 }); found = true; break; } catch { /* ignore */ }
                    }
                }
            }
            if (!found) {
                const html = await page.locator('body').innerHTML();
                throw new Error('Documents title not found. Body snippet: ' + html.slice(0, 400));
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
