import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Chat Streaming Error Termination E2E
// Requires server support: set QUERY param ?forceError=1 (or environment-based trigger) to simulate upstream model failure.
// Expectations:
//  * Stream begins (HTTP 200, text/event-stream)
//  * Emits at least one token OR an immediate error frame
//  * Emits an error frame { error: { code, message }, done: true } OR closes without sending normal done token frame
//  * MUST NOT emit summary frame after error (if summary currently emitted before done, adjust expectation accordingly)
// Test is defensive: passes if an error frame OR early close without normal done token sequence.

let ctx: E2EContext;

describe('Chat Streaming Error Termination', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-sse-error'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('terminates stream cleanly on forced error (emits error frame, no summary)', async () => {
        // Create conversation first
        const createRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-sse-error'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
            body: JSON.stringify({ message: 'Trigger error path', isPrivate: false })
        });
        expect(createRes.status).toBe(201);
        const convo = await createRes.json();
        const res = await fetch(`${ctx.baseUrl}/chat/${convo.conversationId}/stream?forceError=1`, {
            headers: { ...authHeader('all', 'chat-sse-error'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId }
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        const events = text.split(/\n\n/).filter(e => e.trim());
        // Look for error frame
        const errorFrame = events.find(e => /"error"\s*:\s*\{/.test(e));
        expect(errorFrame, 'expected an error frame').toBeTruthy();
        if (errorFrame) {
            expect(/"code"\s*:\s*"upstream-failed"/.test(errorFrame)).toBe(true);
            expect(/"done"\s*:\s*true/.test(errorFrame)).toBe(true);
        }
        // Ensure no summary frame present after forced error
        const summaryFrame = events.find(e => /"summary"\s*:\s*true/.test(e));
        expect(summaryFrame).toBeFalsy();
    });
});
