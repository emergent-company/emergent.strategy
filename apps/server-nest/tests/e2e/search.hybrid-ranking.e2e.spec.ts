import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { hybridSearch } from './utils/search';
import { ingestDocs } from './utils/fixtures';
import { expectStatusOneOf } from './utils';

/**
 * Hybrid / Vector Deterministic Ranking E2E
 * Objective: Provide a minimal yet meaningful assertion that when embeddings are enabled and hybrid mode
 * is requested, documents that are BOTH strong lexical matches AND semantically similar surface ahead of
 * those with only one signal. We design three documents:
 *  A. Repeats BOTH terms multiple times (strong lexical + strong semantic) -> should rank highest.
 *  B. Repeats only first term many times (strong lexical partial) -> should rank after A.
 *  C. Contains paraphrased semantic context with low direct term frequency (semantic-only) -> may appear after B.
 *
 * Assertions:
 *  - If mode resolves to 'hybrid', expect first result snippet to contain BOTH terms.
 *  - If mode falls back to lexical, we only assert that a document with both terms appears before one with a single term where possible.
 *  - If mode resolves to 'vector', we assert at least one result and skip ordering (environmental variability in embedding models).
 */

interface SearchResult { id: string; snippet: string; score: number; }
interface SearchResponse { mode: string; results: SearchResult[]; warning?: string; }

let ctx: E2EContext;
const TERM1 = 'hybridrank';
const TERM2 = 'fusiontoken';

async function ingest(ctx: E2EContext, name: string, content: string) {
    const results = await ingestDocs(ctx, [{ name, content }], { userSuffix: 'hybrid-rank' });
    expectStatusOneOf(results[0].status, [200, 201], 'hybrid rank ingest');
}

describe('Search Hybrid Ranking E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('hybrid-rank'); });
    beforeEach(async () => {
        await ctx.cleanup();
        // Doc A: strong lexical for both terms
        await ingest(ctx, 'docA', `${TERM1} ${TERM2} ${TERM1} ${TERM2} both signals reinforce ${TERM1} ${TERM2}`);
        // Doc B: only TERM1 repeated
        await ingest(ctx, 'docB', `${TERM1} ${TERM1} lexical emphasis only ${TERM1} repeated ${TERM1}`);
        // Doc C: semantic paraphrase referencing concept of fusion without direct TERM2 repetition
        await ingest(ctx, 'docC', `This text discusses blending signals; a fusion of ranking evidence akin to ${TERM1} approaches.`);
    });
    afterAll(async () => { await ctx.close(); });

    it('prioritizes dual-signal document in hybrid mode', async () => {
        const resp = await hybridSearch(ctx, `${TERM1} ${TERM2}`, 10, { userSuffix: 'hybrid-rank' });
        expect(resp.status).toBe(200);
        const json = resp.json;
        expect(Array.isArray(json.results)).toBe(true);
        if (!json.results.length) return;
        if (json.mode === 'hybrid') {
            const top = (json.results[0].snippet || '').toLowerCase();
            expect(top.includes(TERM1.toLowerCase())).toBe(true);
            expect(top.includes(TERM2.toLowerCase())).toBe(true);
        } else if (json.mode === 'lexical') {
            const bothIdx = json.results.findIndex(r => (r.snippet || '').toLowerCase().includes(TERM1) && (r.snippet || '').toLowerCase().includes(TERM2));
            const onlyIdx = json.results.findIndex(r => (r.snippet || '').toLowerCase().includes(TERM1) && !(r.snippet || '').toLowerCase().includes(TERM2));
            if (bothIdx !== -1 && onlyIdx !== -1) {
                expect(bothIdx).toBeLessThan(onlyIdx);
            }
        } else if (json.mode === 'vector') {
            expect(json.results.length).toBeGreaterThan(0);
        }
    });
});
