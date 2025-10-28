import { test, expect } from '../fixtures/consoleGate';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { ensureOrgAndProject } from '../helpers/test-user';

/**
 * NOTE: Auth is now established via the dedicated auth.setup.ts (OIDC/Zitadel UI login or token injection).
 * This spec assumes storageState already contains a valid session. Uses real backend API for integration testing.
 */

test.describe('Chat - new conversation flow', () => {
    let testOrgId: string;
    let testProjectId: string;

    // Ensure org and project exist in database, store IDs for test contexts
    test.beforeAll(async ({ browser }) => {
        const storageFile = 'apps/admin/e2e/.auth/state.json';
        const context = await browser.newContext({ storageState: storageFile });
        const page = await context.newPage();
        const { orgId, projectId } = await ensureOrgAndProject(page);
        testOrgId = orgId;
        testProjectId = projectId;
        await context.close();
    });

    test('navigates to /admin/apps/chat/c/new without 404', async ({ page, consoleErrors, pageErrors }) => {
        // Set org/project in this page's localStorage before navigating
        await page.addInitScript(({ orgId, projectId }) => {
            window.localStorage.setItem('activeOrgId', orgId);
            window.localStorage.setItem('activeProjectId', projectId);
        }, { orgId: testOrgId, projectId: testProjectId });

        await test.step('Navigate to new conversation route', async () => {
            await navigate(page, '/admin/apps/chat/c/new');
            await expect(page).toHaveURL(/\/admin\/apps\/chat\/c\/new/);
        });

        await test.step('Expect chat UI heading and composer present', async () => {
            // Accept either the hero heading or the contextual h1
            const heroHeading = page.getByRole('heading', { name: /ask your knowledge base/i }).first();
            const breadcrumbLabel = page.getByText(/AI Chat/i).first();
            await Promise.any([
                heroHeading.waitFor({ state: 'visible', timeout: 10_000 }),
                breadcrumbLabel.waitFor({ state: 'visible', timeout: 10_000 }),
            ]);
            const ctaComposer = page.getByPlaceholder(/let us know what you need/i);
            const convoComposer = page.getByPlaceholder(/ask a question/i);
            await Promise.any([
                ctaComposer.waitFor({ state: 'visible', timeout: 10_000 }),
                convoComposer.waitFor({ state: 'visible', timeout: 10_000 }),
            ]);
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('new chat route', consoleErrors, pageErrors);
        });
    });

    test('sends first message via CTA composer + SSE stream', async ({ page, consoleErrors, pageErrors }) => {
        // Set org/project in this page's localStorage before navigating
        await page.addInitScript(({ orgId, projectId }) => {
            window.localStorage.setItem('activeOrgId', orgId);
            window.localStorage.setItem('activeProjectId', projectId);
        }, { orgId: testOrgId, projectId: testProjectId });

        const prompt = 'E2E manual send ping';

        await test.step('Open new chat route', async () => {
            await navigate(page, '/admin/apps/chat/c/new');
        });

        await test.step('Fill composer and send', async () => {
            const ctaComposer = page.getByPlaceholder(/let us know what you need/i);
            await ctaComposer.waitFor({ state: 'visible', timeout: 10_000 });
            await ctaComposer.fill(prompt);
            await page.getByRole('button', { name: /send/i }).click();
        });

        await test.step('Optimistic user bubble appears with content', async () => {
            const userBubble = page.locator('.chat.chat-end .chat-bubble').first();
            await expect(userBubble).toBeVisible({ timeout: 20_000 });
            await expect(userBubble).toContainText(new RegExp(prompt, 'i'));
        });

        await test.step('No console or page errors', async () => {
            expectNoRuntimeErrors('chat send first message', consoleErrors, pageErrors);
        });
    });

    test.skip('chat lifecycle (auto-send + delete) – covered in chat.lifecycle.spec.ts', () => { /* placeholder */ });
});
