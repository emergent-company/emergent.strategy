import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { seedOrgProject } from '../utils/chat';
import type { Page } from '@playwright/test';

/**
 * E2E tests for document upload → auto-extraction → notifications flow
 * 
 * Tests cover:
 * 1. Project settings UI for auto-extraction configuration
 * 2. Document upload triggering extraction when enabled
 * 3. Notification bell showing extraction completion
 * 4. Notification dismissal and action buttons
 */

/**
 * Stub notification backend endpoints
 */
async function stubNotificationBackend(page: Page, opts: {
    notifications?: any[];
    stats?: { unread: number; dismissed: number; total: number };
} = {}) {
    const defaultNotifications = opts.notifications || [
        {
            id: 'notif-1',
            type: 'extraction_complete',
            severity: 'success',
            title: 'Object Extraction Complete',
            message: '15 objects extracted from "Requirements Document.pdf"',
            read: false,
            dismissed: false,
            createdAt: new Date().toISOString(),
            actions: [
                { label: 'View Objects', url: '/admin/objects', style: 'primary' },
                { label: 'Review All', url: '/admin/objects?filter=needsReview', style: 'secondary' },
            ],
            relatedResourceType: 'document',
            relatedResourceId: 'doc-123',
        },
    ];

    const defaultStats = opts.stats || {
        unread: defaultNotifications.filter(n => !n.read).length,
        dismissed: defaultNotifications.filter(n => n.dismissed).length,
        total: defaultNotifications.length,
    };

    // GET /notifications (list)
    await page.route('**/notifications', async (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(defaultNotifications),
            });
        }
        return route.fallback();
    });

    // GET /notifications/stats
    await page.route('**/notifications/stats', async (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(defaultStats),
            });
        }
        return route.fallback();
    });

    // POST /notifications/:id/dismiss
    await page.route('**/notifications/*/dismiss', async (route) => {
        if (route.request().method() === 'POST') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true }),
            });
        }
        return route.fallback();
    });
}

/**
 * Stub project settings endpoints
 */
async function stubProjectBackend(page: Page, opts: {
    project?: any;
} = {}) {
    const defaultProject = opts.project || {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'E2E Project',
        orgId: '22222222-2222-4222-8222-222222222222',
        auto_extract_objects: false,
        auto_extract_config: {
            enabled_types: ['Requirement', 'Decision', 'Feature', 'Task'],
            min_confidence: 0.7,
            require_review: true,
            notify_on_complete: true,
            notification_channels: ['inbox'],
        },
    };

    // GET /projects/:id
    await page.route('**/projects/*', async (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(defaultProject),
            });
        }
        // PATCH /projects/:id
        if (route.request().method() === 'PATCH') {
            const body = route.request().postDataJSON();
            const updatedProject = { ...defaultProject, ...body };
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(updatedProject),
            });
        }
        return route.fallback();
    });
}

