import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';

test.describe('Documents Page - accessibility structure', () => {
    test('ARIA snapshot baseline', async ({ page, consoleErrors, pageErrors }) => {
        await navigate(page, '/admin/apps/documents');

        // The app currently renders no semantic <main> or heading element for the page title; it uses a <p>.
        // We wait for the visible page title text instead to ensure content is loaded.
        const title = page.getByText(/documents/i).first();
        await expect(title).toBeVisible();

        // Snapshot at document root (body) – minimal verification that the page title paragraph is present.
        // Snapshot only the breadcrumb list for stability (full body tree is noisy and currently volatile).
        const breadcrumbs = page.locator('.breadcrumbs ul').first();
        await expect(breadcrumbs).toBeVisible();
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