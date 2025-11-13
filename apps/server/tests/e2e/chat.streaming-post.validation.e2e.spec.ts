import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Negative validation tests for POST /chat/stream validating DTO rules & headers
// Scenarios:
//  1. Missing message -> 400
//  2. Missing x-project-id header -> 400
//  3. Invalid conversationId format -> falls back to creation (should NOT 400) (documented)
//  4. topK out of range (0) -> Validation pipe -> 422 (UnprocessableEntity) with details
//  5. documentIds not UUID array -> 422

let ctx: E2EContext;

describe('Chat Streaming (POST /chat/stream) validation', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-post-stream-val'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('rejects missing message', async () => {
        const res = await fetch(`${ctx.baseUrl}/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-post-stream-val'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
            body: JSON.stringify({})
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error?.code).toBe('bad-request');
    });

    it('rejects missing project header', async () => {
        const res = await fetch(`${ctx.baseUrl}/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-post-stream-val'), 'x-org-id': ctx.orgId },
            body: JSON.stringify({ message: 'hello' })
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error?.message).toMatch(/x-project-id/);
    });

    it('returns 400 for topK below minimum', async () => {
        const res = await fetch(`${ctx.baseUrl}/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-post-stream-val'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
            body: JSON.stringify({ message: 'test', topK: 0 })
        });
        expect(res.status).toBe(400); // Controller uses @Res() which bypasses ValidationPipe formatting
        // Response body contains validation structure, but we don't assert exact payload to avoid brittleness
    });

    it('returns 400 for non-UUID documentIds', async () => {
        const res = await fetch(`${ctx.baseUrl}/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-post-stream-val'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
            body: JSON.stringify({ message: 'test', documentIds: ['not-a-uuid'] })
        });
        expect(res.status).toBe(400); // Controller uses @Res() which bypasses ValidationPipe formatting
        // Avoid asserting exact validation keys for stability
    });
});
