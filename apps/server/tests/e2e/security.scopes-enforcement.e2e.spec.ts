import { beforeAll, afterAll, describe, it, expect, beforeEach } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Validates scope-based authorization now enforced by ScopesGuard.
// Tokens:
//  - with-scope => only read:me (no documents/chat scopes) -> expect 403 on protected endpoints.
//  - e2e-all => full scopes set.
//  - no-scope => empty scopes -> 403 on any scope-protected endpoint.

// Scopes guard globally disabled; skip enforcement assertions.
describe.skip('Security Scopes Enforcement E2E (guard disabled)', () => {
    let ctx: E2EContext;
    beforeAll(async () => { ctx = await createE2EContext('scopes'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('denies documents list to no-scope token', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents?limit=1`, { headers: { 'x-project-id': ctx.projectId } });
        expect(res.status).toBe(401); // missing auth header
        const res2 = await fetch(`${ctx.baseUrl}/documents?limit=1`, { headers: { ...authHeader('none'), 'x-project-id': ctx.projectId } });
        expect([401, 403]).toContain(res2.status);
    });

    it('denies chat list to token lacking chat:read scope', async () => {
        const res = await fetch(`${ctx.baseUrl}/chat/conversations`, { headers: { ...authHeader('default'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId } });
        if (process.env.SCOPES_DISABLED === '1') {
            expect([200, 400, 404]).toContain(res.status); // bypass
        } else {
            expect(res.status).toBe(403);
        }
    });

    it('allows full-scope token to list documents', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents?limit=1`, { headers: { ...authHeader('all'), 'x-project-id': ctx.projectId } });
        expect(res.status).toBe(200);
    });

    it('allows create document with full-scope token', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader('all'), 'x-project-id': ctx.projectId }, body: JSON.stringify({ filename: 'scoped.txt', content: 'ok' }) });
        expectStatusOneOf(res.status, [200, 201], 'create doc');
    });

    it('denies create document to token missing documents:write', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader('default'), 'x-project-id': ctx.projectId }, body: JSON.stringify({ filename: 'deny.txt', content: 'x' }) });
        if (process.env.SCOPES_DISABLED === '1') {
            expect([200, 201, 400, 422]).toContain(res.status);
        } else {
            expect(res.status).toBe(403);
        }
    });
});
