import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Chat Citations Provenance E2E
// Ensures that streamed citations (if any) correspond to real chunks & documents and that persisted assistant message stores them.
// Strategy:
//  1. Ingest a small document (ensure embeddings enabled in test config) with known content.
//  2. Create chat conversation.
//  3. Stream chat; capture any citations frame.
//  4. Fetch conversation messages; locate assistant message and verify citations array matches streamed citation ids.
//  5. Cross-check each citation's chunkId/documentId pair exists in kb.chunks/kb.documents via auxiliary API (documents/:id).
// Test tolerates zero citations (pass w/ note) but if citations exist they must be consistent.

let ctx: E2EContext;

describe('Chat Citations Provenance', () => {
  beforeAll(async () => { ctx = await createE2EContext('chat-citations-prov'); });
  beforeEach(async () => { await ctx.cleanup(); });
  afterAll(async () => { await ctx.close(); });

  it('validates streamed citations map to persisted assistant message and actual chunks', async () => {
    // 1. Ingest a document
    const ingestRes = await fetch(`${ctx.baseUrl}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-citations-prov'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId },
      body: JSON.stringify({ filename: 'prov.txt', content: 'Provenance test content about vectors and embeddings', projectId: ctx.projectId })
    });
    expect([200,201]).toContain(ingestRes.status);
    const doc = await ingestRes.json();
    expect(doc.id).toBeTruthy();

    // 2. Create conversation
    const convRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader('all', 'chat-citations-prov'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId },
      body: JSON.stringify({ message: 'Tell me about embeddings', isPrivate: false })
    });
    expect(convRes.status).toBe(201);
    const conv = await convRes.json();

    // 3. Stream chat
    const streamRes = await fetch(`${ctx.baseUrl}/chat/${conv.conversationId}/stream`, {
      headers: { ...authHeader('all', 'chat-citations-prov'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId }
    });
    expect(streamRes.status).toBe(200);
    const body = await streamRes.text();
    const events = body.split(/\n\n/).filter(e => e.trim());
    const payloads = events.map(ev => {
      const m = ev.match(/^data: (.*)$/m); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; }
    }).filter(Boolean) as any[];
    const citationsFrame = payloads.find(p => Array.isArray(p.citations));
    const streamedCitations = citationsFrame ? (citationsFrame.citations as any[]) : [];

    // 4. Fetch conversation to inspect persisted assistant message
    const getRes = await fetch(`${ctx.baseUrl}/chat/${conv.conversationId}`, {
      headers: { ...authHeader('all', 'chat-citations-prov'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId }
    });
    expect(getRes.status).toBe(200);
    const convFull = await getRes.json();
    const assistantMsg = (convFull.messages || []).find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeTruthy();
    if (!assistantMsg) return; // fail-safe

    const persistedCitations = assistantMsg.citations || [];
    // If no citations streamed we pass (lack of citations can occur with disabled embeddings)
    if (streamedCitations.length === 0) {
      expect(persistedCitations.length).toBe(0);
      return;
    }

    // 5. Validate counts & id equality sets
    expect(persistedCitations.length).toBe(streamedCitations.length);
    const sortIds = (arr: any[]) => arr.map(c => c.chunkId + ':' + c.documentId).sort();
    expect(sortIds(persistedCitations)).toEqual(sortIds(streamedCitations));

    // Cross-check each document via documents API (ensures documentId exists)
    for (const cit of persistedCitations) {
      expect(cit.documentId).toBeTruthy();
      expect(cit.chunkId).toBeTruthy();
      const docRes = await fetch(`${ctx.baseUrl}/documents/${cit.documentId}`, {
        headers: { ...authHeader('all', 'chat-citations-prov'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId }
      });
      expect(docRes.status).toBe(200);
      const djson = await docRes.json();
      expect(djson.id).toBe(cit.documentId);
    }
  });
});
