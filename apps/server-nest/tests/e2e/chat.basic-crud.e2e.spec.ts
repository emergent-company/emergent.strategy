import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Basic chat E2E covering create (implicit), list, get, rename, delete lifecycle with per-test cleanup
// Focuses on minimal required path using existing ChatService endpoints.

describe('Chat Conversations E2E', () => {
    let ctx: Awaited<ReturnType<typeof createE2EContext>>;
    beforeAll(async () => { ctx = await createE2EContext('chat'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    async function createConversation(initialMessage: string) {
        // POST a new chat conversation via /chat/conversations
        const res = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader('all', 'chat'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            },
            body: JSON.stringify({ message: initialMessage, conversationId: null, isPrivate: true }),
        });
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json).toHaveProperty('conversationId');
        return json.conversationId as string;
    }

    it('creates, lists, gets, renames and deletes a private conversation', async () => {
        const convId = await createConversation('Hello knowledge base world');

        // List conversations (private should contain our new conv)
        const listRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            headers: {
                ...authHeader('all', 'chat'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            },
        });
        expect(listRes.status).toBe(200);
        const listJson = await listRes.json();
        expect(Array.isArray(listJson.private)).toBe(true);
        expect(listJson.private.find((c: any) => c.id === convId)).toBeTruthy();

        // Get conversation detail
        const getRes = await fetch(`${ctx.baseUrl}/chat/${convId}`, {
            headers: {
                ...authHeader('all', 'chat'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            },
        });
        expect(getRes.status).toBe(200);
        const getJson = await getRes.json();
        expect(getJson).toHaveProperty('id', convId);
        expect(Array.isArray(getJson.messages)).toBe(true);
        expect(getJson.messages[0].role).toBe('user');

        // Rename conversation
        const renameRes = await fetch(`${ctx.baseUrl}/chat/${convId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader('all', 'chat'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            },
            body: JSON.stringify({ title: 'Renamed Conversation' }),
        });
        expect(renameRes.status).toBe(200);

        // Verify rename via list again
        const listRes2 = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            headers: {
                ...authHeader('all', 'chat'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            },
        });
        const list2 = await listRes2.json();
        const updated = list2.private.find((c: any) => c.id === convId);
        expect(updated.title).toContain('Renamed Conversation');

        // Delete conversation
        const delRes = await fetch(`${ctx.baseUrl}/chat/${convId}`, {
            method: 'DELETE',
            headers: {
                ...authHeader('all', 'chat'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            },
        });
        expect(delRes.status).toBe(204);

        // Ensure it no longer appears
        const listRes3 = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            headers: {
                ...authHeader('all', 'chat'),
                'x-org-id': ctx.orgId,
                'x-project-id': ctx.projectId,
            },
        });
        const list3 = await listRes3.json();
        expect(list3.private.find((c: any) => c.id === convId)).toBeFalsy();
    });
});
