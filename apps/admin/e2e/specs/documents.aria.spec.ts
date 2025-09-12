import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';

test.describe('Documents Page - accessibility structure', () => {
  test('ARIA snapshot baseline', async ({ page, consoleErrors, pageErrors }) => {
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
    await page.route('**/orgs*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '22222222-2222-4222-8222-222222222222', name: 'E2E Org' }]) }));
    await page.route('**/projects*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '33333333-3333-4333-8333-333333333333', name: 'E2E Project', orgId: '22222222-2222-4222-8222-222222222222' }]) }));
    await page.route('**/documents*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) }));
    await navigate(page, '/admin/apps/documents');

    // The app currently renders no semantic <main> or heading element for the page title; it uses a <p>.
    // We wait for the visible page title text instead to ensure content is loaded.
    const title = page.getByText(/documents/i).first();
    await expect(title).toBeVisible();

    // Snapshot at document root (body) – minimal verification that the page title paragraph is present.
    // Snapshot only the breadcrumb list for stability (full body tree is noisy and currently volatile).
    // Allow for possible structural changes: target any list containing Apps & Documents
    const breadcrumbs = page.getByRole('list').filter({ hasText: /Apps/ }).filter({ hasText: /Documents/ }).first();
    await breadcrumbs.waitFor({ state: 'visible', timeout: 10_000 });
    await expect(breadcrumbs).toMatchAriaSnapshot(`
      - list:
        - listitem:
          - link "Nexus"
        - listitem: Apps
        - listitem: Documents
    `);

    // Runtime errors gate (keep lightweight here)
    expect(consoleErrors, `console errors: \n${consoleErrors.join('\n')}`).toHaveLength(0);
    expect(pageErrors, `page errors: \n${pageErrors.join('\n')}`).toHaveLength(0);
  });
});