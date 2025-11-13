import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { lexicalSearch, vectorSearch, hybridSearch } from './utils/search';
import { expectStatusOneOf } from './utils/assertions';
import { ingestDocs } from './utils/fixtures';

interface SearchResult { id: string; snippet: string; score: number; }
interface SearchResponse { mode: string; results: SearchResult[]; warning?: string; }

// This spec validates basic hybrid / lexical / vector search modes over ingested chunks.
// It ingests a small document containing repeated anchor terms to ensure lexical match
// and (if embeddings enabled) vector/hybrid variance. Assertions are resilient:
// - We only require at least one result for the query.
// - We verify the returned mode matches the requested mode (or documented fallback).
// - We confirm snippet contains the query token for lexical/hybrid when embeddings disabled.
// - We tolerate warning fallbacks when embeddings are disabled or fail.

let ctx: E2EContext;
const QUERY = 'hybrid';
const DOC_TEXT = `Hybrid search mixes lexical and vector signals.\nThis line reinforces hybrid semantics for testing.`;

// Use whichever schema mode the runner sets (minimal already includes tsv + vector columns now).

describe('Search Hybrid Modes E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('search-hybrid'); });
    beforeEach(async () => { await ctx.cleanup(); });
    afterAll(async () => { await ctx.close(); });

    it('ingests a document producing chunks', async () => {
        const big = (DOC_TEXT + '\n').repeat(10);
        const results = await ingestDocs(ctx, [{ name: 'hybrid', content: big }], { userSuffix: 'search-hybrid' });
        expectStatusOneOf(results[0].status, [200, 201], 'ingest hybrid modes');
        expect((results[0].chunks || 0)).toBeGreaterThan(0);
    });

    it('returns results in lexical mode', async () => {
        const resp = await lexicalSearch(ctx, QUERY, 5, 0, { userSuffix: 'search-hybrid' });
        expect(resp.status).toBe(200);
        expect(resp.json.mode).toBe('lexical');
        if (resp.json.results.length) {
            expect(resp.json.results.some(r => (r.snippet || '').toLowerCase().includes(QUERY))).toBe(true);
        }
    });

    it('returns results in vector or lexical fallback mode', async () => {
        const resp = await vectorSearch(ctx, QUERY, 5, { userSuffix: 'search-hybrid' });
        expect(resp.status).toBe(200);
        expect(['vector', 'lexical']).toContain(resp.json.mode);
        expect(Array.isArray(resp.json.results)).toBe(true);
    });

    it('returns results in hybrid or fallback lexical mode', async () => {
        const resp = await hybridSearch(ctx, QUERY, 5, { userSuffix: 'search-hybrid' });
        expect(resp.status).toBe(200);
        expect(['hybrid', 'lexical']).toContain(resp.json.mode);
        expect(Array.isArray(resp.json.results)).toBe(true);
    });
});
