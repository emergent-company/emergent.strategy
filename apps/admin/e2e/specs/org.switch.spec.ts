import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { ensureDevAuth, ensureActiveOrgAndProject } from '../utils/chat';
import { openOrgMenu } from '../utils/orgs';

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

        await test.step('Seed auth + initial active org/project and stub listings', async () => {
            await ensureDevAuth(page);
            // Provide active initial org/project via helper (uses default ids which we override below on switch)
            await ensureActiveOrgAndProject(page, { orgId: ORG_ALPHA.id, projectId: PROJECT_ALPHA.id });
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
            await page.route((url) => /\/documents($|\?)/.test(url.pathname), (route) => {
                if (route.request().resourceType() === 'document') return route.fallback();
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) });
            });
        });

        await test.step('Navigate to a stable admin page', async () => {
            await navigate(page, '/admin/apps/documents');
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
            await page.waitForFunction(() => !!document.querySelector('.dropdown-end .avatar img, .avatar img, img[alt="Avatar"]'), { timeout: 15_000 }).catch(() => { });
        });

        await test.step('Open avatar dropdown and verify initial active org checkmark', async () => {
            const dropdown = await openOrgMenu(page);
            const alphaRow = dropdown.getByRole('button', { name: new RegExp(ORG_ALPHA.name, 'i') }).first();
            const betaRow = dropdown.getByRole('button', { name: new RegExp(ORG_BETA.name, 'i') }).first();
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
            const dropdown = await openOrgMenu(page);
            const alphaRow = dropdown.getByRole('button', { name: new RegExp(ORG_ALPHA.name, 'i') }).first();
            const betaRow = dropdown.getByRole('button', { name: new RegExp(ORG_BETA.name, 'i') }).first();
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
