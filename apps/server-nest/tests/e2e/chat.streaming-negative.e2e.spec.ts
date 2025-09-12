import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Chat Streaming Negative Cases (Validation Enforced)
 * Updated after tightening validation in streamGet:
 *  - Missing x-project-id -> 400 bad-request
 *  - Invalid (non-UUID) id -> 404 not-found
 * These align SSE endpoint with REST validation semantics.
 */

let ctx: E2EContext;

async function readSSEBody(res: Response): Promise<string[]> {
    const text = await res.text();
    return text.split(/\n\n/).filter(e => e.trim().length > 0);
}

describe('Chat Streaming SSE Negative Cases', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-sse-neg'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('returns 404 for invalid (non-uuid) conversation id', async () => {
        const res = await fetch(`${ctx.baseUrl}/chat/not-a-uuid/stream`, {
            headers: { ...authHeader('all', 'chat-sse-neg'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
        });
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json).toMatchObject({ error: { code: 'not-found' } });
    });

    it('returns 400 when x-project-id header is missing', async () => {
        const id = randomUUID();
        const res = await fetch(`${ctx.baseUrl}/chat/${id}/stream`, {
            headers: { ...authHeader('all', 'chat-sse-neg'), 'x-org-id': ctx.orgId },
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json).toMatchObject({ error: { code: 'bad-request' } });
    });

    it('returns 404 for well-formed but nonexistent conversation id', async () => {
        const id = randomUUID(); // not created
        const res = await fetch(`${ctx.baseUrl}/chat/${id}/stream`, {
            headers: { ...authHeader('all', 'chat-sse-neg'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
        });
        expect(res.status).toBe(404);
    });
});
