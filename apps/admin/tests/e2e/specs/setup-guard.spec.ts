import { test, expect } from '../fixtures/cleanUser';
import { createTestOrg, createTestProject } from '../helpers/test-user';
import { BASE_URL } from '../constants/storage';

/**
 * SetupGuard E2E Tests
 *
 * Verifies that SetupGuard correctly handles:
 * 1. Users with no orgs/projects → redirects to setup
 * 2. Users with existing orgs/projects → allows access to admin
 * 3. API checking takes precedence over localStorage
 *
 * Uses cleanUser fixture which:
 * - Logs in as e2e-test@example.com
 * - Cleans up all user data before test
 * - Cleans up all user data after test
 *
 * NOTE: Test user (e2e-test@example.com) must be created in Zitadel.
 * See docs/E2E_TEST_USER_SETUP.md for setup instructions.
 */

// DISABLED: These tests use cleanUser fixture with real OIDC auth flow which is unreliable in CI.
// Need to implement proper auth mocking before re-enabling.
test.describe.skip('SetupGuard - behavior verification', () => {
  test('allows access when user has org and project', async ({
    page,
    cleanupComplete,
  }) => {
    console.log('[TEST] Cleanup complete:', cleanupComplete);

    // Step 1: Create test data (org + project)
    await test.step('Create test org and project', async () => {
      console.log('[TEST] Creating test organization...');
      const orgId = await createTestOrg(page, 'Setup Guard Test Org');
      console.log('[TEST] Org created:', orgId);

      console.log('[TEST] Creating test project...');
      const projectId = await createTestProject(
        page,
        orgId,
        'Setup Guard Test Project'
      );
      console.log('[TEST] Project created:', projectId);
    });

    // Step 2: Navigate to admin and verify access
    await test.step('Verify admin area is accessible', async () => {
      console.log('[TEST] Navigating to admin area...');
      await page.goto(`${BASE_URL}/admin`);

      // Wait for guard to check
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      console.log('[TEST] Current URL:', currentUrl);

      // Should NOT be redirected to setup
      expect(currentUrl).not.toContain('/setup');
      expect(currentUrl).toMatch(/\/admin/);
      console.log('✅ User allowed in admin area');

      // Verify admin UI elements are visible (sidebar or main content)
      const sidebar = page.locator('[data-testid="sidebar"]');
      await expect(sidebar).toBeVisible({ timeout: 5000 });
      console.log('✅ Admin content loaded');
    });
  });

  test('redirects to setup when user has no org/project', async ({
    page,
    cleanupComplete,
  }) => {
    console.log('[TEST] Cleanup complete:', cleanupComplete);
    // cleanUser fixture ensures user has NO data

    // Step 1: Navigate to admin (should redirect to setup)
    await test.step('Verify redirect to setup', async () => {
      console.log('[TEST] Navigating to admin area (user has no data)...');
      await page.goto(`${BASE_URL}/admin`);

      // Wait for guard to check and redirect
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      console.log('[TEST] Current URL:', currentUrl);

      // Should be redirected to setup
      expect(currentUrl).toMatch(/\/setup\/(organization|project)/);
      console.log('✅ User redirected to setup (no data)');

      // Verify setup form is visible
      const setupForm = page
        .getByTestId('setup-org-form')
        .or(page.getByTestId('setup-project-form'));
      await expect(setupForm).toBeVisible({ timeout: 5000 });
      console.log('✅ Setup form visible');
    });
  });
});
