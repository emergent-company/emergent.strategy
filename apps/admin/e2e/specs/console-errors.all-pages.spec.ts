import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { ensureOrgAndProject } from '../helpers/test-user';

/**
 * Comprehensive E2E Test: Console Errors Across All Pages
 * 
 * This test visits EVERY page in the admin application and checks for:
 * - Console errors (console.error calls)
 * - Page errors (uncaught exceptions)
 * - API errors (HTTP 4xx/5xx responses)
 * - Correct page rendering (via data-testid verification)
 * 
 * Purpose: Catch runtime issues early across the entire application
 */

// Route configuration with expected page test IDs
type RouteConfig = {
    path: string;
    testId: string;
    description: string;
};

const ALL_ROUTES: Record<string, RouteConfig[]> = {
    landing: [
        { path: '/', testId: 'page-landing', description: 'Landing home' },
        { path: '/landing', testId: 'page-landing', description: 'Landing explicit' },
    ],
    auth: [
        { path: '/auth/login', testId: 'page-auth-login', description: 'Login page' },
        { path: '/auth/callback', testId: 'page-auth-callback', description: 'Auth callback' },
        { path: '/auth/register', testId: 'page-auth-register', description: 'Register page' },
        { path: '/auth/forgot-password', testId: 'page-auth-forgot-password', description: 'Forgot password' },
        { path: '/auth/reset-password', testId: 'page-auth-reset-password', description: 'Reset password' },
    ],
    apps: [
        { path: '/admin/apps/documents', testId: 'page-documents', description: 'Documents app' },
        { path: '/admin/apps/chunks', testId: 'page-chunks', description: 'Chunks app' },
        { path: '/admin/apps/chat', testId: 'page-chat-home', description: 'Chat home' },
        { path: '/admin/apps/chat/c/new', testId: 'page-chat-conversation', description: 'New chat conversation' },
    ],
    pages: [
        { path: '/admin/objects', testId: 'page-objects', description: 'Graph objects' },
        { path: '/admin/extraction-jobs', testId: 'page-extraction-jobs', description: 'Extraction jobs' },
        { path: '/admin/integrations', testId: 'page-integrations', description: 'Integrations' },
        { path: '/admin/inbox', testId: 'page-inbox', description: 'Inbox' },
        { path: '/admin/profile', testId: 'page-profile', description: 'User profile' },
    ],
    settings: [
        { path: '/admin/settings/ai/prompts', testId: 'page-settings-ai-prompts', description: 'AI prompts settings' },
        { path: '/admin/settings/project/templates', testId: 'page-settings-project-templates', description: 'Project templates' },
        { path: '/admin/settings/project/auto-extraction', testId: 'page-settings-auto-extraction', description: 'Auto-extraction settings' },
    ],
} as const;

// Flatten all routes
const FLATTENED_ROUTES: RouteConfig[] = Object.values(ALL_ROUTES).flat();

test.describe('Console Errors - All Pages (Real API)', () => {
    // NO MOCKS - This test makes REAL API calls to catch actual errors
    // Requires: Backend server running on localhost:3001

    // Ensure org and project exist before running any tests
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await ensureOrgAndProject(page);
        await context.close();
    });

    // Generate one test per route
    for (const route of FLATTENED_ROUTES) {
        test(`${route.path} - should load without console errors`, async ({
            page,
            consoleErrors,
            pageErrors,
            apiErrors,
        }) => {
            await test.step(`Navigate to ${route.path}`, async () => {
                await navigate(page, route.path);
            });

            await test.step(`Wait for correct page to render: ${route.testId}`, async () => {
                // Wait for the specific page test ID to ensure we loaded the RIGHT page
                // This catches if we got redirected to login or another page instead
                try {
                    await page.waitForSelector(`[data-testid="${route.testId}"]`, {
                        state: 'visible',
                        timeout: 15_000,
                    });
                } catch (error) {
                    // If test ID not found, take a screenshot for debugging
                    const screenshotPath = `test-results/wrong-page-${route.path.replace(/\//g, '-')}.png`;
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    throw new Error(
                        `Expected page test ID "${route.testId}" not found on ${route.path}. ` +
                        `This usually means the page redirected (e.g., to login) or the test ID is missing. ` +
                        `Screenshot saved: ${screenshotPath}`
                    );
                }
            });

            await test.step('Assert no console or page errors', async () => {
                expectNoRuntimeErrors(route.path, consoleErrors, pageErrors, apiErrors);
            });

            await test.step('Capture error details if any', async () => {
                if (consoleErrors.length > 0 || pageErrors.length > 0 || apiErrors.length > 0) {
                    // Take screenshot for debugging
                    const screenshotPath = `test-results/console-errors-${route.path.replace(/\//g, '-')}.png`;
                    await page.screenshot({ path: screenshotPath, fullPage: true });

                    // Log detailed error information
                    console.error(`\n❌ Errors found on ${route.path} (${route.description}):`);
                    if (consoleErrors.length > 0) {
                        console.error('\n  Console Errors:');
                        consoleErrors.forEach((err, i) =>
                            console.error(`    ${i + 1}. ${err}`)
                        );
                    }
                    if (pageErrors.length > 0) {
                        console.error('\n  Page Errors:');
                        pageErrors.forEach((err, i) =>
                            console.error(`    ${i + 1}. ${err}`)
                        );
                    }
                    if (apiErrors.length > 0) {
                        console.error('\n  API Errors:');
                        apiErrors.forEach((err, i) =>
                            console.error(`    ${i + 1}. ${err}`)
                        );
                    }
                    console.error(`\n  Screenshot saved: ${screenshotPath}\n`);
                }
            });
        });
    }

    // Summary test to report overall results
    test('Summary - All pages tested', async () => {
        const totalRoutes = FLATTENED_ROUTES.length;
        console.log(`\n✅ Tested ${totalRoutes} routes for console errors:`);
        console.log(`   - Landing: ${ALL_ROUTES.landing.length} routes`);
        console.log(`   - Auth: ${ALL_ROUTES.auth.length} routes`);
        console.log(`   - Apps: ${ALL_ROUTES.apps.length} routes`);
        console.log(`   - Pages: ${ALL_ROUTES.pages.length} routes`);
        console.log(`   - Settings: ${ALL_ROUTES.settings.length} routes`);
        console.log(`\n   Total: ${totalRoutes} pages checked\n`);
        console.log(`\n   All pages verified by data-testid to ensure correct page loaded\n`);

        // This test always passes - it's just for reporting
        expect(totalRoutes).toBeGreaterThan(0);
    });
});

/**
 * Usage:
 * 
 * Run all console error tests:
 *   npx playwright test e2e/specs/console-errors.all-pages.spec.ts
 * 
 * Run for specific browser:
 *   npx playwright test e2e/specs/console-errors.all-pages.spec.ts --project=chromium
 * 
 * Run in debug mode:
 *   npx playwright test e2e/specs/console-errors.all-pages.spec.ts --debug
 * 
 * Run in headed mode (see the browser):
 *   npx playwright test e2e/specs/console-errors.all-pages.spec.ts --headed
 */
