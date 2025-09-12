import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { createConversation, streamConversation } from './utils/chat';
import { authHeader } from './auth-helpers';

let ctx: E2EContext;

async function seededConversation() {
    return createConversation(ctx, 'Scope test convo', { userSuffix: 'chat-stream-scope' });
}

describe('Chat Streaming Scope Enforcement', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-stream-scope'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('returns 403 when streaming without chat:read scope', async () => {
        const convo = await seededConversation();
        const res = await fetch(`${ctx.baseUrl}/chat/${convo.conversationId}/stream`, {
            headers: { ...authHeader('default'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId }
        });
        expect(res.status).toBe(403);
    });

    it('streams successfully with full scopes', async () => {
        const convo = await seededConversation();
        const stream = await streamConversation(ctx, convo.conversationId, { userSuffix: 'chat-stream-scope' });
        expect(stream.tokens.length).toBeGreaterThan(0);
        expect(stream.summary).toBeTruthy();
        expect(stream.done).toBeTruthy();
    });
});
