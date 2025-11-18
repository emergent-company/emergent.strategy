import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';

/**
 * Objects Page E2E Tests (No Mocks)
 *
 * These tests verify the Objects page UI with REAL backend data.
 * Tests focus on UI presence and interaction, not specific data values.
 *
 * Tests removed (required mocks):
 * - type filter (required specific mock objects by type)
 * - view toggle (feature not yet implemented)
 * - bulk selection (required exact count of mock objects)
 * - empty state (can't guarantee empty state without mocks)
 * - error state (can't force API error without mocks)
 */

test.describe('Objects Page', () => {
  test('renders page with correct UI elements', async ({
    page,
    consoleErrors,
    pageErrors,
  }) => {
    await navigate(page, '/admin/objects');

    await test.step('Page title is visible', async () => {
      const title = page.getByRole('heading', { name: /objects/i, level: 1 });
      await expect(title).toBeVisible();
    });

    await test.step('Description is present', async () => {
      const description = page.getByText(/browse and manage all objects/i);
      await expect(description).toBeVisible();
    });

    await test.step('Table or empty state is visible', async () => {
      // Page should show either a table with objects OR an empty state message
      const table = page.getByRole('table');
      const emptyState = page.getByText(/no objects found/i);

      // At least one should be visible
      const hasTable = await table.isVisible().catch(() => false);
      const hasEmptyState = await emptyState.isVisible().catch(() => false);

      expect(hasTable || hasEmptyState).toBe(true);
    });

    await test.step('No runtime errors', async () => {
      expect(consoleErrors).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  });

  test('search functionality is present and interactive', async ({ page }) => {
    await navigate(page, '/admin/objects');

    // Wait for page to fully load
    await test.step('Wait for page to load', async () => {
      await expect(
        page.getByRole('heading', { name: /objects/i, level: 1 })
      ).toBeVisible();
    });

    await test.step('Search input is visible', async () => {
      const searchInput = page.getByPlaceholder(/search objects/i);
      await expect(searchInput).toBeVisible({ timeout: 10000 });
    });

    await test.step('Can type in search input', async () => {
      const searchInput = page.getByPlaceholder(/search objects/i);
      await searchInput.fill('test query');
      await expect(searchInput).toHaveValue('test query');
    });

    // Note: We don't verify search results because we don't know what data exists
    // This test just verifies the UI is functional
  });

  test('ARIA structure is correct', async ({
    page,
    consoleErrors,
    pageErrors,
  }) => {
    await navigate(page, '/admin/objects');

    await test.step('Wait for page to load', async () => {
      await expect(
        page.getByRole('heading', { name: /objects/i, level: 1 })
      ).toBeVisible();
    });

    await test.step('Page has proper ARIA structure', async () => {
      // Verify page has heading structure
      const heading = page.getByRole('heading', { name: /objects/i, level: 1 });
      await expect(heading).toBeVisible();

      // Verify search textbox is accessible (it's a textbox, not a searchbox role)
      const searchInput = page.getByPlaceholder(/search objects/i);
      await expect(searchInput).toBeVisible({ timeout: 10000 });
    });

    await test.step('No runtime errors', async () => {
      expect(consoleErrors).toHaveLength(0);
      expect(pageErrors).toHaveLength(0);
    });
  });
});
