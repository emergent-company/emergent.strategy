import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { stubChatBackend, seedOrgProject } from '../utils/chat';

/**
 * NOTE: Auth is now established via the dedicated auth.setup.ts (OIDC/Zitadel UI login or token injection).
 * This spec assumes storageState already contains a valid session. Do NOT inject dev auth here; that path
 * hides real regressions in hosted login redirects.
 */

test.describe('Chat - new conversation flow', () => {

    test('navigates to /admin/apps/chat/c/new without 404', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Network stubs (chat) + seed config', async () => {
            await stubChatBackend(page);
            await seedOrgProject(page); // ensure active org/project before navigation
        });

        await test.step('Navigate to new conversation route', async () => {
            await navigate(page, '/admin/apps/chat/c/new');
            await expect(page).toHaveURL(/\/admin\/apps\/chat\/c\/new/);
        });

        await test.step('Expect chat UI heading and composer present', async () => {
            // Debug: verify config storage seeded
            const cfg = await page.evaluate(() => ({
                v3: localStorage.getItem('__NEXUS_CONFIG_v3.0__'),
                legacy: localStorage.getItem('__nexus_config_v1__')
            }));
            console.log('Config debug', cfg); // intentional debug
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
        const prompt = 'E2E manual send ping';

        await test.step('Network stubs (chat) + seed config', async () => {
            await stubChatBackend(page);
            await seedOrgProject(page);
        });

        await test.step('Open new chat route', async () => {
            await navigate(page, '/admin/apps/chat/c/new');
        });

        await test.step('Fill composer and send', async () => {
            const cfg = await page.evaluate(() => ({
                v3: localStorage.getItem('__NEXUS_CONFIG_v3.0__'),
                legacy: localStorage.getItem('__nexus_config_v1__')
            }));
            console.log('Config debug (send step)', cfg); // intentional debug
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

    test.skip('chat lifecycle (auto-send + delete) – to be implemented against real backend', () => { /* placeholder */ });
});
