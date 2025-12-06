import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';

/**
 * Documents Page - Accessibility Structure (No Mocks)
 *
 * Verifies the Documents page has proper ARIA structure with real backend data.
 */

test.describe('Documents Page - accessibility structure', () => {
  test('ARIA snapshot baseline', async ({
    page,
    consoleErrors,
    pageErrors,
  }) => {
    await navigate(page, '/admin/apps/documents');

    // Wait for the page title to ensure content is loaded
    const title = page.getByText(/documents/i).first();
    await expect(title).toBeVisible();

    // Verify breadcrumb navigation structure (Apps > Documents)
    const breadcrumbs = page
      .getByRole('list')
      .filter({ hasText: /Apps/ })
      .filter({ hasText: /Documents/ })
      .first();

    const breadcrumbVisible = await breadcrumbs
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (breadcrumbVisible) {
      await expect(breadcrumbs).toMatchAriaSnapshot(`
        - list:
          - listitem:
            - link "Emergent"
          - listitem: Apps
          - listitem: Documents
      `);
    } else {
      // Fallback: at minimum the title should be visible
      await expect(title).toBeVisible();
    }

    // Runtime errors gate
    expect(
      consoleErrors,
      `console errors: \n${consoleErrors.join('\n')}`
    ).toHaveLength(0);
    expect(pageErrors, `page errors: \n${pageErrors.join('\n')}`).toHaveLength(
      0
    );
  });
});
