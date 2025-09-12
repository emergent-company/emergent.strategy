import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

// Ensures search returns empty results when no matches, and reflects document deletion (no stale hits).

let ctx: E2EContext;

interface SearchResponse { mode: string; results: { id: string }[]; }

async function ingest(ctx: E2EContext, content: string, name: string) {
    const form = new FormData();
    form.append('projectId', ctx.projectId);
    form.append('filename', name + '.txt');
    form.append('file', new Blob([content], { type: 'text/plain' }), name + '.txt');
    const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: authHeader('all', 'search-del'), body: form as any });
    expect([200, 201]).toContain(res.status);
    return res.json();
}

describe('Search No Results & Deletion Consistency E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('search-del'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('returns empty result set for unmatched query and removes deleted doc', async () => {
        // Empty search
        const emptyRes = await fetch(`${ctx.baseUrl}/search?q=nonexistenttermxyz&mode=lexical&limit=5`, { headers: authHeader('all', 'search-del') });
        expect(emptyRes.status).toBe(200);
        const emptyJson = await emptyRes.json() as SearchResponse;
        expect(Array.isArray(emptyJson.results)).toBe(true);
        expect(emptyJson.results.length).toBe(0);

        // Ingest a doc and then confirm it appears
        const ing = await ingest(ctx, 'uniquephrasealpha beta', 'alpha');
        const res1 = await fetch(`${ctx.baseUrl}/search?q=uniquephrasealpha&mode=lexical&limit=5`, { headers: authHeader('all', 'search-del') });
        expect(res1.status).toBe(200);
        const json1 = await res1.json() as SearchResponse;
        expect(json1.results.length).toBeGreaterThan(0);

        // Delete doc
        const docId = ing.documentId || ing.id;
        const del = await fetch(`${ctx.baseUrl}/documents/${docId}`, { method: 'DELETE', headers: authHeader('all', 'search-del') });
        expect([200, 204]).toContain(del.status);

        // Search again should not include the deleted doc id
        const res2 = await fetch(`${ctx.baseUrl}/search?q=uniquephrasealpha&mode=lexical&limit=5`, { headers: authHeader('all', 'search-del') });
        expect(res2.status).toBe(200);
        const json2 = await res2.json() as SearchResponse;
        if (json2.results.length) {
            const ids = json2.results.map(r => r.id);
            expect(ids).not.toContain(docId);
        }
    });
});
