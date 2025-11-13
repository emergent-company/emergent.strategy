import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * POST /chat/stream SSE E2E
 * Validates the new POST streaming endpoint used by the Admin app hook.
 * Expectations:
 *  - 200 text/event-stream
 *  - First frame is meta with conversationId (UUID) and citations (array)
 *  - Emits at least one token OR an error frame when model disabled
 *  - Terminates with a done frame (unless only error frame emitted)
 */
let ctx: E2EContext;

describe('Chat Streaming (POST /chat/stream)', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-post-stream'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('streams meta, tokens and done (or error) for a new conversation', async () => {
        const res = await fetch(`${ctx.baseUrl}/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-post-stream'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
            body: JSON.stringify({ message: 'Explain the system design briefly', topK: 3, isPrivate: true })
        });
        // Endpoint now explicitly returns 200 OK for streaming
        expect(res.status).toBe(200);
        const ctype = res.headers.get('content-type') || '';
        expect(ctype.includes('text/event-stream')).toBe(true);
        const text = await res.text();
        const events = text.split(/\n\n/).filter(e => e.trim().length > 0);
        // Parse data: lines
        const frames = events.map(ev => {
            const m = ev.match(/^data: (.*)$/m); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; }
        }).filter(Boolean) as any[];
        expect(frames.length).toBeGreaterThan(0);
        const first = frames[0];
        expect(first.type).toBe('meta');
        expect(typeof first.conversationId).toBe('string');
        expect(/^[0-9a-fA-F-]{36}$/.test(first.conversationId)).toBe(true);
        expect(Array.isArray(first.citations)).toBe(true);
        const tokenFrames = frames.filter(f => f.type === 'token');
        const errorFrame = frames.find(f => f.type === 'error');
        const doneFrame = frames.find(f => f.type === 'done');
        // If generation enabled we expect tokens + done; if disabled we expect error OR tokens fallback + done
        if (errorFrame) {
            // error path: may or may not have done depending on implementation, but should not have both error and many tokens
            expect(typeof errorFrame.error).toBe('string');
        } else {
            expect(tokenFrames.length).toBeGreaterThan(0);
            expect(doneFrame).toBeTruthy();
        }
    });
});
