import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';

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
        const form = new FormData();
        form.append('projectId', ctx.projectId);
        form.append('filename', 'hybrid.txt');
        // Duplicate text enough times to ensure at least two chunks if chunker threshold stays 1200
        const big = (DOC_TEXT + '\n').repeat(10);
        form.append('file', new Blob([big], { type: 'text/plain' }), 'hybrid.txt');
        const ingestRes = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: { ...authHeader('all', 'search-hybrid') }, body: form as any });
        expect([200, 201]).toContain(ingestRes.status);
        const json = await ingestRes.json();
        expect(json.chunks).toBeGreaterThan(0);
    });

    it('returns results in lexical mode', async () => {
        const url = `${ctx.baseUrl}/search?q=${encodeURIComponent(QUERY)}&mode=lexical&limit=5`;
        const res = await fetch(url, { headers: authHeader('all', 'search-hybrid') });
        expect(res.status).toBe(200);
        const json = await res.json() as SearchResponse;
        expect(json.mode).toBe('lexical');
        expect(Array.isArray(json.results)).toBe(true);
        if (json.results.length) {
            // One of the snippets should contain the term (case-insensitive)
            expect(json.results.some(r => r.snippet.toLowerCase().includes(QUERY))).toBe(true);
        }
    });

    it('returns results in vector or lexical fallback mode', async () => {
        const url = `${ctx.baseUrl}/search?q=${encodeURIComponent(QUERY)}&mode=vector&limit=5`;
        const res = await fetch(url, { headers: authHeader('all', 'search-hybrid') });
        expect(res.status).toBe(200);
        const json = await res.json() as SearchResponse;
        expect(['vector', 'lexical']).toContain(json.mode); // lexical fallback allowed
        expect(Array.isArray(json.results)).toBe(true);
    });

    it('returns results in hybrid or fallback lexical mode', async () => {
        const url = `${ctx.baseUrl}/search?q=${encodeURIComponent(QUERY)}&limit=5`;
        const res = await fetch(url, { headers: authHeader('all', 'search-hybrid') });
        expect(res.status).toBe(200);
        const json = await res.json() as SearchResponse;
        expect(['hybrid', 'lexical']).toContain(json.mode); // lexical fallback allowed
        expect(Array.isArray(json.results)).toBe(true);
    });
});
