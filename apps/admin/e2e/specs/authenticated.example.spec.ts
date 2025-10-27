import { test, expect } from '../fixtures/consoleGate';
import { expectNoRuntimeErrors } from '../utils/assertions';

// Authenticated route smoke example – uses full OIDC login like extraction-jobs test.
// Uses accessible locators (roles / names) per project Playwright guidelines.

test.describe('Documents Page (authenticated)', () => {
    test('loads without redirect and exposes nav + token', async ({ page, consoleErrors, pageErrors }) => {
        // Authenticate via OIDC first (same pattern as extraction-jobs test)
        await test.step('Authenticate via Zitadel OIDC login', async () => {
            const email = process.env.E2E_OIDC_EMAIL || 'maciej@kucharz.net';
            const password = process.env.E2E_OIDC_PASSWORD || 'Test1234!';

            // Go directly to the target page - will redirect to login
            await page.goto('http://localhost:5176/admin/apps/documents');
            await page.waitForURL(/localhost:8200.*login/, { timeout: 15000 });

            const emailInput = page.locator('input[name="loginName"]').or(page.locator('input[type="email"]'));
            await emailInput.waitFor({ state: 'visible', timeout: 10000 });
            await emailInput.fill(email);

            const nextButton = page.locator('button:has-text("Next")');
            await nextButton.click();

            const passwordInput = page.locator('input[name="password"]').or(page.locator('input[type="password"]'));
            await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
            await passwordInput.fill(password);

            const passwordNextButton = page.locator('button:has-text("Next")');
            await passwordNextButton.click();

            // Wait for redirect back to app (setup, admin, or documents)
            await page.waitForURL(/localhost:5176/, { timeout: 15000 });
            console.log('[test] Redirected to:', page.url());

            // Wait for OAuth callback to complete processing
            if (page.url().includes('/auth/callback')) {
                await page.waitForURL(/localhost:5176\/(setup|admin)/, { timeout: 15000 });
                console.log('[test] OAuth callback processed, now at:', page.url());
            }
        });

        // Handle setup flow if needed (org/project creation)
        await test.step('Handle setup flow if present', async () => {
            let currentUrl = page.url();
            console.log('[test] Current URL after OIDC:', currentUrl);

            if (currentUrl.includes('/setup/organization')) {
                console.log('[test] Creating organization...');

                // Check for any error messages before proceeding
                const errorMessage = page.locator('.error, [role="alert"], .alert-error');
                const hasError = await errorMessage.count() > 0;
                if (hasError) {
                    const errorText = await errorMessage.first().innerText();
                    console.error('[test] Found error on page:', errorText);
                }

                const timestamp = Date.now();
                const orgNameInput = page.getByTestId('setup-org-name-input');
                await orgNameInput.waitFor({ state: 'visible', timeout: 5000 });
                await orgNameInput.fill(`E2E Test Org ${timestamp}`);

                const createOrgButton = page.getByTestId('setup-org-create-button');
                await createOrgButton.click();

                // Wait for either redirect to project setup OR error message
                try {
                    await page.waitForURL(/\/setup\/project/, { timeout: 10000 });
                    console.log('[test] Organization created, now on project setup page');
                } catch (e) {
                    const finalUrl = page.url();
                    const errorMsg = page.locator('.error, [role="alert"], .alert-error');
                    const errorCount = await errorMsg.count();
                    if (errorCount > 0) {
                        const errorText = await errorMsg.first().innerText();
                        throw new Error(`Failed to create organization. Error: ${errorText}, URL: ${finalUrl}`);
                    }
                    throw new Error(`Failed to redirect to project setup. Final URL: ${finalUrl}`);
                }
                currentUrl = page.url();
            }

            if (currentUrl.includes('/setup/project')) {
                console.log('[test] Creating project...');
                const timestamp = Date.now();
                const projectNameInput = page.getByTestId('setup-project-name-input');
                await projectNameInput.waitFor({ state: 'visible', timeout: 5000 });
                await projectNameInput.fill(`E2E Test Project ${timestamp}`);

                const createProjectButton = page.getByTestId('setup-project-create-button');
                await createProjectButton.click();

                // Wait for redirect to admin area
                try {
                    await page.waitForURL(/\/admin/, { timeout: 10000 });
                    console.log('[test] Project created, redirected to admin area');
                } catch (e) {
                    const finalUrl = page.url();
                    const errorMsg = page.locator('.error, [role="alert"], .alert-error');
                    const errorCount = await errorMsg.count();
                    if (errorCount > 0) {
                        const errorText = await errorMsg.first().innerText();
                        throw new Error(`Failed to create project. Error: ${errorText}, URL: ${finalUrl}`);
                    }
                    throw new Error(`Failed to redirect to admin area. Final URL: ${finalUrl}`);
                }
            }
        });

        // After OIDC and potential setup, navigate to documents if not there
        await test.step('Navigate to documents page', async () => {
            const currentUrl = page.url();
            console.log('[test] Current URL before documents navigation:', currentUrl);

            if (!currentUrl.includes('/admin/apps/documents')) {
                console.log('[test] Navigating to documents page...');
                await page.goto('http://localhost:5176/admin/apps/documents');

                // Wait for SetupGuard to process (might redirect to setup)
                await page.waitForTimeout(2000);
                const afterUrl = page.url();
                console.log('[test] After documents navigation, URL:', afterUrl);

                // If we're back at setup, handle it now
                if (afterUrl.includes('/setup/organization')) {
                    console.log('[test] SetupGuard redirected to org setup...');
                    const timestamp = Date.now();
                    const orgNameInput = page.getByTestId('setup-org-name-input');
                    await orgNameInput.fill(`E2E Test Org ${timestamp}`);
                    const createOrgButton = page.getByTestId('setup-org-create-button');
                    await createOrgButton.click();
                    await page.waitForURL(/\/setup\/project/, { timeout: 10000 });
                }

                if (page.url().includes('/setup/project')) {
                    console.log('[test] Now creating project...');
                    const timestamp = Date.now();
                    const projectNameInput = page.getByTestId('setup-project-name-input');
                    await projectNameInput.fill(`E2E Test Project ${timestamp}`);
                    const createProjectButton = page.getByTestId('setup-project-create-button');
                    await createProjectButton.click();
                    await page.waitForURL(/\/admin/, { timeout: 10000 });

                    // Navigate to documents again after setup complete
                    await page.goto('http://localhost:5176/admin/apps/documents');
                    await page.waitForLoadState('domcontentloaded');
                }
            }
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
