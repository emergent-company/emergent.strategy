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
    // Debug request logging for orgs/projects
    page.on('request', (req) => {
        const url = req.url();
        if (/\/orgs(\b|[?/])/.test(url) || /\/projects(\b|[?/])/.test(url)) {
            console.log('[req]', req.method(), url);
        }
    });
    // Ensure org + project active in config BEFORE app scripts run
    await page.addInitScript(() => {
        try {
            // Current app config key (see src/contexts/config.tsx). Keep legacy key write for backward compatibility.
            const ACTIVE_KEYS = ['__NEXUS_CONFIG_v3.0__', '__nexus_config_v1__'];
            for (const CONFIG_KEY of ACTIVE_KEYS) {
                const raw = localStorage.getItem(CONFIG_KEY);
                let state: any = raw ? JSON.parse(raw) : {};
                if (!state.activeOrgId) {
                    state.activeOrgId = '22222222-2222-4222-8222-222222222222';
                    state.activeOrgName = 'E2E Org';
                }
                if (!state.activeProjectId) {
                    state.activeProjectId = '33333333-3333-4333-8333-333333333333';
                    state.activeProjectName = 'E2E Project';
                }
                localStorage.setItem(CONFIG_KEY, JSON.stringify(state));
            }
            // Monkey-patch fetch for orgs/projects to avoid race with route interception (debug fallback)
            const originalFetch = window.fetch.bind(window);
            window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
                try {
                    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
                    if (/\/orgs(\?|$)/.test(url) && (!init || (init.method || 'GET') === 'GET')) {
                        console.log('[fetch-patch] /orgs responded');
                        return Promise.resolve(new Response(JSON.stringify([
                            { id: '22222222-2222-4222-8222-222222222222', name: 'E2E Org' }
                        ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                    }
                    if (/\/projects(\?|$)/.test(url) && (!init || (init.method || 'GET') === 'GET')) {
                        console.log('[fetch-patch] /projects responded');
                        return Promise.resolve(new Response(JSON.stringify([
                            { id: '33333333-3333-4333-8333-333333333333', name: 'E2E Project', orgId: '22222222-2222-4222-8222-222222222222' }
                        ]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                    }
                } catch { /* ignore */ }
                return originalFetch(input as any, init);
            };
        } catch { /* ignore */ }
    });
    // Org & project listing endpoints
    await page.route('**/orgs', async (route) => {
        const method = route.request().method();
        const origin = route.request().headers()['origin'] || '*';
        if (method === 'OPTIONS') {
            console.log('[stub] CORS preflight /orgs');
            return route.fulfill({
                status: 204, headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': 'true',
                    'Access-Control-Allow-Headers': 'authorization,content-type,x-org-id,x-project-id',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                }
            });
        }
        console.log('[stub] GET /orgs');
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify([
                { id: '22222222-2222-4222-8222-222222222222', name: 'E2E Org' }
            ])
        });
    });
    await page.route('**/projects*', async (route) => {
        const method = route.request().method();
        const origin = route.request().headers()['origin'] || '*';
        if (method === 'OPTIONS') {
            console.log('[stub] CORS preflight /projects');
            return route.fulfill({
                status: 204, headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Credentials': 'true',
                    'Access-Control-Allow-Headers': 'authorization,content-type,x-org-id,x-project-id',
                    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
                }
            });
        }
        console.log('[stub] GET /projects');
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify([
                { id: '33333333-3333-4333-8333-333333333333', name: 'E2E Project', orgId: '22222222-2222-4222-8222-222222222222' }
            ])
        });
    });
    await page.route(/\/chat\/conversations$/, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shared: [], private: [] }) }));
    await page.route(new RegExp(`/chat/${uuid.replaceAll('-', '\\-')}$`), async (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            conversation: {
                id: uuid, title: 'Stubbed conversation', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isPrivate: false, messages: [
                    { id: 'm_user1', role: 'user', content: 'Restored user message', createdAt: new Date().toISOString() },
                    { id: 'm_assist1', role: 'assistant', content: ' Pong', createdAt: new Date().toISOString() }
                ]
            }
        }),
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
    // Same-origin PATCH / DELETE (rename / delete) stubs to avoid 404 console errors
    await page.route('**/chat/*', async (route) => {
        const url = route.request().url();
        if (/\/chat\/stream$/.test(url) || /\/chat\/conversations$/.test(url) || /\/chat\/[0-9a-f-]{36}$/.test(url)) return route.fallback();
        const method = route.request().method();
        if (method === 'PATCH' || method === 'DELETE') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        }
        return route.fallback();
    });
    await page.route('**://localhost:3001/**', async (route) => {
        const url = route.request().url();
        if (/\/chat\/stream$/.test(url) || /\/chat\/conversations$/.test(url) || /\/chat\/[0-9a-f-]{36}$/.test(url)) return route.fallback();
        const method = route.request().method();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(method === 'GET' ? { ok: true } : { status: 'ok' }) });
    });
    return uuid;
}

/** Force-set active org & project AFTER auth (idempotent) */
export async function seedOrgProject(page: Page): Promise<void> {
    await page.evaluate(() => {
        try {
            const ACTIVE_KEYS = ['__NEXUS_CONFIG_v3.0__', '__nexus_config_v1__'];
            for (const CONFIG_KEY of ACTIVE_KEYS) {
                const raw = localStorage.getItem(CONFIG_KEY);
                const state: any = raw ? JSON.parse(raw) : {};
                state.activeOrgId = state.activeOrgId || '22222222-2222-4222-8222-222222222222';
                state.activeOrgName = state.activeOrgName || 'E2E Org';
                state.activeProjectId = state.activeProjectId || '33333333-3333-4333-8333-333333333333';
                state.activeProjectName = state.activeProjectName || 'E2E Project';
                localStorage.setItem(CONFIG_KEY, JSON.stringify(state));
            }
        } catch { /* ignore */ }
    });
}

/** Ensure org + project network stubs and config (lightweight replacement for legacy seed assumptions) */
export async function ensureActiveOrgAndProject(page: Page, opts: { orgId?: string; projectId?: string } = {}): Promise<void> {
    const orgId = opts.orgId || '22222222-2222-4222-8222-222222222222';
    const projectId = opts.projectId || '33333333-3333-4333-8333-333333333333';
    await page.addInitScript(({ _orgId, _projectId }) => {
        try {
            const CONFIG_KEYS = ['__NEXUS_CONFIG_v3.0__', '__nexus_config_v1__'];
            for (const key of CONFIG_KEYS) {
                const raw = localStorage.getItem(key);
                const state: any = raw ? JSON.parse(raw) : {};
                state.activeOrgId = state.activeOrgId || _orgId;
                state.activeOrgName = state.activeOrgName || 'E2E Org';
                state.activeProjectId = state.activeProjectId || _projectId;
                state.activeProjectName = state.activeProjectName || 'E2E Project';
                localStorage.setItem(key, JSON.stringify(state));
            }
        } catch { /* ignore */ }
    }, { _orgId: orgId, _projectId: projectId });

    // Stub orgs/projects if not already handled
    await page.route('**/orgs', async (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: orgId, name: 'E2E Org' }]) });
        }
        return route.fallback();
    });
    await page.route('**/projects*', async (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: projectId, name: 'E2E Project', orgId }]) });
        }
        return route.fallback();
    });
}