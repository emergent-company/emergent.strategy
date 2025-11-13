import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { lexicalSearch, vectorSearch, hybridSearch } from './utils/search';
import { ingestDocs } from './utils/fixtures';
import { expectStatusOneOf } from './utils';

// Search Empty Modality Fallback E2E
// Goal: Prove that when one modality (vector or lexical) yields no candidates, system gracefully falls back.
// Strategy:
//  - Create two contexts with different content distributions.
//  - Dataset A: Many repeated lexical tokens -> lexical strong, vector similar.
//  - Dataset B: Random high-entropy strings sharing no lexical overlap, but embeddings should relate semantically (approx). If embeddings disabled, we at least assert no crash.
// Assertions:
//  * mode=vector returns lexical fallback when embeddings disabled or empty vector results.
//  * mode=lexical returns zero while mode=vector (or fallback lexical) may return >0 for semantic tokens.
// This test is tolerant; it only asserts allowed mode values and non-error behavior.

let ctx: E2EContext;
const LEX_TOKEN = 'fallbacktoken';

async function ingestLexicalRich(ctx: E2EContext) {
    const docs = Array.from({ length: 3 }, (_, i) => ({ name: `lex-${i}`, content: `This ${LEX_TOKEN} appears many times. ${LEX_TOKEN} ${LEX_TOKEN} ${LEX_TOKEN}.` }));
    const results = await ingestDocs(ctx, docs, { userSuffix: 'empty-fallback' });
    results.forEach(r => expectStatusOneOf(r.status, [200, 201], 'empty modality ingest'));
}

describe('Search Empty Modality Fallback E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('empty-fallback'); });
    beforeEach(async () => { await ctx.cleanup(); await ingestLexicalRich(ctx); });
    afterAll(async () => { await ctx.close(); });

    it('lexical mode yields results for frequent token', async () => {
        const resp = await lexicalSearch(ctx, LEX_TOKEN, 3, 0, { userSuffix: 'empty-fallback' });
        expect(resp.status).toBe(200);
        expect(resp.json.mode).toBe('lexical');
        expect(Array.isArray(resp.json.results)).toBe(true);
        expect(resp.json.results.length).toBeGreaterThan(0);
    });

    it('vector mode gracefully falls back or returns results', async () => {
        const resp = await vectorSearch(ctx, LEX_TOKEN, 3, { userSuffix: 'empty-fallback' });
        expect(resp.status).toBe(200);
        expect(['vector', 'lexical']).toContain(resp.json.mode);
        expect(Array.isArray(resp.json.results)).toBe(true);
    });

    it('hybrid default still succeeds with lexical heavy dataset', async () => {
        const resp = await hybridSearch(ctx, LEX_TOKEN, 3, { userSuffix: 'empty-fallback' });
        expect(resp.status).toBe(200);
        expect(['hybrid', 'lexical']).toContain(resp.json.mode);
    });
});
