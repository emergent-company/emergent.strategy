import { test, expect } from '../fixtures/consoleGate';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { navigate } from '../utils/navigation';
import { ensureReadyToTest } from '../helpers/test-user';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Authenticated route smoke example – uses real API with adaptive auth/setup
// Uses accessible locators (roles / names) per project Playwright guidelines.
// Tests adaptively handle auth and org/project guards by checking what's on screen.

test.describe('Documents Page (authenticated)', () => {
    test('loads without redirect and exposes nav + token', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Navigate to admin and handle any guards', async () => {
            await page.goto('http://localhost:5176/admin');

            // Adaptively handle auth/org/project guards if they appear
            await ensureReadyToTest(page);

            const url = page.url();
            console.log('[TEST] Current URL after ensureReadyToTest:', url);

            // Debug: Check localStorage after ensureReadyToTest
            const storage = await page.evaluate(() => window.localStorage.getItem('spec-server'));
            console.log('[TEST] localStorage after ensureReadyToTest:', storage);

            console.log('[TEST] ✅ Successfully accessed admin route');

            // WORKAROUND: After window.location.href navigation, Playwright's page object
            // may not properly execute scripts. Do an explicit reload to reinitialize.
            console.log('[TEST] Reloading page to ensure scripts execute properly...');
            await page.reload({ waitUntil: 'networkidle' });
            console.log('[TEST] Page reloaded');
        });

        await test.step('Verify URL did not redirect away from documents', async () => {
            await expect(page).toHaveURL(/\/admin\/apps\/documents/);
        });

        await test.step('Assert page contains document content', async () => {
            // Debug: Check current URL
            const currentUrl = page.url();
            console.log('[TEST] Current URL:', currentUrl);

            // Check if React root exists
            const rootExists = await page.locator('#root').count();
            expect(rootExists, 'React root (#root) should exist').toBeGreaterThan(0);

            // Debug: Check root content immediately
            const rootHTML = await page.locator('#root').innerHTML();
            console.log('[TEST] Root innerHTML length:', rootHTML.length);

            if (rootHTML.length > 0) {
                console.log('[TEST] ✅ Root has content! Preview:', rootHTML.substring(0, 200));
            } else {
                console.log('[TEST] ❌ Root is empty after fresh page.goto!');

                // Check full HTML to see if there's an error or something
                const fullHTML = await page.content();
                console.log('[TEST] Full page HTML length:', fullHTML.length);
                console.log('[TEST] Page title:', await page.title());

                // Check for any script errors
                const scripts = await page.locator('script').count();
                console.log('[TEST] Number of script tags:', scripts);

                // Check if React is loaded
                const hasReact = await page.evaluate(() => typeof (window as any).React !== 'undefined');
                console.log('[TEST] React loaded?', hasReact);

                // Check console errors
                console.log('[TEST] Console errors so far:', consoleErrors);

                // Check what scripts are on the page
                const scriptSrcs = await page.evaluate(() => {
                    const scripts = Array.from(document.querySelectorAll('script'));
                    return scripts.map(s => ({ src: s.src || 'inline', type: s.type }));
                });
                console.log('[TEST] Script sources:', JSON.stringify(scriptSrcs, null, 2));
            }

            // Look for main content or sidebar to confirm page loaded
            const pageLoaded = page.locator('main, #layout-sidebar, [role="main"]');
            await expect(pageLoaded.first()).toBeVisible({ timeout: 10000 });
        });

        await test.step('Sidebar contains and links to Documents', async () => {
            const sidebarDocsLink = page.locator('#layout-sidebar').getByRole('link', { name: /^Documents$/i });
            await expect(sidebarDocsLink).toBeVisible();
            await expect(sidebarDocsLink).toHaveAttribute('href', '/admin/apps/documents');
        });

        await test.step('No runtime console/page errors', async () => {
            expectNoRuntimeErrors('documents page', consoleErrors, pageErrors);
        });
    });
});
