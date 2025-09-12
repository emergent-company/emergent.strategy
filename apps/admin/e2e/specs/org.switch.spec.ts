import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { ensureDevAuth } from '../utils/chat';

/**
 * Org switching E2E
 * Reproduces the reported issue: toast shows switch but checkmark may remain on previous org.
 * This test will FAIL if the checkmark does not move to the newly selected org.
 */

test.describe('Organizations - switching active org', () => {
    test('switches active org updates checkmark + toast', async ({ page, consoleErrors, pageErrors }) => {
        const ORG_ALPHA = { id: '11111111-aaaa-4111-8111-111111111111', name: 'Alpha Org' };
        const ORG_BETA = { id: '22222222-bbbb-4222-8222-222222222222', name: 'Beta Org' };
        const PROJECT_ALPHA = { id: '33333333-aaaa-4333-8333-333333333333', name: 'Alpha Project', orgId: ORG_ALPHA.id };
        const PROJECT_BETA = { id: '44444444-bbbb-4444-8444-444444444444', name: 'Beta Project', orgId: ORG_BETA.id };

        await test.step('Seed auth + initial active org + stub /orgs', async () => {
            await ensureDevAuth(page); // ensure token before scripts
            // Seed config + stub network before navigation for deterministic initial state
            await page.addInitScript(({ alpha, projectAlpha }) => {
                try {
                    const KEY = '__NEXUS_CONFIG_v3.0__';
                    const raw = localStorage.getItem(KEY);
                    const state: any = raw ? JSON.parse(raw) : {};
                    state.activeOrgId = alpha.id;
                    state.activeOrgName = alpha.name;
                    state.activeProjectId = projectAlpha.id;
                    state.activeProjectName = projectAlpha.name;
                    localStorage.setItem(KEY, JSON.stringify(state));
                } catch { /* ignore */ }
            }, { alpha: ORG_ALPHA, projectAlpha: PROJECT_ALPHA });

            await page.route('**/orgs', async (route) => {
                if (route.request().method() === 'GET') {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ORG_ALPHA, ORG_BETA]) });
                }
                return route.fallback();
            });
            await page.route('**/projects', async (route) => {
                if (route.request().method() === 'GET') {
                    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PROJECT_ALPHA, PROJECT_BETA]) });
                }
                return route.fallback();
            });
            await page.route('**/documents*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) }));
            // Allow any other GET -> empty object (avoid noisy 404s)
            await page.route('**://localhost:3001/**', async (route) => {
                if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
                return route.fulfill({ status: 204 });
            });
        });

        await test.step('Navigate to a stable admin page', async () => {
            await navigate(page, '/admin/apps/documents');
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
            await page.waitForFunction(() => !!document.querySelector('.dropdown-end .avatar img, .avatar img, img[alt="Avatar"]'), { timeout: 15_000 }).catch(() => { });
        });

        await test.step('Open avatar dropdown and verify initial active org checkmark', async () => {
            // Robust avatar resolution: try explicit image, then parent with class .avatar, then any element containing the fallback image path
            // Wait for React app hydration (root div populated)
            await page.waitForFunction(() => {
                const root = document.getElementById('root');
                return !!root && root.children.length > 0;
            }, { timeout: 20_000 });
            const candidates = [
                '.avatar img[alt="Avatar"]',
                '.avatar img',
                'img[alt="Avatar"]',
                'img[src*="/images/avatars/"]'
            ];
            let avatar = page.locator('NOT_A_SELECTOR');
            for (const sel of candidates) {
                const loc = page.locator(sel).first();
                if (await loc.count() > 0) { avatar = loc; break; }
            }
            if (await avatar.count() === 0) {
                // Dump DOM snippet for debugging
                const bodyHtml = await page.locator('body').innerHTML();
                console.log('[debug] avatar not found; body snippet:', bodyHtml.slice(0, 800));
                throw new Error('Avatar element not found via fallback selectors');
            }
            await avatar.click();
            await page.getByText(/organizations/i).first().waitFor({ state: 'visible', timeout: 10_000 });
            const alphaRow = page.getByRole('button', { name: new RegExp(ORG_ALPHA.name, 'i') }).first();
            const betaRow = page.getByRole('button', { name: new RegExp(ORG_BETA.name, 'i') }).first();
            await expect(alphaRow).toBeVisible();
            await expect(betaRow).toBeVisible();
            await expect(alphaRow.locator('.lucide--check')).toHaveCount(1);
            await expect(betaRow.locator('.lucide--check')).toHaveCount(0);
        });

        await test.step('Switch to Beta Org and observe toast', async () => {
            const betaRow = page.getByRole('button', { name: new RegExp(ORG_BETA.name, 'i') }).first();
            await betaRow.click();
            const toast = page.getByText(new RegExp(`Switched to ${ORG_BETA.name}`, 'i'));
            await expect(toast).toBeVisible({ timeout: 5000 });
        });

        await test.step('Re-open dropdown (it closes after click) and assert checkmark moved', async () => {
            const avatar = page.locator('.avatar img, img[alt="Avatar"], img[src*="/images/avatars/"]').first();
            if (await avatar.count() === 0) throw new Error('Avatar not found on re-open');
            await avatar.click();
            await page.getByText(/organizations/i).first().waitFor({ state: 'visible', timeout: 10_000 });
            const alphaRow = page.getByRole('button', { name: new RegExp(ORG_ALPHA.name, 'i') }).first();
            const betaRow = page.getByRole('button', { name: new RegExp(ORG_BETA.name, 'i') }).first();
            // EXPECTATION: check icon transferred to Beta Org
            await expect(betaRow.locator('.lucide--check'), 'Checkmark should move to newly selected org').toHaveCount(1);
            await expect(alphaRow.locator('.lucide--check'), 'Old org should no longer display checkmark').toHaveCount(0);
        });

        await test.step('No unexpected console/page errors', async () => {
            if (consoleErrors.length) console.log('Console errors:', consoleErrors);
            if (pageErrors.length) console.log('Page errors:', pageErrors);
            expect(consoleErrors, 'Should have no console errors during org switch').toHaveLength(0);
            expect(pageErrors, 'Should have no page errors during org switch').toHaveLength(0);
        });
    });
});
