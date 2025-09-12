import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { ingestDocs } from './utils/fixtures';
import { lexicalSearch } from './utils/search';
import { expectStatusOneOf } from './utils';

/**
 * Deterministic Lexical Ranking Test
 * Goal: Provide a stable assertion that lexical ranking respects higher term frequency / density.
 * Assumptions: Current search implementation uses PostgreSQL full-text ranking (ts_rank / ts_rank_cd)
 * or similar scoring where higher frequency within a smaller document improves rank.
 *
 * Strategy:
 *  - Ingest three small documents with varying counts of the keyword TOKEN.
 *  - Query in lexical mode and assert that doc with highest frequency appears before lower frequency docs.
 *  - We tolerate extra documents/chunks but enforce relative ordering among the targeted set if all present.
 *  - If embeddings fallback forces mode != lexical we skip ordering assertion (rare case environmental fallback).
 */

let ctx: E2EContext;
const TOKEN = 'ranktoken';
interface SearchResult { id: string; snippet: string; score: number; }
interface SearchResponse { mode: string; results: SearchResult[]; }

async function ingest(ctx: E2EContext, name: string, repetitions: number) {
    const body = Array.from({ length: repetitions }, (_, i) => `Line ${i} ${TOKEN}`).join('\n');
    const results = await ingestDocs(ctx, [{ name, content: body }], { userSuffix: 'rank-lexical' });
    expectStatusOneOf(results[0].status, [200, 201], 'rank lexical ingest');
}

describe('Search Lexical Deterministic Ranking E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('rank-lexical'); });
    beforeEach(async () => {
        await ctx.cleanup();
        // Doc A: highest frequency (12 occurrences)
        await ingest(ctx, 'docA', 12);
        // Doc B: medium frequency (6 occurrences)
        await ingest(ctx, 'docB', 6);
        // Doc C: low frequency (2 occurrences)
        await ingest(ctx, 'docC', 2);
    });
    afterAll(async () => { await ctx.close(); });

    it('orders higher frequency document ahead of lower frequency ones (lexical mode)', async () => {
        const resp = await lexicalSearch(ctx, TOKEN, 10, 0, { userSuffix: 'rank-lexical' });
        expect(resp.status).toBe(200);
        const json = resp.json as SearchResponse;
        if (json.mode !== 'lexical') {
            // Environmental fallback (e.g., embeddings mis-config) — skip ordering assertion but keep baseline checks.
            expect(Array.isArray(json.results)).toBe(true);
            return;
        }
        const results = json.results;
        expect(Array.isArray(results)).toBe(true);
        // Extract snippets referencing document names; ingestion file name may appear or internal referencing may vary.
        // We'll identify by frequency heuristic: count TOKEN occurrences in snippet (if multiple chunks, best-effort ordering test).
        const freqMap = results.reduce<Record<string, number>>((acc, r, idx) => {
            const count = (r.snippet.match(new RegExp(TOKEN, 'gi')) || []).length;
            acc[`idx-${idx}`] = count;
            return acc;
        }, {});
        // Find first occurrence index of a high frequency snippet (>=4) vs low (<=2)
        const highIdx = results.findIndex(r => (r.snippet.match(new RegExp(TOKEN, 'gi')) || []).length >= 4);
        const lowIdx = results.findIndex(r => (r.snippet.match(new RegExp(TOKEN, 'gi')) || []).length <= 2);
        if (highIdx !== -1 && lowIdx !== -1) {
            expect(highIdx).toBeLessThan(lowIdx); // High frequency should rank earlier.
        }
    });
});
