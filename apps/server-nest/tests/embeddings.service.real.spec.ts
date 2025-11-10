import { describe, it, expect } from 'vitest';
import { EmbeddingsService, EMBEDDING_DIMENSION } from '../src/modules/embeddings/embeddings.service';

// Use DummySha256EmbeddingProvider for deterministic testing without real API calls.
// This provider is used when embeddingsEnabled is false, providing predictable 768-dim vectors.
const config = {
    embeddingsEnabled: false, // Use DummySha256EmbeddingProvider (no real API)
    googleApiKey: undefined,
} as const;

describe('EmbeddingsService (with DummySha256EmbeddingProvider)', () => {
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
    });

    it('generates a query embedding matching dimension', async () => {
        const vec = await svc.embedQuery('test query embedding');
        expect(vec.length).toBe(EMBEDDING_DIMENSION);
        expect(vec.every((n) => Number.isFinite(n))).toBe(true);
    });
});
