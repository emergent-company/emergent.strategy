import { test, expect } from '@playwright/test';
import { ensureReadyToTest } from '../../helpers/test-user';
import { BASE_URL } from '../../constants/storage';

// DISABLED: Debug test - uses real auth flow
test.describe.skip('Debug: Direct Admin Navigation', () => {
  test.use({ storageState: 'apps/admin/e2e/.auth/state.json' });

  test('navigate directly to admin/apps/documents', async ({ page }) => {
    // Capture ALL console logs to see any JavaScript errors
    page.on('console', (msg) => {
      console.log('[BROWSER]', msg.type(), msg.text());
    });

    await test.step('Ensure test user ready (org + project created)', async () => {
      // Navigate to admin first
      await page.goto(`${BASE_URL}/admin`);

      // This creates org/project if needed and ensures activeOrgId/activeProjectId in localStorage
      await ensureReadyToTest(page);
    });

    await test.step('Verify we are on admin page', async () => {
      // After ensureReadyToTest(), we should already be on /admin/apps/documents
      const url = page.url();
      console.log('[TEST] Current URL:', url);
      expect(url).toContain('/admin/apps');

      // Debug: check what's actually in the DOM
      const rootHTML = await page.locator('#root').innerHTML();
      console.log('[TEST] Root HTML length:', rootHTML.length);
      console.log('[TEST] Root HTML preview:', rootHTML.substring(0, 1000));
    });

    await test.step('Assert main content visible', async () => {
      await expect(page.locator('main, #layout-sidebar').first()).toBeVisible();
    });
  });
});
