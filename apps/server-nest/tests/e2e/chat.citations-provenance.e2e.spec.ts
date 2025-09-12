import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { createConversation, streamConversation } from './utils/chat';
import { createDocument, getDocument } from './utils/documents';
import { authHeader } from './auth-helpers';

let ctx: E2EContext;

describe('Chat Citations Provenance', () => {
    beforeAll(async () => { ctx = await createE2EContext('chat-citations-prov'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('validates streamed citations map to persisted assistant message and actual chunks', async () => {
        const doc = await createDocument(ctx, 'prov.txt', 'Provenance test content about vectors and embeddings', { userSuffix: 'chat-citations-prov' });
        expect(doc.id).toBeTruthy();

        const convo = await createConversation(ctx, 'Tell me about embeddings', { userSuffix: 'chat-citations-prov' });
        const stream = await streamConversation(ctx, convo.conversationId, { userSuffix: 'chat-citations-prov' });
        const streamedCitations = stream.citations || [];

        const getRes = await fetch(`${ctx.baseUrl}/chat/${convo.conversationId}`, {
            headers: { ...authHeader('all', 'chat-citations-prov'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId }
        });
        expect(getRes.status).toBe(200);
        const convFull = await getRes.json();
        const assistantMsg = (convFull.messages || []).find((m: any) => m.role === 'assistant');
        expect(assistantMsg).toBeTruthy();
        if (!assistantMsg) return;
        const persistedCitations = assistantMsg.citations || [];
        if (!streamedCitations.length) {
            expect(persistedCitations.length).toBe(0);
            return;
        }
        expect(persistedCitations.length).toBe(streamedCitations.length);
        const sortIds = (arr: any[]) => arr.map(c => c.chunkId + ':' + c.documentId).sort();
        expect(sortIds(persistedCitations)).toEqual(sortIds(streamedCitations));
        for (const cit of persistedCitations) {
            expect(cit.documentId).toBeTruthy();
            expect(cit.chunkId).toBeTruthy();
            const djson = await getDocument(ctx, cit.documentId, { userSuffix: 'chat-citations-prov' });
            expect(djson.id).toBe(cit.documentId);
        }
    });
});
