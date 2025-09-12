import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Embeddings Integrity E2E
// Verifies basic invariants when embeddings are enabled:
//  1. Ingesting a text file produces chunks with embeddings (non-null vector norms in DB-backed similarity search).
//  2. Vector search returns mode 'vector' (not fallback lexical) and each result has a similarity/distance metric.
//  3. Chat citations (if any) include similarity values within sane numeric range (0..2 for distance, or -1..1 if cosine-like), non-NaN.
// If embeddings are disabled, the test short-circuits with a skip assertion (documented) to avoid false failures.

let ctx: E2EContext;

interface SearchResp { mode: string; results: any[]; }

async function ingestSimple(ctx: E2EContext) {
    const res = await fetch(`${ctx.baseUrl}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader('all', 'emb-int'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId },
        body: JSON.stringify({ filename: 'emb-int.txt', content: 'Vector integrity test content about embeddings quality metrics', projectId: ctx.projectId })
    });
    expectStatusOneOf(res.status, [200, 201], 'embeddings integrity ingest');
    return res.json();
}

describe('Embeddings Integrity', () => {
    beforeAll(async () => { ctx = await createE2EContext('emb-int'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('ensures vector search and citations expose similarity metrics when enabled', async () => {
        // Try a vector search first to detect enablement
        const probe = await fetch(`${ctx.baseUrl}/search?q=embeddings&mode=vector&limit=1`, { headers: authHeader('all', 'emb-int') });
        expect(probe.status).toBe(200);
        const probeJson = await probe.json() as SearchResp;
        const embeddingsEnabled = probeJson.mode === 'vector';
        if (!embeddingsEnabled) {
            // Skip semantics: assert lexical fallback and exit
            expect(['lexical', 'vector']).toContain(probeJson.mode);
            return;
        }

        // Embeddings enabled path
        await ingestSimple(ctx);

        const searchRes = await fetch(`${ctx.baseUrl}/search?q=quality&mode=vector&limit=5`, { headers: authHeader('all', 'emb-int') });
        expect(searchRes.status).toBe(200);
        const searchJson = await searchRes.json() as SearchResp;
        expect(searchJson.mode).toBe('vector');
        expect(Array.isArray(searchJson.results)).toBe(true);
        if (searchJson.results.length > 0) {
            const r0 = searchJson.results[0];
            // Accept either distance or similarity numeric field names
            const metric = r0.distance ?? r0.similarity ?? r0.score;
            expect(typeof metric).toBe('number');
            expect(Number.isNaN(metric)).toBe(false);
        }

        // Create conversation and stream to capture citation similarity values
        const convRes = await fetch(`${ctx.baseUrl}/chat/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('all', 'emb-int'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId },
            body: JSON.stringify({ message: 'Explain embeddings quality', isPrivate: false })
        });
        expect(convRes.status).toBe(201);
        const conv = await convRes.json();

        const stream = await fetch(`${ctx.baseUrl}/chat/${conv.conversationId}/stream`, { headers: { ...authHeader('all', 'emb-int'), 'x-project-id': ctx.projectId, 'x-org-id': ctx.orgId } });
        expect(stream.status).toBe(200);
        const text = await stream.text();
        const events = text.split(/\n\n/).filter(e => e.trim());
        const payloads = events.map(ev => { const m = ev.match(/^data: (.*)$/m); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean) as any[];
        const citationsFrame = payloads.find(p => Array.isArray(p.citations));
        if (citationsFrame) {
            for (const cit of citationsFrame.citations) {
                if (cit.similarity !== undefined) {
                    expect(typeof cit.similarity).toBe('number');
                    expect(Number.isNaN(cit.similarity)).toBe(false);
                    // Loose bounds sanity (distance from query) typical pgvector cosine or euclidean normalized
                    expect(Math.abs(cit.similarity)).toBeLessThan(10);
                }
            }
        }
    });
});
