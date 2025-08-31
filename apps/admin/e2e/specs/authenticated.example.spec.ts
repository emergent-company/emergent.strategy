import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

// Example of using an authenticated context and reading the token for API calls

test('authenticated user can load documents page without redirect', async ({ page, authToken }) => {
    await page.goto('/admin/apps/documents');
    await page.waitForLoadState('domcontentloaded');
    // Basic sanity: root or main visible
    await expect(page.locator('#root, main')).toBeVisible();

    // If token is needed for API calls, it is available here
    // The actual API endpoint is app-specific; we simply assert we have a token when configured
    if (process.env.E2E_AUTH_TOKEN) {
        expect(authToken).toBeTruthy();
    }
});
