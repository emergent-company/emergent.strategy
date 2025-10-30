import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { ensureActiveOrgAndProject } from '../utils/chat';

const MOCK_OBJECTS = [
    {
        id: 'obj-1',
        canonical_id: 'obj-1',
        name: 'Sprint Planning Meeting',
        type: 'Meeting',
        key: 'meeting-001',
        properties: { date: '2025-10-01', duration: '60min' },
        labels: ['quarterly', 'planning'],
        created_at: '2025-10-01T10:00:00Z',
        updated_at: '2025-10-01T10:00:00Z',
        deleted_at: null,
        version: 1,
        branch_id: null,
        org_id: '123',
        project_id: '456',
        supersedes_id: null,
        expires_at: null,
    },
    {
        id: 'obj-2',
        canonical_id: 'obj-2',
        name: 'Implement Authentication',
        type: 'Decision',
        key: 'decision-001',
        properties: { priority: 'high', status: 'approved' },
        labels: ['security'],
        created_at: '2025-10-02T14:00:00Z',
        updated_at: '2025-10-02T14:00:00Z',
        deleted_at: null,
        version: 1,
        branch_id: null,
        org_id: '123',
        project_id: '456',
        supersedes_id: null,
        expires_at: null,
    },
    {
        id: 'obj-3',
        canonical_id: 'obj-3',
        name: 'What is the deployment schedule?',
        type: 'Question',
        key: 'question-001',
        properties: { answered: false },
        labels: ['operations'],
        created_at: '2025-10-03T09:00:00Z',
        updated_at: '2025-10-03T09:00:00Z',
        deleted_at: null,
        version: 1,
        branch_id: null,
        org_id: '123',
        project_id: '456',
        supersedes_id: null,
        expires_at: null,
    },
];

const MOCK_TYPES = [
    { id: 'type-1', type: 'Meeting', source: 'template', description: 'Meeting object type' },
    { id: 'type-2', type: 'Decision', source: 'template', description: 'Decision object type' },
    { id: 'type-3', type: 'Question', source: 'template', description: 'Question object type' },
    { id: 'type-4', type: 'Person', source: 'template', description: 'Person object type' },
];

