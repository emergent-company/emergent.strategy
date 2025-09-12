import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { seedOrgProject } from '../utils/chat';
import { expectNoRuntimeErrors } from '../utils/assertions';

/**
 * Verifies that the currently active organization in the profile dropdown menu
 * displays a lucide--check icon next to its name.
 * Preconditions: authenticated storageState (auth.setup) or dev token injection.
 */

test.describe('Organizations - active org indicator', () => {
    test('shows checkmark icon next to active org', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Seed active org/project + navigate to documents (stable admin route)', async () => {
            await page.addInitScript(() => {
                try {
                    const KEY = '__NEXUS_CONFIG_v3.0__';
                    const raw = localStorage.getItem(KEY);
                    const state: any = raw ? JSON.parse(raw) : {};
                    state.activeOrgId = '22222222-2222-4222-8222-222222222222';
                    state.activeOrgName = 'E2E Org';
                    state.activeProjectId = '33333333-3333-4333-8333-333333333333';
                    state.activeProjectName = 'E2E Project';
                    localStorage.setItem(KEY, JSON.stringify(state));
                } catch { /* ignore */ }
            });
            await page.route('**/orgs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', name: 'E2E Org' }]) }));
            await page.route('**/projects*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333', name: 'E2E Project', orgId: '22222222-2222-4222-8222-222222222222' }]) }));
            await page.route('**/documents*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) }));
            await navigate(page, '/admin/apps/documents');
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
        });

        await test.step('Open profile/avatar menu', async () => {
            // Try direct dropdown container (class .dropdown-end containing an .avatar img)
            const trigger = page.locator('.dropdown-end .avatar img, .avatar img[alt="Avatar"], img[alt="Avatar"]').first();
            await trigger.waitFor({ state: 'visible', timeout: 15_000 });
            await trigger.click();
        });

        await test.step('Locate active org row and assert lucide--check icon present', async () => {
            // Wait for the Organizations section label
            await page.getByText(/organizations/i).first().waitFor({ state: 'visible', timeout: 10_000 });
            // Find the list items that contain the seeded org name
            const orgName = 'E2E Org';
            // Locate any button containing E2E Org text (case-insensitive) inside dropdown-content
            const dropdown = page.locator('.dropdown-content');
            await dropdown.waitFor({ state: 'visible', timeout: 10_000 });
            const orgRow = dropdown.getByRole('button', { name: /E2E Org/i }).first();
            await orgRow.waitFor({ state: 'visible', timeout: 10_000 });
            const checkIcon = orgRow.locator('.lucide--check');
            await expect(checkIcon, 'Active org should render a lucide--check icon').toHaveCount(1);
        });

        await test.step('No runtime console/page errors', async () => {
            expectNoRuntimeErrors('active org checkmark', consoleErrors, pageErrors);
        });
    });
});
