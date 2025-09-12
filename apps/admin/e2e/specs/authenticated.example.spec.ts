import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';

// Authenticated route smoke example – demonstrates use of storageState + fixtures.
// Uses accessible locators (roles / names) per project Playwright guidelines.

test.describe('Documents Page (authenticated)', () => {
    test('loads without redirect and exposes nav + token', async ({ page, authToken, consoleErrors, pageErrors }) => {
        await test.step('Seed active org/project before navigation', async () => {
            await page.addInitScript(() => {
                try {
                    const KEY = '__NEXUS_CONFIG_v3.0__';
                    const raw = localStorage.getItem(KEY);
                    const state: any = raw ? JSON.parse(raw) : {};
                    state.activeOrgId = state.activeOrgId || '22222222-2222-4222-8222-222222222222';
                    state.activeOrgName = state.activeOrgName || 'E2E Org';
                    state.activeProjectId = state.activeProjectId || '33333333-3333-4333-8333-333333333333';
                    state.activeProjectName = state.activeProjectName || 'E2E Project';
                    localStorage.setItem(KEY, JSON.stringify(state));
                } catch { /* ignore */ }
            });
            // Stub core data endpoints to avoid network races / 404s
            await page.route('**/orgs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', name: 'E2E Org' }]) }));
            await page.route('**/projects*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333', name: 'E2E Project', orgId: '22222222-2222-4222-8222-222222222222' }]) }));
            await page.route('**/documents*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) }));
            await page.route('**://localhost:3001/**', async (route) => {
                if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
                return route.fulfill({ status: 204 });
            });
        });
        await test.step('Navigate to documents route', async () => { await navigate(page, '/admin/apps/documents'); });

        await test.step('Verify URL did not redirect away from documents', async () => {
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
        });

        await test.step('Assert page title is visible (robust)', async () => {
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