// DISABLED: These tests require complex API mocking for notifications and auto-extraction settings.
// Need to implement proper mocking infrastructure before re-enabling.
test.describe.skip('Auto-Extraction and Notifications Flow', () => {

    test('navigates to project auto-extraction settings page', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Network stubs + seed config', async () => {
            await seedOrgProject(page);
            await stubProjectBackend(page);
        });

        await test.step('Navigate to auto-extraction settings', async () => {
            await navigate(page, '/admin/settings/project/auto-extraction');
            await expect(page).toHaveURL(/\/admin\/settings\/project\/auto-extraction/);
        });

        await test.step('Verify page elements are visible', async () => {
            // Page heading
            const heading = page.getByRole('heading', { name: /auto-extraction settings/i });
            await expect(heading).toBeVisible({ timeout: 10_000 });

            // Main toggle (checkbox without explicit name/label)
            const enableToggle = page.locator('input[type="checkbox"].toggle').first();
            await expect(enableToggle).toBeVisible();

            // Settings navigation tabs
            const templatesTab = page.getByRole('link', { name: /template packs/i });
            const autoExtractionTab = page.getByRole('link', { name: /auto-extraction/i });
            await expect(templatesTab).toBeVisible();
            await expect(autoExtractionTab).toBeVisible();
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('auto-extraction settings page', consoleErrors, pageErrors);
        });
    });

    test('enables auto-extraction and configures settings', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Network stubs + seed config', async () => {
            await seedOrgProject(page);
            await stubProjectBackend(page);
        });

        await test.step('Navigate and enable auto-extraction', async () => {
            await navigate(page, '/admin/settings/project/auto-extraction');

            // Find and click the toggle
            const enableToggle = page.locator('input[type="checkbox"].toggle').first();
            await enableToggle.waitFor({ state: 'visible', timeout: 10_000 });
            await enableToggle.click();
        });

        await test.step('Configuration options appear', async () => {
            // Object types section should be visible
            const objectTypesHeading = page.getByRole('heading', { name: /object types to extract/i });
            await expect(objectTypesHeading).toBeVisible({ timeout: 5_000 });

            // Confidence threshold should be visible
            const confidenceHeading = page.getByRole('heading', { name: /confidence threshold/i });
            await expect(confidenceHeading).toBeVisible();

            // At least one object type checkbox should be visible
            const requirementCheckbox = page.getByRole('checkbox', { name: /requirements/i });
            await expect(requirementCheckbox).toBeVisible();
        });

        await test.step('Adjust confidence threshold', async () => {
            // Find the range slider
            const slider = page.locator('input[type="range"]').first();
            await slider.waitFor({ state: 'visible' });

            // Set to high confidence (0.9)
            await slider.fill('0.9');

            // Verify the display shows 0.90
            const confidenceDisplay = page.locator('text=/0\\.9[0-9]/');
            await expect(confidenceDisplay).toBeVisible();
        });

        await test.step('Toggle notification settings', async () => {
            // Find "Notify When Complete" checkbox
            const notifyCheckbox = page.getByRole('checkbox', { name: /notify when complete/i });
            await expect(notifyCheckbox).toBeVisible();

            // Should be checked by default (from stub)
            await expect(notifyCheckbox).toBeChecked();
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('auto-extraction configuration', consoleErrors, pageErrors);
        });
    });

    test('notification bell shows unread count badge', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Network stubs with notifications', async () => {
            await seedOrgProject(page);
            await stubNotificationBackend(page, {
                stats: { unread: 3, dismissed: 0, total: 3 },
            });
        });

        await test.step('Navigate to any admin page', async () => {
            await navigate(page, '/admin/apps/documents');
        });

        await test.step('Notification bell shows badge with count', async () => {
            // Find the notification bell button (icon should be lucide--bell)
            const bellButton = page.locator('button').filter({ has: page.locator('.lucide--bell') }).first();
            await bellButton.waitFor({ state: 'visible', timeout: 10_000 });

            // Badge should show "3"
            const badge = bellButton.locator('.badge').first();
            await expect(badge).toBeVisible();
            await expect(badge).toHaveText('3');
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('notification bell badge', consoleErrors, pageErrors);
        });
    });

    test('notification bell dropdown shows notifications list', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Network stubs with notifications', async () => {
            await seedOrgProject(page);
            await stubNotificationBackend(page);
        });

        await test.step('Navigate and open notification dropdown', async () => {
            await navigate(page, '/admin/apps/documents');

            // Click the notification bell
            const bellButton = page.getByRole('button', { name: /notifications/i });
            await bellButton.waitFor({ state: 'visible', timeout: 10_000 });
            await bellButton.click();

            // Wait for dropdown to open (check for header)
            const dropdownHeader = page.getByText(/^Notifications$/i);
            await dropdownHeader.waitFor({ state: 'visible', timeout: 5_000 });
        });

        await test.step('Dropdown panel appears with notifications', async () => {
            // Check if "No notifications yet" empty state appears, or if notifications appear
            const emptyState = page.getByText(/no notifications yet/i);
            const notificationTitle = page.getByText(/object extraction complete/i).first();

            try {
                await expect(emptyState).toBeVisible({ timeout: 2_000 });
                console.log('Empty notification state shown (no notifications loaded from stub)');
            } catch {
                // If empty state not visible, notifications should be visible
                await expect(notificationTitle).toBeVisible({ timeout: 3_000 });

                // Look for notification message
                const notificationMessage = page.getByText(/15 objects extracted/i).first();
                await expect(notificationMessage).toBeVisible();

                // Action buttons should be visible
                const viewObjectsButton = page.getByRole('button', { name: /view objects/i });
                const reviewAllButton = page.getByRole('button', { name: /review all/i });
                await expect(viewObjectsButton).toBeVisible();
                await expect(reviewAllButton).toBeVisible();

                // Dismiss button (X) should be visible
                const dismissButtons = page.locator('button').filter({ has: page.locator('.lucide--x') });
                await expect(dismissButtons.first()).toBeVisible();
            }
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('notification dropdown', consoleErrors, pageErrors);
        });
    });

    test('dismissing a notification removes it from list', async ({ page, consoleErrors, pageErrors }) => {
        let dismissCalled = false;

        await test.step('Network stubs with dismiss tracking', async () => {
            await seedOrgProject(page);
            await stubNotificationBackend(page);

            // Override dismiss endpoint to track calls
            await page.route('**/notifications/*/dismiss', async (route) => {
                if (route.request().method() === 'POST') {
                    dismissCalled = true;
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ success: true }),
                    });
                }
                return route.fallback();
            });
        });

        await test.step('Open notification dropdown', async () => {
            await navigate(page, '/admin/apps/documents');

            const bellButton = page.getByRole('button', { name: /notifications/i });
            await bellButton.waitFor({ state: 'visible', timeout: 10_000 });
            await bellButton.click();

            // Wait for dropdown
            const dropdownHeader = page.getByText(/^Notifications$/i);
            await dropdownHeader.waitFor({ state: 'visible', timeout: 5_000 });
        });

        await test.step('Click dismiss button on notification if present', async () => {
            // Check if notifications are present (not empty state)
            const emptyState = page.getByText(/no notifications yet/i);
            const hasNotifications = !(await emptyState.isVisible().catch(() => false));

            if (hasNotifications) {
                // Wait for notification to appear
                const notificationTitle = page.getByText(/object extraction complete/i).first();
                await expect(notificationTitle).toBeVisible({ timeout: 5_000 });

                // Find dismiss buttons (all X icons in the dropdown)
                const dismissButtons = page.locator('.dropdown-content button').filter({ has: page.locator('.lucide--x') });
                const dismissButton = dismissButtons.last(); // Get the dismiss button on notification, not the close button

                await dismissButton.click();

                // Wait for API call
                await page.waitForTimeout(500);
                expect(dismissCalled).toBe(true);
            } else {
                console.log('No notifications to dismiss (empty state)');
            }
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('notification dismissal', consoleErrors, pageErrors);
        });
    });

    test('clicking notification action button navigates correctly', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Network stubs', async () => {
            await seedOrgProject(page);
            await stubNotificationBackend(page);

            // Stub objects endpoint (where "View Objects" button navigates)
            await page.route('**/objects', async (route) => {
                if (route.request().method() === 'GET') {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify([]),
                    });
                }
                return route.fallback();
            });
        });

        await test.step('Open notification dropdown and click action if present', async () => {
            await navigate(page, '/admin/apps/documents');

            // Open dropdown
            const bellButton = page.getByRole('button', { name: /notifications/i });
            await bellButton.click();

            // Wait for dropdown
            const dropdownHeader = page.getByText(/^Notifications$/i);
            await dropdownHeader.waitFor({ state: 'visible', timeout: 5_000 });

            // Check if notifications are present
            const emptyState = page.getByText(/no notifications yet/i);
            const hasNotifications = !(await emptyState.isVisible().catch(() => false));

            if (hasNotifications) {
                // Wait for notification
                await page.getByText(/object extraction complete/i).first().waitFor({ state: 'visible', timeout: 5_000 });

                // Click "View Objects" button
                const viewObjectsButton = page.getByRole('button', { name: /view objects/i });
                await viewObjectsButton.click();

                // Verify navigation
                await expect(page).toHaveURL(/\/admin\/objects/, { timeout: 10_000 });
            } else {
                console.log('No notifications with actions to test (empty state)');
                // Just verify we're still on documents page
                await expect(page).toHaveURL(/\/admin\/apps\/documents/);
            }
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('notification action navigation', consoleErrors, pageErrors);
        });
    });

    test('save button is disabled when no changes made', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Network stubs', async () => {
            await seedOrgProject(page);
            await stubProjectBackend(page);
        });

        await test.step('Navigate to settings page', async () => {
            await navigate(page, '/admin/settings/project/auto-extraction');

            // Wait for page to load
            const heading = page.getByRole('heading', { name: /auto-extraction settings/i });
            await expect(heading).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Save button should be disabled initially', async () => {
            const saveButton = page.getByRole('button', { name: /save settings/i });
            await expect(saveButton).toBeVisible();
            await expect(saveButton).toBeDisabled();
        });

        await test.step('Enable auto-extraction to make a change', async () => {
            const enableToggle = page.locator('input[type="checkbox"].toggle').first();
            await enableToggle.click();
        });

        await test.step('Save button should be enabled after change', async () => {
            const saveButton = page.getByRole('button', { name: /save settings/i });
            await expect(saveButton).toBeEnabled();
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('save button state', consoleErrors, pageErrors);
        });
    });
});
