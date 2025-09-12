import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { vectorSearch } from './utils/search';
import { ingestDocs } from './utils/fixtures';
import { expectStatusOneOf } from './utils';

// Focused vector mode behavior:
// - Explicit mode=vector requested.
// - Accept fallback to lexical when embeddings unavailable.
// - Ensures results array present; does not assert semantic ordering.

interface SearchResult { id: string; score: number; snippet: string; }
interface SearchResponse { mode: string; results: SearchResult[]; warning?: string; }

let ctx: E2EContext;
const QUERY = 'semantic';

async function ingestDoc(ctx: E2EContext) {
    const content = 'Vector semantic embeddings allow semantic similarity search. Semantic retrieval test.';
    const results = await ingestDocs(ctx, [{ name: 'vector', content }], { userSuffix: 'vector-mode' });
    expectStatusOneOf(results[0].status, [200, 201], 'vector ingest');
}

describe('Search Vector Mode E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('vector-mode'); });
    beforeEach(async () => { await ctx.cleanup(); await ingestDoc(ctx); });
    afterAll(async () => { await ctx.close(); });

    it('returns results in vector or lexical fallback mode', async () => {
        const resp = await vectorSearch(ctx, QUERY, 5, { userSuffix: 'vector-mode' });
        expect(resp.status).toBe(200);
        expect(['vector', 'lexical']).toContain(resp.json.mode);
        expect(Array.isArray(resp.json.results)).toBe(true);
    });
});
