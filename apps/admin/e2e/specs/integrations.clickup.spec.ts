import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { ensureActiveOrgAndProject } from '../utils/chat';
import type { Page } from '@playwright/test';

/**
 * E2E Tests for ClickUp Integration
 * 
 * Tests the complete integration flow:
 * 1. Integration gallery navigation
 * 2. Configure integration modal
 * 3. Sync modal with list selection
 * 4. Workspace structure loading
 * 5. Tree selection interactions
 * 6. Import configuration
 * 7. Sync triggering
 */

/**
 * Stub ClickUp integration backend endpoints
 */
async function stubClickUpBackend(page: Page): Promise<void> {
    // Mock notification endpoints to prevent 401 errors
    // These can be called from the layout/navbar
    await page.route('**/notifications**', async (route) => {
        const url = route.request().url();
        if (url.includes('/stats')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ unread: 0, total: 0 })
            });
        } else if (url.includes('/counts')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ unread: 0 })
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: [] })
            });
        }
    });

    // Mock workspace structure response
    const mockWorkspaceStructure = {
        workspace: {
            id: 'workspace_123',
            name: 'E2E Test Workspace'
        },
        spaces: [
            {
                id: 'space_1',
                name: 'Marketing',
                archived: false,
                folders: [
                    {
                        id: 'folder_1',
                        name: 'Q1 2025',
                        archived: false,
                        lists: [
                            { id: 'list_1', name: 'Social Media', task_count: 25, archived: false },
                            { id: 'list_2', name: 'Email Campaigns', task_count: 15, archived: false }
                        ]
                    }
                ],
                lists: [
                    { id: 'list_3', name: 'General Marketing', task_count: 10, archived: false }
                ]
            },
            {
                id: 'space_2',
                name: 'Engineering',
                archived: false,
                folders: [],
                lists: [
                    { id: 'list_4', name: 'Backend', task_count: 50, archived: false },
                    { id: 'list_5', name: 'Frontend', task_count: 40, archived: false }
                ]
            }
        ]
    };

    // Mock orgs endpoint (required by OrgAndProjectGate)
    await page.route('**/api/v1/orgs', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: '22222222-2222-4222-8222-222222222222',
                    name: 'E2E Org',
                    created_at: new Date().toISOString()
                }
            ])
        });
    });

    // Mock projects endpoint (required by OrgAndProjectGate)
    await page.route('**/api/v1/projects**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: '33333333-3333-4333-8333-333333333333',
                    name: 'E2E Project',
                    org_id: '22222222-2222-4222-8222-222222222222',
                    created_at: new Date().toISOString()
                }
            ])
        });
    });

    // Mock available integrations
    await page.route('**/api/v1/integrations/available', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    name: 'clickup',
                    displayName: 'ClickUp',
                    description: 'Import tasks, lists, and workspaces from ClickUp',
                    capabilities: {
                        supportsImport: true,
                        supportsWebhooks: false,
                        supportsBidirectionalSync: false,
                        requiresOAuth: false,
                        supportsIncrementalSync: false
                    },
                    requiredSettings: ['api_token', 'workspace_id'],
                    optionalSettings: {}
                }
            ])
        });
    });

    // Track integration state (starts as not configured)
    let integrationConfigured = false;
    let integrationEnabled = true; // Enable by default after configuration

    // Mock configured integrations list
    await page.route('**/api/v1/integrations?**', async (route) => {
        const method = route.request().method();
        if (method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(integrationConfigured ? [
                    {
                        id: 'integration_123',
                        name: 'clickup',
                        display_name: 'ClickUp',
                        enabled: integrationEnabled,
                        settings: {
                            api_token: '***',
                            workspace_id: 'workspace_123'
                        },
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        last_sync_at: null,
                        last_sync_status: null,
                        error_message: null
                    }
                ] : [])
            });
        } else {
            await route.continue();
        }
    });

    // Mock create integration
    await page.route('**/api/v1/integrations', async (route) => {
        const method = route.request().method();
        if (method === 'POST') {
            const body = route.request().postDataJSON();
            integrationConfigured = true; // Mark as configured after POST
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'integration_123',
                    name: body.name,
                    display_name: 'ClickUp',
                    enabled: true,
                    settings: body.settings,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_sync_at: null,
                    last_sync_status: null,
                    error_message: null
                })
            });
        } else {
            await route.continue();
        }
    });

    // Mock workspace structure endpoint
    await page.route('**/api/v1/integrations/clickup/structure**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockWorkspaceStructure)
        });
    });

    // Mock sync trigger endpoint
    await page.route('**/api/v1/integrations/clickup/sync', async (route) => {
        const method = route.request().method();
        if (method === 'POST') {
            const body = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'Sync started successfully',
                    integration_id: 'integration_123',
                    started_at: new Date().toISOString(),
                    config: body
                })
            });
        } else {
            await route.continue();
        }
    });

    // Mock get/update single integration
    await page.route('**/api/v1/integrations/clickup', async (route) => {
        const method = route.request().method();
        if (method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(integrationConfigured ? {
                    id: 'integration_123',
                    name: 'clickup',
                    display_name: 'ClickUp',
                    enabled: integrationEnabled,
                    settings: {
                        api_token: '***',
                        workspace_id: 'workspace_123'
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_sync_at: new Date().toISOString(),
                    last_sync_status: 'success',
                    error_message: null
                } : null)
            });
        } else if (method === 'PUT') {
            const body = route.request().postDataJSON();
            if ('enabled' in body) {
                integrationEnabled = body.enabled; // Update enabled state
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    id: 'integration_123',
                    name: 'clickup',
                    display_name: 'ClickUp',
                    enabled: integrationEnabled,
                    settings: body.settings || {
                        api_token: '***',
                        workspace_id: 'workspace_123'
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_sync_at: new Date().toISOString(),
                    last_sync_status: 'success',
                    error_message: null
                })
            });
        } else {
            await route.continue();
        }
    });
}

