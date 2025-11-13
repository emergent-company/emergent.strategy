import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

/**
 * Chat multi-tenancy enforcement:
 *  - Missing x-project-id -> 400 for list & create
 *  - Conversations scoped by project (private listing isolation)
 */

describe('Chat Project Header Enforcement', () => {
    let ctxA: Awaited<ReturnType<typeof createE2EContext>>;
    let ctxB: Awaited<ReturnType<typeof createE2EContext>>;

    beforeAll(async () => {
        ctxA = await createE2EContext('chat-a');
        ctxB = await createE2EContext('chat-b');
    });
    beforeEach(async () => { await ctxA.cleanup(); await ctxB.cleanup(); });
    afterAll(async () => { await ctxA.close(); await ctxB.close(); });

    async function createConversation(baseUrl: string, projectId: string, userSuffix: string, message: string) {
        const res = await fetch(`${baseUrl}/chat/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', userSuffix), 'x-project-id': projectId, 'x-org-id': ctxA.orgId },
            body: JSON.stringify({ message, isPrivate: true })
        });
        if (res.status !== 201) {
            const text = await res.text();
            // eslint-disable-next-line no-console
            console.error('createConversation failed', { status: res.status, text });
        }
        expect(res.status).toBe(201);
        const json = await res.json();
        return json.conversationId as string;
    }

    it('rejects list without x-project-id', async () => {
        const res = await fetch(`${ctxA.baseUrl}/chat/conversations`, { headers: { ...authHeader('all', 'chat-a') } });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error?.code).toBe('bad-request');
    });

    it('rejects create without x-project-id', async () => {
        const res = await fetch(`${ctxA.baseUrl}/chat/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-a') },
            body: JSON.stringify({ message: 'Hello' })
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error?.code).toBe('bad-request');
    });

    it('lists only conversations for the specified project', async () => {
        const convA = await createConversation(ctxA.baseUrl, ctxA.projectId, 'chat-a', 'Message A1');
        // Create second project under ctxA org (reuse helper pattern from org.project-rls spec)
        const projRes = await fetch(`${ctxA.baseUrl}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-a') },
            body: JSON.stringify({ name: `Chat Proj B ${Date.now()}`, orgId: ctxA.orgId })
        });
        expect(projRes.status).toBe(201);
        const projB = await projRes.json() as { id: string };
        const convB = await createConversation(ctxA.baseUrl, projB.id, 'chat-a', 'Message B1');

        const listA = await fetch(`${ctxA.baseUrl}/chat/conversations`, { headers: { ...authHeader('all', 'chat-a'), 'x-project-id': ctxA.projectId } });
        expect(listA.status).toBe(200);
        const jsonA = await listA.json();
        expect(jsonA.private.some((c: any) => c.id === convA)).toBe(true);
        expect(jsonA.private.some((c: any) => c.id === convB)).toBe(false);

        const listB = await fetch(`${ctxA.baseUrl}/chat/conversations`, { headers: { ...authHeader('all', 'chat-a'), 'x-project-id': projB.id } });
        expect(listB.status).toBe(200);
        const jsonB = await listB.json();
        expect(jsonB.private.some((c: any) => c.id === convB)).toBe(true);
        expect(jsonB.private.some((c: any) => c.id === convA)).toBe(false);
    });
});
