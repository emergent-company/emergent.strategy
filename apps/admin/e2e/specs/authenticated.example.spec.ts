import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

// Example of using an authenticated context and reading the token for API calls

test('authenticated user can load documents page without redirect', async ({ page, authToken }) => {
    await page.goto('/admin/apps/documents');
    await page.waitForLoadState('domcontentloaded');

    // Assert we are on the correct route (no redirect)
    await expect(page).toHaveURL(/\/admin\/apps\/documents/);

    // Page title "Documents" should be visible (from PageTitle component)
    await expect(page.locator('p.font-medium.text-lg', { hasText: 'Documents' })).toBeVisible();

    // Sidebar should contain a link to Documents
    const sidebarDocsLink = page.locator('#layout-sidebar').getByRole('link', { name: /^Documents$/i });
    await expect(sidebarDocsLink).toBeVisible();
    await expect(sidebarDocsLink).toHaveAttribute('href', '/admin/apps/documents');

    // If token is configured, ensure the fixture exposed it
    if (process.env.E2E_AUTH_TOKEN) {
        expect(authToken).toBeTruthy();
    }
});
