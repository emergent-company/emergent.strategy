import { describe, it, expect } from 'vitest';
import { EmbeddingsService, EMBEDDING_DIMENSION } from '../src/modules/embeddings/embeddings.service';

// Guard: only run when a real key is provided AND explicitly enabled via either
// GOOGLE_API_KEY or RUN_EMBEDDINGS_IT. This prevents accidental CI/network usage.
const hasKey = !!process.env.GOOGLE_API_KEY;
const shouldRun = hasKey && (process.env.RUN_EMBEDDINGS_IT === 'true' || process.env.CI !== 'true');

// Minimal config stub matching the fields EmbeddingsService actually reads.
// (We avoid importing the full AppConfigService to keep this a focused integration test.)
const config = {
    embeddingsEnabled: hasKey, // mirrors production logic (enabled iff key present)
    googleApiKey: process.env.GOOGLE_API_KEY as string,
} as const;

// Define suite only when running; otherwise mark skipped explicitly.
const suite = shouldRun ? describe : describe.skip;

suite('EmbeddingsService (real model integration)', () => {
    const svc = new EmbeddingsService(config as any);

    it('generates document embeddings of expected dimension', async () => {
        const inputs = ['Hello world – integration test'];
        const vectors = await svc.embedDocuments(inputs);
        expect(vectors.length).toBe(1);
        const v = vectors[0];
        expect(Array.isArray(v)).toBe(true);
        expect(v.length).toBe(EMBEDDING_DIMENSION);
        // Spot‑check numeric sanity (no NaN / Infinity)
        expect(v.every((n) => Number.isFinite(n))).toBe(true);
    }, 25_000); // generous timeout for network

    it('generates a query embedding matching dimension', async () => {
        const vec = await svc.embedQuery('test query embedding');
        expect(vec.length).toBe(EMBEDDING_DIMENSION);
        expect(vec.every((n) => Number.isFinite(n))).toBe(true);
    }, 25_000);
});

// Provide guidance when skipped so developers know how to enable.
if (!shouldRun) {
    // eslint-disable-next-line no-console
    console.log('[embeddings.service.real.spec] Skipped (set GOOGLE_API_KEY and optionally RUN_EMBEDDINGS_IT=true to run)');
}
