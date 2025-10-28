import { test, expect } from '../fixtures/consoleGate';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { ensureOrgAndProject } from '../helpers/test-user';
import { navigate } from '../utils/navigation';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Authenticated route smoke example – uses real API with org/project bootstrap
// Uses accessible locators (roles / names) per project Playwright guidelines.

test.describe('Documents Page (authenticated)', () => {
    // Ensure org and project exist in DATABASE before each test
    // We don't set localStorage - frontend auto-selects first org/project
    test.beforeEach(async ({ page }) => {
        await ensureOrgAndProject(page);
    });

    test('loads without redirect and exposes nav + token', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Navigate to admin (config set via init script)', async () => {
            // Listen to all network requests to see what useProjects() actually calls
            const projectsRequests: any[] = [];
            page.on('request', req => {
                if (req.url().includes('/api/projects')) {
                    projectsRequests.push({
                        url: req.url(),
                        method: req.method(),
                        headers: req.headers(),
                    });
                }
            });

            page.on('response', async res => {
                if (res.url().includes('/api/projects')) {
                    const body = await res.json().catch(() => 'non-json');
                    console.log('[TEST] /api/projects response:', {
                        url: res.url(),
                        status: res.status(),
                        body: body,
                    });
                }
            });

            // Init script was added by ensureOrgAndProject() - config will be injected before page load
            await page.goto('http://localhost:5176/admin', { waitUntil: 'networkidle' });

            const url = page.url();
            console.log('[TEST] Current URL after navigation:', url);

            // Debug: Check if init script actually set the config
            const configCheck = await page.evaluate(() => {
                const config = localStorage.getItem('spec-server');
                return config ? JSON.parse(config) : null;
            });
            console.log('[TEST] Config in localStorage after init script:', JSON.stringify(configCheck, null, 2));

            // Log what requests were made
            console.log('[TEST] /api/projects requests made:', JSON.stringify(projectsRequests, null, 2));

            // Should NOT be redirected to setup (config + data exist)
            if (url.includes('/setup') || url.includes('/onboarding')) {
                throw new Error(`Unexpected redirect to ${url}. Config in localStorage: ${JSON.stringify(configCheck)}`);
            }

            console.log('[TEST] ✅ Successfully accessed admin route');
        }); await test.step('Navigate to /admin/apps/documents', async () => {
            await navigate(page, '/admin/apps/documents');
        });

        await test.step('Verify URL did not redirect away from documents', async () => {
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
        });

        await test.step('Assert page contains document content', async () => {
            // Check if React root exists
            const rootExists = await page.locator('#root').count();
            expect(rootExists, 'React root (#root) should exist').toBeGreaterThan(0);

            // Look for main content or sidebar to confirm page loaded
            const pageLoaded = page.locator('main, #layout-sidebar, [role="main"]');
            await expect(pageLoaded.first()).toBeVisible({ timeout: 10000 });
        }); await test.step('Sidebar contains and links to Documents', async () => {
            const sidebarDocsLink = page.locator('#layout-sidebar').getByRole('link', { name: /^Documents$/i });
            await expect(sidebarDocsLink).toBeVisible();
            await expect(sidebarDocsLink).toHaveAttribute('href', '/admin/apps/documents');
        });

        await test.step('No runtime console/page errors', async () => {
            expectNoRuntimeErrors('documents page', consoleErrors, pageErrors);
        });
    });
});
