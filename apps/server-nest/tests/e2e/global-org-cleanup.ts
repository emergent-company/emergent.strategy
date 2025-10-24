import { afterAll, beforeAll } from 'vitest';
import { authHeader } from './auth-helpers';
import { createE2EContext, E2EContext } from './e2e-context';

// Global safety net + automatic tracking of created org IDs by intercepting fetch.
let ctx: E2EContext;
const trackedOrgIds = new Set<string>();
let originalFetch: typeof fetch;

function isUUID(v: string) { return /^[0-9a-fA-F-]{36}$/.test(v); }

beforeAll(async () => {
    ctx = await createE2EContext('global-org');
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>): Promise<Response> => {
        const req = new Request(args[0] as any, args[1] as any);
        const method = (req.method || 'GET').toUpperCase();
        const url = req.url;
        const isOrgCreate = method === 'POST' && /\/orgs(?:\/?$)/.test(new URL(url).pathname);
        const isOrgDelete = method === 'DELETE' && /\/orgs\/.+/.test(new URL(url).pathname);
        const res = await originalFetch(req);
        try {
            if (isOrgCreate && res.status === 201) {
                const clone = res.clone();
                const data = await clone.json().catch(() => null);
                const id = data?.id;
                if (typeof id === 'string' && isUUID(id)) trackedOrgIds.add(id);
            } else if (isOrgDelete) {
                const pathParts = new URL(url).pathname.split('/');
                const maybeId = pathParts[pathParts.length - 1];
                if (isUUID(maybeId)) trackedOrgIds.delete(maybeId);
            }
        } catch { /* swallow tracking errors */ }
        return res;
    }) as typeof fetch;
});

afterAll(async () => {
    try {
        // Safety check: if context creation failed, nothing to cleanup
        if (!ctx || !ctx.baseUrl) {
            if (originalFetch) globalThis.fetch = originalFetch;
            return;
        }

        // Attempt explicit deletion of any still-tracked orgs
        await Promise.all(Array.from(trackedOrgIds).map(async id => {
            try { await originalFetch(`${ctx.baseUrl}/orgs/${id}`, { method: 'DELETE', headers: authHeader('all', 'global-org') }); } catch { /* ignore */ }
        }));
        // Fallback heuristic scan for pattern-based names (legacy safety net)
        const list = await originalFetch(`${ctx.baseUrl}/orgs`, { headers: authHeader('all', 'global-org') });
        if (list.status === 200) {
            const orgs = await list.json() as { id: string; name: string }[];
            // IMPORTANT: Do NOT include the stable shared fixture name "E2E Org" here.
            // Several specs rely on a long‑lived base org created directly via SQL (not tracked by fetch interceptor).
            // Previously adding "E2E Org" caused that org to be deleted when this file's afterAll executed earlier
            // than other concurrently running test files, triggering widespread FK 23503 failures (projects_org_id_fkey,
            // documents_project_id_fkey, chunks_document_id_fkey, chat_conversations_org_id_fkey).
            // If/when we migrate every spec to per‑spec org isolation we can safely re-enable full pattern cleanup.
            const pattern = /^(Doc Org|Ingest Org|Chat Org|Perf Org|Consist Org|Search Org|Cascade Org)/;
            const residual = orgs.filter(o => pattern.test(o.name) && o.name !== 'Default Org');
            await Promise.all(residual.map(async o => {
                if (!trackedOrgIds.has(o.id)) {
                    try { await originalFetch(`${ctx.baseUrl}/orgs/${o.id}`, { method: 'DELETE', headers: authHeader('all', 'global-org') }); } catch { /* ignore */ }
                }
            }));
        }
    } finally {
        globalThis.fetch = originalFetch; // restore
        if (ctx && typeof ctx.close === 'function') {
            await ctx.close();
        }
    }
});
