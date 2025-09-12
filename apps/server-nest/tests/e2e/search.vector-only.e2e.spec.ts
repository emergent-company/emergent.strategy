import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Focused vector mode behavior:
// - Explicit mode=vector requested.
// - Accept fallback to lexical when embeddings unavailable.
// - Ensures results array present; does not assert semantic ordering.

interface SearchResult { id: string; score: number; snippet: string; }
interface SearchResponse { mode: string; results: SearchResult[]; warning?: string; }

let ctx: E2EContext;
const QUERY = 'semantic';

async function ingestDoc(ctx: E2EContext) {
    const text = 'Vector semantic embeddings allow semantic similarity search. Semantic retrieval test.';
    const form = new FormData();
    form.append('projectId', ctx.projectId);
    form.append('filename', 'vector.txt');
    form.append('file', new Blob([text], { type: 'text/plain' }), 'vector.txt');
    const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: authHeader('all', 'vector-mode'), body: form as any });
    expect([200, 201]).toContain(res.status);
}

describe('Search Vector Mode E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('vector-mode'); });
    beforeEach(async () => { await ctx.cleanup(); await ingestDoc(ctx); });
    afterAll(async () => { await ctx.close(); });

    it('returns results in vector or lexical fallback mode', async () => {
        const url = `${ctx.baseUrl}/search?q=${encodeURIComponent(QUERY)}&mode=vector&limit=5`;
        const res = await fetch(url, { headers: authHeader('all', 'vector-mode') });
        expect(res.status).toBe(200);
        const json = await res.json() as SearchResponse;
        expect(['vector', 'lexical']).toContain(json.mode);
        expect(Array.isArray(json.results)).toBe(true);
    });
});
