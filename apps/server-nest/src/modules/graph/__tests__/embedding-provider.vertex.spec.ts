import { describe, it, expect, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../common/config/config.module';
import { DatabaseModule } from '../../../common/database/database.module';
import { GraphModule } from '../graph.module';
import { GoogleVertexEmbeddingProvider } from '../google-vertex-embedding.provider';

// These tests focus on provider behavior under different env toggles.
// Network call is mocked via global.fetch.

describe('GoogleVertexEmbeddingProvider integration modes', () => {
    const originalEnv = { ...process.env };
    afterEach(() => { process.env = { ...originalEnv }; delete (global as any).fetch; });

    async function make(): Promise<GoogleVertexEmbeddingProvider> {
        const mod = await Test.createTestingModule({ imports: [AppConfigModule, DatabaseModule, GraphModule] }).compile();
        return mod.get('EMBEDDING_PROVIDER');
    }

    it('uses deterministic fallback when Vertex AI not initialized', async () => {
        // Set provider to 'vertex' but don't set project ID, so Vertex AI won't initialize
        process.env.EMBEDDING_PROVIDER = 'vertex';
        delete process.env.VERTEX_EMBEDDING_PROJECT;
        delete process.env.GOOGLE_API_KEY;
        const provider: any = await make();
        // Should NOT throw, but return deterministic stub instead
        const result = await provider.generate('hello');
        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });

    it('returns deterministic stub when network disabled', async () => {
        process.env.EMBEDDING_PROVIDER = 'vertex';
        process.env.GOOGLE_API_KEY = 'k';
        process.env.EMBEDDINGS_NETWORK_DISABLED = 'true';
        const provider: any = await make();
        const a = await provider.generate('hello world');
        const b = await provider.generate('hello world');
        expect(a.equals(b)).toBe(true); // deterministic
    });

    it('falls back on HTTP error but stays deterministic', async () => {
        process.env.EMBEDDING_PROVIDER = 'vertex';
        process.env.GOOGLE_API_KEY = 'k';
        (global as any).fetch = async () => ({ ok: false, status: 503 });
        const provider: any = await make();
        const a = await provider.generate('x');
        const b = await provider.generate('x');
        expect(a.equals(b)).toBe(true);
    });

    it('converts remote vector to Buffer when successful', async () => {
        process.env.EMBEDDING_PROVIDER = 'vertex';
        process.env.GOOGLE_API_KEY = 'k';
        (global as any).fetch = async () => ({
            ok: true,
            json: async () => ({ predictions: [{ embeddings: { values: [0.1, 0.2, 0.3] } }] }),
        });
        const provider: any = await make();
        const buf = await provider.generate('abc');
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf.byteLength).toBe(new Float32Array([0.1, 0.2, 0.3]).byteLength);
    });
});
