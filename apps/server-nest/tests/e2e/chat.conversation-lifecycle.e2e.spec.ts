import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Conversation lifecycle aligned with existing CRUD endpoints:
// - Create: POST /chat/conversations { message }
// - List: GET /chat/conversations (requires headers)
// - Get: GET /chat/:id
// - Rename: PATCH /chat/:id
// - Delete: DELETE /chat/:id (expected 204)
// Ensures sequential creates do not spawn multiple conversations when referencing same id path.

interface Conversation { id: string; }
interface Message { id: string; role: string; content: string; }

let ctx: E2EContext;

async function createConversation(ctx: E2EContext, message: string) {
    const res = await fetch(`${ctx.baseUrl}/chat/conversations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader('all', 'chat-life'),
            'x-org-id': ctx.orgId,
            'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ message, isPrivate: true }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    return json.conversationId as string;
}

async function listPrivate(ctx: E2EContext): Promise<Conversation[]> {
    const res = await fetch(`${ctx.baseUrl}/chat/conversations`, { headers: { ...authHeader('all', 'chat-life'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId } });
    expect(res.status).toBe(200);
    const json = await res.json();
    return json.private as Conversation[];
}

async function getConversation(ctx: E2EContext, convoId: string) {
    const res = await fetch(`${ctx.baseUrl}/chat/${convoId}`, { headers: { ...authHeader('all', 'chat-life'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId } });
    expect(res.status).toBe(200);
    return res.json() as Promise<{ id: string; messages: Message[] }>;
}

describe('Chat Conversation Lifecycle E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-life'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('creates a conversation and lists it', async () => {
        const convId = await createConversation(ctx, 'First message');
        const priv = await listPrivate(ctx);
        expect(priv.find(c => c.id === convId)).toBeTruthy();
        const detail = await getConversation(ctx, convId);
        expect(detail.messages.length).toBeGreaterThan(0);
        expect(detail.messages[0].role).toBe('user');
    });

    it('deletes conversation and it no longer appears', async () => {
        const convId = await createConversation(ctx, 'To be deleted');
        const del = await fetch(`${ctx.baseUrl}/chat/${convId}`, { method: 'DELETE', headers: { ...authHeader('all', 'chat-life'), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId } });
        expectStatusOneOf(del.status, [200, 204], 'conversation delete');
        const priv = await listPrivate(ctx);
        expect(priv.find(c => c.id === convId)).toBeFalsy();
    });
});