/**
 * Helper to configure ClickUp integration through the UI
 */
async function configureIntegration(page: Page): Promise<void> {
    // Find ClickUp card and click Connect
    const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
    await expect(clickupCard).toBeVisible();

    const connectButton = clickupCard.getByRole('button', { name: /connect/i });
    await connectButton.click();

    // Wait for modal to open
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // Fill configuration form
    await page.getByLabel(/api token/i).fill('test_api_token_123');
    await page.getByLabel(/workspace id/i).fill('workspace_123');
    await page.getByRole('button', { name: /save|connect/i }).click();

    // Wait for modal to close and page to reload with configured integration
    await expect(modal).toBeHidden({ timeout: 5_000 });
    // Give UI time to update with new integration state
    await page.waitForTimeout(1000);
}

test.describe('ClickUp Integration - Gallery', () => {
    test('displays ClickUp integration card in gallery', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Seed config and stub backend', async () => {
            await stubClickUpBackend(page);
            await ensureActiveOrgAndProject(page);
        });

        await test.step('Navigate to integrations page', async () => {
            await navigate(page, '/admin/integrations');
            await expect(page).toHaveURL(/\/admin\/integrations/);
        });

        await test.step('Verify ClickUp card displays', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            await expect(clickupCard).toBeVisible();
            await expect(clickupCard).toContainText('Import tasks, lists, and workspaces');
        });

        await test.step('Verify capabilities badges', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            // Use exact match for badge to avoid matching description text
            await expect(clickupCard.locator('.badge', { hasText: 'Import' })).toBeVisible();
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('integrations gallery', consoleErrors, pageErrors);
        });
    });
});

test.describe('ClickUp Integration - Configuration', () => {
    test('opens configuration modal and saves settings', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Seed config and stub backend', async () => {
            await ensureActiveOrgAndProject(page);
            await stubClickUpBackend(page);
        });

        await test.step('Navigate to integrations page', async () => {
            await navigate(page, '/admin/integrations');
        });

        await test.step('Click Connect button', async () => {
            // Find the ClickUp card first
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            await expect(clickupCard).toBeVisible();

            // Find Connect button within the card
            const connectButton = clickupCard.getByRole('button', { name: /connect/i });
            await expect(connectButton).toBeVisible({ timeout: 10_000 });
            await connectButton.click();
        });

        await test.step('Verify modal opened', async () => {
            // Modal uses native <dialog> element
            const modal = page.getByRole('dialog');
            await expect(modal).toBeVisible();
            await expect(modal.getByRole('heading', { name: /connect clickup/i })).toBeVisible();
        });

        await test.step('Fill configuration form', async () => {
            await page.getByLabel(/api token/i).fill('test_api_token_123');
            await page.getByLabel(/workspace id/i).fill('workspace_123');
        });

        await test.step('Save configuration', async () => {
            // Button text is "Connect" not "Save" in the modal
            await page.getByRole('button', { name: /connect/i }).last().click();
        });

        await test.step('Verify modal closed', async () => {
            const modal = page.getByRole('dialog');
            await expect(modal).toBeHidden({ timeout: 5_000 });
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('configure integration', consoleErrors, pageErrors);
        });
    });
});

