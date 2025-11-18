import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';

/**
 * First-login onboarding flow (no existing orgs or projects)
 * Verifies gated forms for creating first organization and first project, then transition to app content.
 */

// DISABLED: This test requires complex mocking of organization/project creation flow.
// Need to implement proper mocking infrastructure before re-enabling.
test.describe.skip(
  'Onboarding - first login organization & project creation',
  () => {
    test('creates org then project and reveals app shell badges', async ({
      page,
      consoleErrors,
      pageErrors,
    }) => {
      const ORG_NAME = 'Acme Test Org';
      const PROJECT_NAME = 'Knowledge Base';

      // In-memory state for stubbed endpoints
      let createdOrg: { id: string; name: string } | null = null;
      let createdProject: { id: string; name: string; orgId: string } | null =
        null;

      await test.step('Prepare auth + clear config + network stubs (empty lists)', async () => {
        // Using real auth from auth.setup.ts storage state
        await page.addInitScript(() => {
          try {
            const KEYS = ['__NEXUS_CONFIG_v3.0__', '__nexus_config_v1__'];
            for (const k of KEYS) localStorage.removeItem(k);
          } catch {
            /* ignore */
          }
        });

        await page.route('**/orgs', async (route) => {
          const method = route.request().method();
          if (method === 'GET') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(createdOrg ? [createdOrg] : []),
            });
          }
          if (method === 'POST') {
            const id = '11111111-1111-4111-8111-111111111111';
            createdOrg = { id, name: ORG_NAME };
            return route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(createdOrg),
            });
          }
          return route.fallback();
        });
        await page.route('**/projects*', async (route) => {
          const method = route.request().method();
          if (method === 'GET') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(createdProject ? [createdProject] : []),
            });
          }
          if (method === 'POST') {
            if (!createdOrg)
              return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'org required' }),
              });
            const id = '22222222-2222-4222-8222-222222222222';
            createdProject = { id, name: PROJECT_NAME, orgId: createdOrg.id };
            return route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(createdProject),
            });
          }
          return route.fallback();
        });
        // Documents API stub (avoid intercepting initial HTML navigation)
        await page.route(
          (url) => /\/documents($|\?)/.test(url.pathname),
          (route) => {
            if (route.request().resourceType() === 'document')
              return route.fallback();
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ documents: [] }),
            });
          }
        );
      });

      await test.step('Navigate to documents page to trigger gate', async () => {
        await navigate(page, '/admin/apps/documents');
        await expect(page).toHaveURL(/\/admin\/apps\/documents/);
      });

      await test.step('See create organization form and submit', async () => {
        await expect(
          page.getByRole('heading', { name: /create your organization/i })
        ).toBeVisible();
        const orgInputStrategies = [
          () => page.getByPlaceholder('e.g. Acme Inc'),
          () => page.locator('input').first(),
        ];
        let filled = false;
        for (const fn of orgInputStrategies) {
          const loc = fn();
          if (await loc.count()) {
            try {
              await loc.fill(ORG_NAME);
              filled = true;
              break;
            } catch {
              /* try next */
            }
          }
        }
        if (!filled)
          throw new Error('Could not locate organization name input');
        await page
          .getByRole('button', { name: /create organization/i })
          .click();
        await expect(
          page.getByRole('heading', { name: /create first project/i })
        ).toBeVisible();
      });

      await test.step('Fill first project form and submit', async () => {
        const projInputStrategies = [
          () => page.getByPlaceholder('e.g. Product Docs'),
          // Fallback: label text preceding the input
          () => page.getByLabel(/project name/i),
          () => page.locator('label:has-text("Project name")').locator('input'),
          () => page.locator('input').first(),
        ];
        let filled = false;
        for (const fn of projInputStrategies) {
          const loc = fn();
          if (await loc.count()) {
            try {
              await loc.fill(PROJECT_NAME);
              filled = true;
              break;
            } catch {
              /* try next */
            }
          }
        }
        if (!filled) throw new Error('Could not locate project name input');
        await page.getByRole('button', { name: /create project/i }).click();
      });

      await test.step('Badges reflect active org & project (gate passed)', async () => {
        const orgBadge = page.getByText(new RegExp(`Org: ${ORG_NAME}`, 'i'));
        const projectBadge = page.getByText(
          new RegExp(`Project: ${PROJECT_NAME}`, 'i')
        );
        await expect(orgBadge).toBeVisible({ timeout: 10_000 });
        await expect(projectBadge).toBeVisible();
      });

      await test.step('Documents area (child content) visible after onboarding', async () => {
        // Re-use robust strategy from other specs
        const candidates = [
          () => page.getByRole('heading', { name: /documents/i }).first(),
          () => page.getByText(/^Documents$/i).first(),
        ];
        let found = false;
        for (const fn of candidates) {
          const loc = fn();
          try {
            await loc.waitFor({ state: 'visible', timeout: 5_000 });
            found = true;
            break;
          } catch {
            /* try next */
          }
        }
        if (!found)
          throw new Error('Documents content not visible after onboarding');
      });

      await test.step('No unexpected console/page errors', async () => {
        if (consoleErrors.length) console.log('Console errors:', consoleErrors);
        if (pageErrors.length) console.log('Page errors:', pageErrors);
        expect(consoleErrors).toHaveLength(0);
        expect(pageErrors).toHaveLength(0);
      });
    });
  }
);
