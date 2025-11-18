import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';

/**
 * Logout E2E test
 * Verifies that logout properly clears authentication data from localStorage
 * while preserving user preferences.
 */

test.describe('Logout behavior', () => {
  test('should clear auth data from localStorage on logout', async ({
    page,
  }) => {
    // Setup: Navigate to a page that requires auth (if not already authenticated)
    await navigate(page, '/admin/apps/documents');

    // Verify we're authenticated by checking for UI elements
    await expect(page.getByTestId('avatar-trigger')).toBeVisible({
      timeout: 10000,
    });

    // Setup: Add UI preferences to localStorage before logout
    await page.evaluate(() => {
      const config = JSON.parse(localStorage.getItem('spec-server') || '{}');
      config.theme = 'dark';
      config.fontFamily = 'dm-sans';
      config.activeOrgId = 'test-org-id';
      config.activeProjectId = 'test-project-id';
      localStorage.setItem('spec-server', JSON.stringify(config));

      // Also add auth token to spec-server-auth key to verify it gets cleared
      localStorage.setItem(
        'spec-server-auth',
        JSON.stringify({ accessToken: 'test-token' })
      );
    });

    // Execute: Click logout
    await test.step('Click avatar to open profile menu', async () => {
      await page.getByTestId('avatar-trigger').click();
      await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
    });

    await test.step('Click logout button', async () => {
      await page.getByRole('button', { name: /logout/i }).click();

      // Wait for navigation to complete (usually redirects to login or home)
      await page.waitForURL(/\/auth\/login|\/$/);
    });

    // Verify: Check localStorage state after logout
    await test.step('Verify auth data is cleared', async () => {
      const storageState = await page.evaluate(() => ({
        oldAuth: localStorage.getItem('__nexus_auth_v1__'),
        currentAuth: localStorage.getItem('spec-server-auth'),
        config: localStorage.getItem('spec-server'),
      }));

      // Auth keys should be removed
      expect(storageState.oldAuth).toBeNull();
      expect(storageState.currentAuth).toBeNull();

      // Config should exist but user-scoped fields should be cleared
      expect(storageState.config).not.toBeNull();

      if (storageState.config) {
        const config = JSON.parse(storageState.config);

        // User-scoped fields should be cleared
        expect(config.activeOrgId).toBeUndefined();
        expect(config.activeProjectId).toBeUndefined();
        expect(config.activeOrgName).toBeUndefined();
        expect(config.activeProjectName).toBeUndefined();

        // UI preferences should be preserved
        expect(config.theme).toBe('dark');
        expect(config.fontFamily).toBe('dm-sans');
      }
    });
  });

  test('should handle logout when no config exists', async ({ page }) => {
    // Setup: Navigate to a page that requires auth
    await navigate(page, '/admin/apps/documents');

    // Verify we're authenticated
    await expect(page.getByTestId('avatar-trigger')).toBeVisible({
      timeout: 10000,
    });

    // Clear all localStorage before logout
    await page.evaluate(() => {
      localStorage.clear();
      // Re-add just auth data (no config) using current auth storage key
      localStorage.setItem(
        'spec-server-auth',
        JSON.stringify({ accessToken: 'test-token' })
      );
    });

    // Execute: Logout
    await page.getByTestId('avatar-trigger').click();
    await page.getByRole('button', { name: /logout/i }).click();

    // Wait for navigation
    await page.waitForURL(/\/auth\/login|\/$/);

    // Verify: Auth data is cleared and no errors occurred
    const storageState = await page.evaluate(() => ({
      oldAuth: localStorage.getItem('__nexus_auth_v1__'),
      currentAuth: localStorage.getItem('spec-server-auth'),
      config: localStorage.getItem('spec-server'),
    }));

    expect(storageState.oldAuth).toBeNull();
    expect(storageState.currentAuth).toBeNull();
  });
});