test.describe('ClickUp Integration - Sync Modal', () => {
    test('opens sync modal and loads workspace structure', async ({ page, consoleErrors, pageErrors }) => {
        // Configure integration first
        await test.step('Seed config and stub backend', async () => {
            await ensureActiveOrgAndProject(page);
            await stubClickUpBackend(page);
        });

        await test.step('Navigate to integrations page', async () => {
            await navigate(page, '/admin/integrations');
        });

        await test.step('Configure integration', async () => {
            await configureIntegration(page);
        });

        await test.step('Verify integration is configured and enabled', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            await expect(clickupCard.locator('.badge', { hasText: 'Active' })).toBeVisible();
        });

        await test.step('Click Sync Now button', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            const syncButton = clickupCard.getByRole('button', { name: /sync now/i });
            await expect(syncButton).toBeVisible({ timeout: 10_000 });
            await syncButton.click();
        });

        await test.step('Verify sync modal opened', async () => {
            const syncModal = page.locator('.modal.modal-open', { has: page.getByText('Sync ClickUp Workspace') });
            await expect(syncModal).toBeVisible();
        });

        await test.step('Verify loading state then structure loads', async () => {
            // Initially shows loading
            const loading = page.locator('.loading-spinner').first();
            await expect(loading).toBeVisible();

            // Then structure appears
            await expect(loading).toBeHidden({ timeout: 5_000 });
            await expect(page.getByText('Marketing')).toBeVisible();
            await expect(page.getByText('Engineering')).toBeVisible();
        });

        await test.step('Verify steps indicator', async () => {
            const steps = page.locator('.steps');
            await expect(steps).toBeVisible();
            await expect(steps.getByText('Select Lists')).toBeVisible();
            await expect(steps.getByText('Configure')).toBeVisible();
            await expect(steps.getByText('Import')).toBeVisible();
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('sync modal open', consoleErrors, pageErrors);
        });
    });

    test('selects lists and proceeds through wizard', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Seed config and stub backend', async () => {
            await ensureActiveOrgAndProject(page);
            await stubClickUpBackend(page);
        });

        await test.step('Navigate to integrations page', async () => {
            await navigate(page, '/admin/integrations');
        });

        await test.step('Configure integration', async () => {
            await configureIntegration(page);
        });

        await test.step('Open sync modal', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            const syncButton = clickupCard.getByRole('button', { name: /sync now/i });
            await expect(syncButton).toBeVisible({ timeout: 10_000 });
            await syncButton.click();
        });

        await test.step('Wait for structure to load', async () => {
            await page.getByText('Marketing').waitFor({ state: 'visible', timeout: 10_000 });
        });

        await test.step('Verify Next button is disabled initially', async () => {
            const nextButton = page.getByRole('button', { name: /^next$/i });
            await expect(nextButton).toBeDisabled();
        });

        await test.step('Expand Marketing space', async () => {
            const chevron = page.locator('.btn-square', {
                has: page.locator('span[class*="lucide--chevron"]')
            }).first();
            await chevron.click();
        });

        await test.step('Select a list', async () => {
            const socialMediaCheckbox = page.locator('input[type="checkbox"]', {
                has: page.locator(':text("Social Media")')
            }).or(page.locator('.list-row:has-text("Social Media") input[type="checkbox"]')).first();

            // If the direct approach doesn't work, click the row
            const socialMediaRow = page.locator('div:has-text("Social Media")').filter({ hasText: 'tasks' }).first();
            await socialMediaRow.click();

            // Verify Next button is now enabled
            const nextButton = page.getByRole('button', { name: /^next$/i });
            await expect(nextButton).toBeEnabled({ timeout: 2_000 });
        });

        await test.step('Click Next to proceed to configure step', async () => {
            await page.getByRole('button', { name: /^next$/i }).click();
        });

        await test.step('Verify configure step displays', async () => {
            await expect(page.getByText('Include completed/archived tasks')).toBeVisible();
            await expect(page.getByText('Batch size')).toBeVisible();
        });

        await test.step('Verify Back button works', async () => {
            await page.getByRole('button', { name: /back/i }).click();
            await expect(page.getByText('Marketing')).toBeVisible();

            // Go back to configure
            await page.getByRole('button', { name: /^next$/i }).click();
        });

        await test.step('Adjust configuration', async () => {
            const includeArchived = page.getByRole('checkbox', { name: /include/i });
            await includeArchived.check();

            // Adjust batch size slider
            const slider = page.locator('input[type="range"]');
            await slider.fill('200');
        });

        await test.step('Start import', async () => {
            await page.getByRole('button', { name: /start import/i }).click();
        });

        await test.step('Verify progress step displays', async () => {
            await expect(page.getByText(/importing tasks/i)).toBeVisible();
            await expect(page.locator('.loading-spinner')).toBeVisible();
        });

        await test.step('Verify completion step displays', async () => {
            await expect(page.getByText(/import started successfully/i)).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Close modal', async () => {
            await page.getByRole('button', { name: /done/i }).click();
            const modal = page.locator('.modal.modal-open');
            await expect(modal).toBeHidden({ timeout: 2_000 });
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('sync wizard flow', consoleErrors, pageErrors);
        });
    });

    test('validates list selection requirement', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Seed config and stub backend', async () => {
            await ensureActiveOrgAndProject(page);
            await stubClickUpBackend(page);
        });

        await test.step('Navigate to integrations page', async () => {
            await navigate(page, '/admin/integrations');
        });

        await test.step('Configure integration', async () => {
            await configureIntegration(page);
        });

        await test.step('Open sync modal', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            const syncButton = clickupCard.getByRole('button', { name: /sync now/i });
            await syncButton.click();
        });

        await test.step('Wait for structure to load', async () => {
            await page.getByText('Marketing').waitFor({ state: 'visible', timeout: 10_000 });
        });

        await test.step('Verify Next button is disabled with no selection', async () => {
            const nextButton = page.getByRole('button', { name: /^next$/i });
            await expect(nextButton).toBeDisabled();
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('sync validation', consoleErrors, pageErrors);
        });
    });

    test('uses Select All and Deselect All buttons', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Seed config and stub backend', async () => {
            await ensureActiveOrgAndProject(page);
            await stubClickUpBackend(page);
        });

        await test.step('Navigate to integrations page', async () => {
            await navigate(page, '/admin/integrations');
        });

        await test.step('Configure integration', async () => {
            await configureIntegration(page);
        });

        await test.step('Open sync modal', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            const syncButton = clickupCard.getByRole('button', { name: /sync now/i });
            await syncButton.click();
        });

        await test.step('Wait for structure to load', async () => {
            await page.getByText('Marketing').waitFor({ state: 'visible', timeout: 10_000 });
        });

        await test.step('Click Select All button', async () => {
            await page.getByRole('button', { name: /select all/i }).click();

            // Next button should be enabled
            const nextButton = page.getByRole('button', { name: /^next$/i });
            await expect(nextButton).toBeEnabled({ timeout: 2_000 });
        });

        await test.step('Click Deselect All button', async () => {
            await page.getByRole('button', { name: /deselect all/i }).click();

            // Next button should be disabled again
            const nextButton = page.getByRole('button', { name: /^next$/i });
            await expect(nextButton).toBeDisabled({ timeout: 2_000 });
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('select all buttons', consoleErrors, pageErrors);
        });
    });
});