test.describe('Objects Page', () => {
    test.beforeEach(async ({ page }) => {
        await ensureActiveOrgAndProject(page);

        // Stub API responses
        await page.route('**/graph/objects/search**', async (route) => {
            const url = new URL(route.request().url());
            const type = url.searchParams.get('type');

            let items = MOCK_OBJECTS;
            if (type) {
                items = MOCK_OBJECTS.filter(obj => obj.type === type);
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ items, next_cursor: undefined }),
            });
        });

        await page.route('**/graph/objects/fts**', async (route) => {
            const url = new URL(route.request().url());
            const query = url.searchParams.get('q') || '';

            const items = MOCK_OBJECTS.filter(obj =>
                obj.name.toLowerCase().includes(query.toLowerCase())
            );

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ query, items, total: items.length, limit: 100 }),
            });
        });

        await page.route('**/type-registry/projects/**', async (route) => {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(MOCK_TYPES),
            });
        });
    });

    test('renders page with default state', async ({ page, consoleErrors, pageErrors }) => {
        await navigate(page, '/admin/objects');

        await test.step('Page title is visible', async () => {
            const title = page.getByRole('heading', { name: /objects/i, level: 1 });
            await expect(title).toBeVisible();
        });

        await test.step('Description is present', async () => {
            const description = page.getByText(/browse and manage all objects/i);
            await expect(description).toBeVisible();
        });

        await test.step('Table is visible with objects', async () => {
            const table = page.getByRole('table');
            await expect(table).toBeVisible();

            // Check for object keys in table (table shows keys, not names)
            for (const obj of MOCK_OBJECTS) {
                await expect(page.getByText(obj.key)).toBeVisible();
            }
        });

        await test.step('No runtime errors', async () => {
            expect(consoleErrors, `console errors: \n${consoleErrors.join('\n')}`).toHaveLength(0);
            expect(pageErrors, `page errors: \n${pageErrors.join('\n')}`).toHaveLength(0);
        });
    });

    test('search functionality works', async ({ page }) => {
        await navigate(page, '/admin/objects');

        await test.step('Wait for initial load', async () => {
            await expect(page.getByText('meeting-001')).toBeVisible();
        });

        await test.step('Enter search query', async () => {
            const searchInput = page.getByPlaceholder(/search objects/i);
            // Search for "decision" which appears in the key "decision-001"
            await searchInput.fill('decision');
            // Wait for debounce/filter to apply
            await page.waitForTimeout(500);
        });

        await test.step('Only matching object is visible', async () => {
            // Wait for the filtered result (searching by name should find the object key)
            await expect(page.getByText('decision-001')).toBeVisible();

            // Other objects should not be visible (with timeout to allow filter)
            await expect(page.getByText('meeting-001')).not.toBeVisible({ timeout: 2000 });
        });
    });

    // TODO: Fix dropdown interaction - dropdown closes immediately after opening
    test.skip('type filter works', async ({ page }) => {
        await navigate(page, '/admin/objects');

        await test.step('Wait for initial load', async () => {
            await expect(page.getByText('meeting-001')).toBeVisible();
        });

        await test.step('Open type filter dropdown and select Meeting type', async () => {
            const typeButton = page.getByRole('button', { name: /type filter/i });
            await typeButton.click();

            // Wait a bit for the dropdown to render
            await page.waitForTimeout(300);

            // Try to find the checkbox for Meeting type
            const meetingCheckbox = page.getByRole('checkbox').filter({ has: page.locator('text=Meeting') }).first();
            await meetingCheckbox.check();
        });

        await test.step('Verify filter applied', async () => {
            // Only Meeting type should be visible
            await expect(page.getByText('Sprint Planning Meeting')).toBeVisible();
            await expect(page.getByText('Implement Authentication')).not.toBeVisible({ timeout: 2000 });
        });
    });

    // TODO: View toggle feature not yet implemented in UI
    test.skip('view toggle switches between table and cards', async ({ page }) => {
        await navigate(page, '/admin/objects');

        await test.step('Default view is table', async () => {
            const table = page.getByRole('table');
            await expect(table).toBeVisible();
        });

        await test.step('Switch to card view', async () => {
            const cardViewButton = page.getByRole('button', { name: /card view/i });
            await cardViewButton.click();
        });

        await test.step('Card view is displayed', async () => {
            // Table should be hidden, cards should be visible
            const table = page.getByRole('table');
            await expect(table).not.toBeVisible();

            // Cards should have object keys (or names if cards display differently)
            // Using key since that's what we see in the table
            await expect(page.getByText('meeting-001')).toBeVisible();
        });

        await test.step('Switch back to table view', async () => {
            const tableViewButton = page.getByRole('button', { name: /table view/i });
            await tableViewButton.click();

            const table = page.getByRole('table');
            await expect(table).toBeVisible();
        });
    });

    test('bulk selection works', async ({ page }) => {
        await navigate(page, '/admin/objects');

        await test.step('Wait for objects to load', async () => {
            await expect(page.getByText('meeting-001')).toBeVisible();
        });

        await test.step('Select individual object', async () => {
            // Click the first checkbox in the table body
            const firstCheckbox = page.getByRole('table').locator('tbody tr:first-child input[type="checkbox"]');
            await firstCheckbox.check();
        });

        await test.step('Bulk actions bar appears', async () => {
            await expect(page.getByText(/1 selected/i)).toBeVisible();
            await expect(page.getByRole('button', { name: /delete/i })).toBeVisible();
            await expect(page.getByRole('button', { name: /accept/i })).toBeVisible();
        });

        await test.step('Select all objects', async () => {
            // Click the header checkbox
            const headerCheckbox = page.getByRole('table').locator('thead input[type="checkbox"]');
            await headerCheckbox.check();

            await expect(page.getByText(/3 selected/i)).toBeVisible();
        });
    });

    test('empty state when no objects', async ({ page }) => {
        // Override with empty response
        await page.route('**/graph/objects/search**', async (route) => {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ items: [], next_cursor: undefined }),
            });
        });

        await navigate(page, '/admin/objects');

        await test.step('Empty state message is visible', async () => {
            await expect(page.getByText(/no objects found.*extraction jobs/i)).toBeVisible();
        });
    });

    test('error state when API fails', async ({ page }) => {
        // Override with error response
        await page.route('**/graph/objects/search**', async (route) => {
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Internal server error' }),
            });
        });

        await navigate(page, '/admin/objects');

        await test.step('Error message is displayed', async () => {
            // The page should show an error state
            await expect(page.getByText(/failed to load objects/i).or(page.getByText(/error/i))).toBeVisible({ timeout: 5000 });
        });
    });

    test('ARIA structure is correct', async ({ page }) => {
        await navigate(page, '/admin/objects');

        await test.step('Main heading exists', async () => {
            const heading = page.getByRole('heading', { name: /objects/i, level: 1 });
            await expect(heading).toBeVisible();
        });

        await test.step('Table has proper structure', async () => {
            const table = page.getByRole('table');
            await expect(table).toBeVisible();

            // Check for column headers by text (daisyUI may affect ARIA roles)
            await expect(table.locator('thead th:has-text("Name")')).toBeVisible();
            await expect(table.locator('thead th:has-text("Type")')).toBeVisible();
        });

        await test.step('Search input is accessible', async () => {
            const searchInput = page.getByPlaceholder(/search objects/i);
            await expect(searchInput).toBeVisible();
            await expect(searchInput).toHaveAttribute('type', 'text');
        });
    });
});
