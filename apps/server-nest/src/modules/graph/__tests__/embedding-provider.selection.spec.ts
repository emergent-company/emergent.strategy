import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../common/config/config.module';
import { DatabaseModule } from '../../../common/database/database.module';
import { GraphModule } from '../graph.module';
import { DummySha256EmbeddingProvider } from '../embedding.provider';
import { GoogleVertexEmbeddingProvider } from '../google-vertex-embedding.provider';

/**
 * Verifies DI selection logic for EMBEDDING_PROVIDER env flag.
 * Cases:
 *  - unset -> dummy
 *  - dummy -> dummy
 *  - vertex -> GoogleVertexEmbeddingProvider
 *  - google (alias) -> GoogleVertexEmbeddingProvider
 */

describe('Embedding Provider Selection', () => {
    const original = { ...process.env };
    afterAll(() => { process.env = { ...original }; });

    async function resolveProvider(): Promise<any> {
        const mod = await Test.createTestingModule({ imports: [AppConfigModule, DatabaseModule, GraphModule] }).compile();
        return mod.get('EMBEDDING_PROVIDER');
    }

    it('defaults to dummy when unset', async () => {
        delete process.env.EMBEDDING_PROVIDER;
        const provider = await resolveProvider();
        expect(provider).toBeInstanceOf(DummySha256EmbeddingProvider);
    });

    it('resolves dummy explicitly', async () => {
        process.env.EMBEDDING_PROVIDER = 'dummy';
        const provider = await resolveProvider();
        expect(provider).toBeInstanceOf(DummySha256EmbeddingProvider);
    });

    it('resolves vertex provider', async () => {
        process.env.EMBEDDING_PROVIDER = 'vertex';
        process.env.GOOGLE_API_KEY = 'key';
        const provider = await resolveProvider();
        expect(provider).toBeInstanceOf(GoogleVertexEmbeddingProvider);
    });

    it('resolves google alias provider', async () => {
        process.env.EMBEDDING_PROVIDER = 'google';
        process.env.GOOGLE_API_KEY = 'key';
        const provider = await resolveProvider();
        expect(provider).toBeInstanceOf(GoogleVertexEmbeddingProvider);
    });
});
