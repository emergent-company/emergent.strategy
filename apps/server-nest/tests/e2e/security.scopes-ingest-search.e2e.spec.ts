import { beforeAll, afterAll, describe, it, expect, beforeEach } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// New scopes added: ingest:write, search:read, chunks:read.
// This spec validates denial when missing scopes and success with full scope token.
// Tokens semantics reused from existing scope tests.

let ctx: E2EContext;

async function uploadSample(ctx: E2EContext, tokenVariant: 'all' | 'default' | 'none', suffix = 'ingest-scope') {
    const form = new FormData();
    form.set('projectId', ctx.projectId);
    form.set('filename', 'scope.txt');
    form.set('mimeType', 'text/markdown');
    form.set('file', new Blob(['Hello scope test']), 'scope.txt');
    const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: authHeader(tokenVariant, suffix) as any, body: form as any });
    return res;
}

describe('Security Scopes Ingestion/Search/Chunks', () => {
    beforeAll(async () => { ctx = await createE2EContext('scope-ext'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('denies ingestion upload without ingest:write scope', async () => {
        const res = await uploadSample(ctx, 'default'); // only read:me
        expect(res.status).toBe(403);
    });

    it('allows ingestion upload with full scopes', async () => {
        const res = await uploadSample(ctx, 'all');
        expectStatusOneOf(res.status, [200, 201], 'scope ingest allowed');
    });

    it('denies search without search:read scope', async () => {
        // default token lacks search:read
        const res = await fetch(`${ctx.baseUrl}/search?q=test&limit=1`, { headers: authHeader('default', 'scope-ext') });
        expect(res.status).toBe(403);
    });

    it('allows search with full scopes', async () => {
        // Need at least one document to avoid edge empty path differences
        const up = await uploadSample(ctx, 'all');
        expectStatusOneOf(up.status, [200, 201], 'scope ingest pre-search');
        const res = await fetch(`${ctx.baseUrl}/search?q=Hello&limit=5`, { headers: authHeader('all', 'scope-ext') });
        expect(res.status).toBe(200);
    });

    it('denies chunks list without chunks:read scope', async () => {
        const res = await fetch(`${ctx.baseUrl}/chunks`, { headers: authHeader('default', 'scope-ext') });
        expect(res.status).toBe(403);
    });

    it('allows chunks list with full scopes', async () => {
        const res = await fetch(`${ctx.baseUrl}/chunks`, { headers: authHeader('all', 'scope-ext') });
        expect(res.status).toBe(200);
    });
});
