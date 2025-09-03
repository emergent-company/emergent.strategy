import { expect } from '@playwright/test';
import { test } from '../fixtures/consoleGate';

test.describe('Chat - new conversation flow', () => {
    async function injectDevAuth(page: import('@playwright/test').Page) {
        // If tests run without a real token, ensure the app sees an auth state so GuardedAdmin passes
        await page.addInitScript(() => {
            try {
                const STORAGE_KEY = '__nexus_auth_v1__';
                const raw = localStorage.getItem(STORAGE_KEY);
                const hasValid = (() => {
                    if (!raw) return false;
                    try {
                        const parsed = JSON.parse(raw) as { expiresAt?: number };
                        return !!parsed?.expiresAt && Date.now() < parsed.expiresAt!;
                    } catch { return false; }
                })();
                if (!hasValid) {
                    const now = Date.now();
                    const expiresAt = now + 60 * 60 * 1000; // 1h
                    const state = { accessToken: 'dev-e2e-token', idToken: 'dev-e2e-token', expiresAt };
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                }
            } catch {
                // ignore storage errors
            }
        });
    }

    async function stubChatApi(page: import('@playwright/test').Page) {
        const uuid = '11111111-1111-4111-8111-111111111111';
        // Conversations list
        await page.route(/\/chat\/conversations$/, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ shared: [], private: [] }),
            });
        });
        // Conversation hydrate
        await page.route(new RegExp(`/chat/${uuid.replaceAll('-', '\\-')}$`), async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    conversation: {
                        id: uuid,
                        title: 'Stubbed conversation',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        isPrivate: false,
                        messages: [
                            // The local UI already appends the user & assistant, this just ensures hydration works
                        ],
                    },
                }),
            });
        });
        // SSE stream
        await page.route(/\/chat\/stream$/, async (route) => {
            const sse = [
                `data: ${JSON.stringify({ type: 'meta', conversationId: uuid })}`,
                `data: ${JSON.stringify({ type: 'token', token: ' Pong' })}`,
                `data: ${JSON.stringify({ type: 'done' })}`,
                '',
            ].join('\n\n');
            await route.fulfill({
                status: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    Connection: 'keep-alive',
                    'Cache-Control': 'no-cache',
                },
                body: sse,
            });
        });
        // Catch-all for other API requests to localhost:3001 to avoid 401s in tests
        await page.route('**://localhost:3001/**', async (route) => {
            const url = route.request().url();
            if (/\/chat\/stream$/.test(url)) return route.fallback();
            if (/\/chat\/conversations$/.test(url)) return route.fallback();
            if (/\/chat\/[0-9a-f-]{36}$/.test(url)) return route.fallback();
            const method = route.request().method();
            if (method === 'GET') {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
            } else {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
            }
        });
    }

    test('navigates to /admin/apps/chat/c/new without 404', async ({ page, consoleErrors, pageErrors }) => {
        await injectDevAuth(page);
        await stubChatApi(page);
        await page.goto('/admin/apps/chat/c/new', { waitUntil: 'domcontentloaded' });

        // Should be on the conversation route
        await expect(page).toHaveURL(/\/admin\/apps\/chat\/c\/new/);
        // Page title should be visible (proves we're not on 404/login)
        await expect(page.getByText(/AI Chat/i).first()).toBeVisible();
        // Either CTA composer (Chat Home pattern) or the in-conversation composer is visible
        const ctaComposer = page.getByPlaceholder(/let us know what you need/i);
        const convoComposer = page.getByPlaceholder(/ask a question/i);
        await Promise.any([
            ctaComposer.waitFor({ state: 'visible', timeout: 10000 }),
            convoComposer.waitFor({ state: 'visible', timeout: 10000 }),
        ]);

        // Gate: no console/page errors
        expect(consoleErrors, `console errors on new chat:\n${consoleErrors.join('\n')}`).toHaveLength(0);
        expect(pageErrors, `page errors on new chat:\n${pageErrors.join('\n')}`).toHaveLength(0);
    });

    test('sends first message by filling composer and clicking Send', async ({ page, consoleErrors, pageErrors }) => {
        await injectDevAuth(page);
        await stubChatApi(page);
        const prompt = 'E2E manual send ping';
        await page.goto(`/admin/apps/chat/c/new`, { waitUntil: 'domcontentloaded' });

        // Fill the CTA composer textarea and click Send
        const ctaComposer = page.getByPlaceholder(/let us know what you need/i);
        await ctaComposer.waitFor({ state: 'visible', timeout: 10000 });
        await ctaComposer.fill(prompt);
        await page.getByRole('button', { name: /send/i }).click();

        // The UI optimistically appends the user message; wait for a user chat bubble to appear with our prompt
        const userBubble = page.locator('.chat.chat-end .chat-bubble').first();
        await expect(userBubble).toBeVisible({ timeout: 20000 });
        await expect(userBubble).toContainText(new RegExp(prompt, 'i'));

        // Gate: no console/page errors
        expect(consoleErrors, `console errors on manual send:\n${consoleErrors.join('\n')}`).toHaveLength(0);
        expect(pageErrors, `page errors on manual send:\n${pageErrors.join('\n')}`).toHaveLength(0);
    });
});
