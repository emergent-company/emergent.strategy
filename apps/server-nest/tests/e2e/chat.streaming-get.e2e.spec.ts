import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// E2E coverage for GET /chat/:id/stream with normal successful flow
// Ensures sequence: meta -> (tokens...) -> citations? -> summary -> done (summary before done)

let ctx: E2EContext;

describe('Chat Streaming (GET /chat/:id/stream)', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-get-stream'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('streams expected frame ordering', async () => {
        // Create conversation first
        const createRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-get-stream'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
            body: JSON.stringify({ message: 'Explain retrieval pipeline' })
        });
        expect(createRes.status).toBe(201);
        const { conversationId } = await createRes.json();

        const res = await fetch(`${ctx.baseUrl}/chat/${conversationId}/stream`, {
            headers: { ...authHeader('all', 'chat-get-stream'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId }
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type') || '').toContain('text/event-stream');
        const text = await res.text();
        const framesRaw = text.split(/\n\n/).filter(f => f.trim().startsWith('data:'));
        const frames = framesRaw.map(f => {
            const l = f.replace(/^data: /, '').trim();
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean) as any[];
        expect(frames.length).toBeGreaterThan(2);
        // meta first
        expect(frames[0].meta).toBeTruthy();
        // final frame done
        const last = frames[frames.length - 1];
        expect(last.done).toBe(true);
        // summary should appear before done
        const summaryIdx = frames.findIndex(f => f.summary === true);
        const doneIdx = frames.findIndex(f => f.done === true);
        expect(summaryIdx).toBeGreaterThan(-1);
        expect(summaryIdx).toBeLessThan(doneIdx);
    });
});
