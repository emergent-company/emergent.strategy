import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Security Auth Errors E2E (Hardened)
// After auth hardening, documents routes require a valid bearer token and x-project-id header.
// Scenarios:
// 1. Missing Authorization header -> 401.
// 2. Malformed token -> 401.
// 3. No-scope token currently accepted (until scope enforcement added) -> 200/201 allowed.
// 4. Missing x-project-id now yields 400 (no fallback to body).

let ctx: E2EContext;

describe('Security Auth Errors E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('auth-errs'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('rejects missing Authorization header with 401', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-project-id': ctx.projectId },
            body: JSON.stringify({ filename: 'x.txt', content: 'x' })
        });
        expect(res.status).toBe(401);
    });

    it('rejects malformed Authorization token with 401', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer !!!broken!!!', 'x-project-id': ctx.projectId },
            body: JSON.stringify({ filename: 'y.txt', content: 'y' })
        });
        expect(res.status).toBe(401);
    });

    it('rejects no-scope token on protected endpoint (scopes enforced)', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('none'), 'x-project-id': ctx.projectId },
            body: JSON.stringify({ filename: 'z.txt', content: 'z' })
        });
        expect(res.status).toBe(403);
    });

    it('rejects missing project header with 400 even with auth', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all') },
            body: JSON.stringify({ filename: 'w.txt', content: 'w' })
        });
        expect(res.status).toBe(400);
    });
});
