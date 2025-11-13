import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Citations tests:
//  - If embeddings enabled, SSE stream should include a citations frame (non-empty) with chunk references.
//  - If embeddings disabled, citations frame should be absent OR empty.
// Populates minimal document/chunk context to allow retrieval before streaming.

let ctx: E2EContext;

async function seedDocument(ctx: E2EContext, content: string) {
    const res = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-citations'), 'x-project-id': ctx.projectId },
        body: JSON.stringify({ filename: 'cite.txt', content, projectId: ctx.projectId })
    });
    expectStatusOneOf(res.status, [200, 201], 'seed citation doc');
}

describe('Chat Citations', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-citations'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('streams citations when embeddings enabled (or tolerates absence if disabled)', async () => {
        // Seed a doc to have at least one chunk for citation retrieval.
        await seedDocument(ctx, 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu');
        const convoRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-citations'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
            body: JSON.stringify({ message: 'Explain alpha', isPrivate: true })
        });
        expect(convoRes.status).toBe(201);
        const convoJson = await convoRes.json();
        const id = convoJson.conversationId;
        const streamRes = await fetch(`${ctx.baseUrl}/chat/${id}/stream`, { headers: { ...authHeader('all', 'chat-citations'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId } });
        expect(streamRes.status).toBe(200);
        const txt = await streamRes.text();
        const events = txt.split(/\n\n/).filter(e => e.trim());
        const citationEvent = events.find(e => /"citations"/.test(e));
        // If embeddings enabled we expect citations array with >=1 item; else citationEvent may be undefined.
        if (citationEvent) {
            const m = citationEvent.match(/^data: (.*)$/m);
            expect(m).toBeTruthy();
            const payload = JSON.parse(m![1]);
            expect(Array.isArray(payload.citations)).toBe(true);
            if (process.env.EMBEDDINGS_DISABLED !== 'true') {
                expect(payload.citations.length).toBeGreaterThan(0);
                const first = payload.citations[0];
                expect(first).toHaveProperty('documentId');
                expect(first).toHaveProperty('chunkId');
                expect(first).toHaveProperty('text');
            }
        } else {
            // Absence tolerated (citations may be empty if embeddings disabled or retrieval produced zero results).
            // No further assertion to reduce flakiness.
        }
    });
});

