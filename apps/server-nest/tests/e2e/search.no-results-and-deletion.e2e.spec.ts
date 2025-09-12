import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { lexicalSearch } from './utils/search';
import { ingestDocs } from './utils/fixtures';
import { expectStatusOneOf } from './utils';

// Ensures search returns empty results when no matches, and reflects document deletion (no stale hits).

let ctx: E2EContext;

interface SearchResponse { mode: string; results: { id: string }[]; }

async function ingest(ctx: E2EContext, content: string, name: string) {
    const results = await ingestDocs(ctx, [{ name, content }], { userSuffix: 'search-del' });
    expectStatusOneOf(results[0].status, [200, 201], 'search delete ingest');
    return { documentId: results[0].documentId };
}

describe('Search No Results & Deletion Consistency E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('search-del'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('returns empty result set for unmatched query and removes deleted doc', async () => {
        // Empty search
        const emptyResp = await lexicalSearch(ctx, 'nonexistenttermxyz', 5, 0, { userSuffix: 'search-del' });
        expect(emptyResp.status).toBe(200);
        const emptyJson = emptyResp.json as SearchResponse;
        expect(Array.isArray(emptyJson.results)).toBe(true);
        expect(emptyJson.results.length).toBe(0);

        // Ingest a doc and then confirm it appears
        const ing = await ingest(ctx, 'uniquephrasealpha beta', 'alpha');
        const res1 = await lexicalSearch(ctx, 'uniquephrasealpha', 5, 0, { userSuffix: 'search-del' });
        expect(res1.status).toBe(200);
        const json1 = res1.json as SearchResponse;
        expect(json1.results.length).toBeGreaterThan(0);

        // Delete doc
        const docId = ing.documentId;
        const del = await fetch(`${ctx.baseUrl}/documents/${docId}`, { method: 'DELETE', headers: authHeader('all', 'search-del') });
        expectStatusOneOf(del.status, [200, 204], 'delete doc');

        // Search again should not include the deleted doc id
        const res2 = await lexicalSearch(ctx, 'uniquephrasealpha', 5, 0, { userSuffix: 'search-del' });
        expect(res2.status).toBe(200);
        const json2 = res2.json as SearchResponse;
        if (json2.results.length) {
            const ids = json2.results.map(r => r.id);
            expect(ids).not.toContain(docId);
        }
    });
});
