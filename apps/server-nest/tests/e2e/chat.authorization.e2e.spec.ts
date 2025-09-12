import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Tests chat conversation ownership and visibility constraints.
// Aligns with existing endpoints used in chat.basic-crud.e2e.spec.ts:
// - Create: POST /chat/conversations { message, isPrivate }
// - List: GET /chat/conversations (requires x-project-id)
// - Get/Rename/Delete: /chat/:id (requires headers)
// Unauthorized access should yield 404 (preferred) or 403.

interface Conversation { id: string; title?: string; is_private?: boolean; }

let ownerCtx: E2EContext; // user A (subject)
let intruderCtx: E2EContext; // user B (different user, same org/project seeding pattern)

async function createConversation(ctx: E2EContext, userLabel: string, message: string) {
    const res = await fetch(`${ctx.baseUrl}/chat/conversations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...authHeader('all', userLabel),
            'x-org-id': ctx.orgId,
            'x-project-id': ctx.projectId,
        },
        body: JSON.stringify({ message, isPrivate: true }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    return json.conversationId as string;
}

async function listPrivate(ctx: E2EContext, userLabel: string) {
    const res = await fetch(`${ctx.baseUrl}/chat/conversations`, {
        headers: { ...authHeader('all', userLabel), 'x-org-id': ctx.orgId, 'x-project-id': ctx.projectId },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    return json.private as Conversation[];
}

describe('Chat Authorization E2E', () => {
    beforeAll(async () => {
        ownerCtx = await createE2EContext('chat-owner');
        intruderCtx = await createE2EContext('chat-intruder');
    });
    beforeEach(async () => { await ownerCtx.cleanup(); await intruderCtx.cleanup(); });
    afterAll(async () => { await ownerCtx.close(); await intruderCtx.close(); });

    it('prevents another user from renaming or deleting a private conversation', async () => {
        const convId = await createConversation(ownerCtx, 'chat-owner', 'Hello world');
        const intruderRename = await fetch(`${ownerCtx.baseUrl}/chat/${convId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader('all', 'chat-intruder'),
                'x-org-id': ownerCtx.orgId,
                'x-project-id': ownerCtx.projectId,
            },
            body: JSON.stringify({ title: 'Hacked Title' }),
        });
        expect([403, 404]).toContain(intruderRename.status);
        const intruderDelete = await fetch(`${ownerCtx.baseUrl}/chat/${convId}`, {
            method: 'DELETE',
            headers: { ...authHeader('all', 'chat-intruder'), 'x-org-id': ownerCtx.orgId, 'x-project-id': ownerCtx.projectId },
        });
        expect([403, 404]).toContain(intruderDelete.status);
    });

    it('allows owner to rename and delete their conversation', async () => {
        const convId = await createConversation(ownerCtx, 'chat-owner', 'Conversation start');
        const rename = await fetch(`${ownerCtx.baseUrl}/chat/${convId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                ...authHeader('all', 'chat-owner'),
                'x-org-id': ownerCtx.orgId,
                'x-project-id': ownerCtx.projectId,
            },
            body: JSON.stringify({ title: 'Renamed!' }),
        });
        expect(rename.status).toBe(200);
        const listAfterRename = await listPrivate(ownerCtx, 'chat-owner');
        const updated = listAfterRename.find(c => c.id === convId);
        if (updated?.title) expect(updated.title).toContain('Renamed');
        const del = await fetch(`${ownerCtx.baseUrl}/chat/${convId}`, {
            method: 'DELETE',
            headers: { ...authHeader('all', 'chat-owner'), 'x-org-id': ownerCtx.orgId, 'x-project-id': ownerCtx.projectId },
        });
        expectStatusOneOf(del.status, [200, 204], 'auth convo delete');
        const finalList = await listPrivate(ownerCtx, 'chat-owner');
        expect(finalList.find(c => c.id === convId)).toBeUndefined();
    });
});
