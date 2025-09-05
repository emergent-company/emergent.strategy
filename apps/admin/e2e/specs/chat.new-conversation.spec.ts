import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';

test.describe('Chat - new conversation flow', () => {
    // Navigation handled via shared navigate() helper.
    // Inject a deterministic dev auth state when real login not present.
    async function injectDevAuth(page: import('@playwright/test').Page) {
        await page.addInitScript(() => {
            try {
                const STORAGE_KEY = '__nexus_auth_v1__';
                const raw = localStorage.getItem(STORAGE_KEY);
                const valid = (() => {
                    if (!raw) return false;
                    try { const parsed = JSON.parse(raw) as { expiresAt?: number }; return !!parsed?.expiresAt && Date.now() < parsed.expiresAt!; } catch { return false; }
                })();
                if (!valid) {
                    const now = Date.now();
                    const expiresAt = now + 60 * 60 * 1000;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'dev-e2e-token', idToken: 'dev-e2e-token', expiresAt }));
                }
            } catch { /* ignore */ }
        });
    }

    // Network stubs so test does not depend on backend availability.
    async function stubChatApi(page: import('@playwright/test').Page) {
        const uuid = '11111111-1111-4111-8111-111111111111';
        await page.route(/\/chat\/conversations$/, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shared: [], private: [] }) }));
        await page.route(new RegExp(`/chat/${uuid.replaceAll('-', '\\-')}$`), async (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ conversation: { id: uuid, title: 'Stubbed conversation', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isPrivate: false, messages: [] } }),
        }));
        await page.route(/\/chat\/stream$/, async (route) => {
            const sse = [
                `data: ${JSON.stringify({ type: 'meta', conversationId: uuid })}`,
                `data: ${JSON.stringify({ type: 'token', token: ' Pong' })}`,
                `data: ${JSON.stringify({ type: 'done' })}`,
                '',
            ].join('\n\n');
            await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'Cache-Control': 'no-cache' }, body: sse });
        });
        await page.route('**://localhost:3001/**', async (route) => {
            const url = route.request().url();
            if (/\/chat\/stream$/.test(url) || /\/chat\/conversations$/.test(url) || /\/chat\/[0-9a-f-]{36}$/.test(url)) return route.fallback();
            const method = route.request().method();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(method === 'GET' ? { ok: true } : { status: 'ok' }) });
        });
    }

    test('navigates to /admin/apps/chat/c/new without 404', async ({ page, consoleErrors, pageErrors }) => {
        await test.step('Auth + network stubs', async () => {
            await injectDevAuth(page);
            await stubChatApi(page);
        });

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
        const prompt = 'E2E manual send ping';

        await test.step('Auth + network stubs', async () => {
            await injectDevAuth(page);
            await stubChatApi(page);
        });

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
});
