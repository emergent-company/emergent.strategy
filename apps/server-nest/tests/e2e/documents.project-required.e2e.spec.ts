import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

describe('Documents Project Requirement E2E', () => {
    let ctx: E2EContext;
    beforeAll(async () => { ctx = await createE2EContext('docs-proj-req'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('rejects create without x-project-id header', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...authHeader('all', 'docs-proj-req') },
            body: JSON.stringify({ filename: 'no-project.txt', content: 'data' })
        });
        const json = await res.json();
        expect(res.status).toBe(400);
        expect(json.error?.code).toBe('bad-request');
        expect(/x-project-id/i.test(json.error?.message || '')).toBe(true);
    });

    it('creates document when x-project-id header supplied', async () => {
        const res = await fetch(`${ctx.baseUrl}/documents`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-project-id': ctx.projectId, ...authHeader('all', 'docs-proj-req') },
            body: JSON.stringify({ filename: 'header-project.txt', content: 'ok' })
        });
        expectStatusOneOf(res.status, [200, 201], 'create doc project-required');
        const json = await res.json();
        expect(json.id).toBeTruthy();
        if (json.projectId) expect(json.projectId).toBe(ctx.projectId);
    });
});
