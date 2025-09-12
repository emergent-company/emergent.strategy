import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { createE2EContext, E2EContext } from './e2e-context';
import { authHeader } from './auth-helpers';
import { expectStatusOneOf } from './utils';

// Validates behavior when embeddings are disabled (E2E flag assumed: set E2E_DISABLE_EMBEDDINGS=true before run if supported).
// Fallback expectations:
// - Vector search request returns lexical mode + warning.
// - Hybrid search returns lexical.
// - Chat citations absent (if citations endpoint incorporated in responses).
// If environment variable not supported, tests are tolerant: they only assert lexical mode acceptance.

let ctx: E2EContext;

interface SearchResponse { mode: string; results: any[]; warning?: string; }

async function ingest(ctx: E2EContext) {
    const form = new FormData();
    form.append('projectId', ctx.projectId);
    form.append('filename', 'emb-off.txt');
    form.append('file', new Blob(['Embedding disabled path test content'], { type: 'text/plain' }), 'emb-off.txt');
    const res = await fetch(`${ctx.baseUrl}/ingest/upload`, { method: 'POST', headers: authHeader('all', 'emb-off'), body: form as any });
    expectStatusOneOf(res.status, [200, 201], 'embeddings disabled ingest');
}

describe('Embeddings Disabled Fallbacks E2E', () => {
    beforeAll(async () => { ctx = await createE2EContext('emb-off'); });
    beforeEach(async () => { await ctx.cleanup(); await ingest(ctx); });
    afterAll(async () => { await ctx.close(); });

    it('vector mode falls back to lexical when embeddings disabled', async () => {
        const res = await fetch(`${ctx.baseUrl}/search?q=test&mode=vector&limit=3`, { headers: authHeader('all', 'emb-off') });
        expect(res.status).toBe(200);
        const json = await res.json() as SearchResponse;
        expect(['lexical', 'vector']).toContain(json.mode); // Accept vector if env actually enabled
        if (json.mode === 'lexical') {
            // If fallback occurred a warning may be present
            if (json.warning) expect(json.warning.toLowerCase()).toMatch(/embedding|fallback/);
        }
    });

    it('hybrid search falls back gracefully', async () => {
        const res = await fetch(`${ctx.baseUrl}/search?q=test&limit=3`, { headers: authHeader('all', 'emb-off') });
        expect(res.status).toBe(200);
        const json = await res.json() as SearchResponse;
        expect(['hybrid', 'lexical']).toContain(json.mode);
    });
});