test.describe('ClickUp Integration - Error Handling', () => {
    test('displays error when structure fails to load', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Seed config and stub backend', async () => {
            await ensureActiveOrgAndProject(page);
            await stubClickUpBackend(page);
        });

        await test.step('Navigate to integrations page', async () => {
            await navigate(page, '/admin/integrations');
        });

        await test.step('Configure integration', async () => {
            await configureIntegration(page);
        });

        // Override structure endpoint to return error AFTER configuration
        await page.route('**/api/v1/integrations/clickup/structure**', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'Failed to fetch workspace structure',
                    error: 'Internal Server Error'
                })
            });
        });

        await test.step('Open sync modal', async () => {
            const clickupCard = page.locator('.card', { has: page.getByText('ClickUp') });
            const syncButton = clickupCard.getByRole('button', { name: /sync now/i });
            await syncButton.click();
        });

        await test.step('Verify error alert displays', async () => {
            const errorAlert = page.locator('.alert-error');
            await expect(errorAlert).toBeVisible({ timeout: 10_000 });
        });

        await test.step('Verify error can be dismissed', async () => {
            const dismissButton = page.locator('.alert-error button');
            await dismissButton.click();
            const errorAlert = page.locator('.alert-error');
            await expect(errorAlert).toBeHidden();
        });

        // Note: Console errors expected here due to API failure
    });
});
