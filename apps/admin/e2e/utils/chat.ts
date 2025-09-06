import type { Page } from '@playwright/test';

/** Inject a deterministic dev auth state if one not already present */
export async function ensureDevAuth(page: Page): Promise<void> {
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

/** Stub minimal chat backend endpoints (conversations list, hydrate, SSE stream) */
export async function stubChatBackend(page: Page, opts: { uuid?: string } = {}): Promise<string> {
    const uuid = opts.uuid || '11111111-1111-4111-8111-111111111111';
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
    return uuid;
}