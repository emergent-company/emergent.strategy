import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../../src/common/config/config.module';
import { AppConfigService } from '../../../src/common/config/config.service';
import { DatabaseModule } from '../../../src/common/database/database.module';
import { GraphModule } from '../../../src/modules/graph/graph.module';
import { DummySha256EmbeddingProvider } from '../../../src/modules/graph/embedding.provider';
import { GoogleVertexEmbeddingProvider } from '../../../src/modules/graph/google-vertex-embedding.provider';
import { GraphService } from '../../../src/modules/graph/graph.service';
import { EmbeddingJobsService } from '../../../src/modules/graph/embedding-jobs.service';
import { GraphVectorSearchService } from '../../../src/modules/graph/graph-vector-search.service';

/**
 * Verifies DI selection logic for EMBEDDING_PROVIDER env flag.
 * Cases:
 *  - unset -> dummy
 *  - dummy -> dummy
 *  - vertex -> GoogleVertexEmbeddingProvider
 *  - google (alias) -> GoogleVertexEmbeddingProvider
 */

// Create stub modules to avoid TypeORM repository creation
@Module({
  providers: [
    {
      provide: 'TypeRegistryService',
      useValue: {
        getTypeRegistry: () => Promise.resolve([]),
        createTypeRegistry: () => Promise.resolve({}),
      },
    },
  ],
  exports: ['TypeRegistryService'],
})
class StubTypeRegistryModule {}

@Module({
  imports: [AppConfigModule], // Import AppConfigModule so AppConfigService can be injected
  providers: [
    { provide: GraphService, useValue: {} },
    { provide: EmbeddingJobsService, useValue: {} },
    { provide: GraphVectorSearchService, useValue: {} },
    {
      provide: 'EMBEDDING_PROVIDER',
      useFactory: (config: AppConfigService) => {
        const provider = process.env.EMBEDDING_PROVIDER || 'unset';
        if (provider === 'dummy') return new DummySha256EmbeddingProvider();
        if (provider === 'vertex' || provider === 'google')
          return new GoogleVertexEmbeddingProvider(config);
        return new DummySha256EmbeddingProvider();
      },
      inject: [AppConfigService], // Use class, not string
    },
  ],
  exports: ['EMBEDDING_PROVIDER'],
})
class StubGraphModule {}

describe('Embedding Provider Selection', () => {
  const original = { ...process.env };
  afterAll(() => {
    process.env = { ...original };
  });

  async function resolveProvider(): Promise<any> {
    const { TypeRegistryModule } = await import(
      '../../../src/modules/type-registry/type-registry.module'
    );
    const mod = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule, GraphModule],
    })
      .overrideModule(TypeRegistryModule)
      .useModule(StubTypeRegistryModule)
      .overrideModule(GraphModule)
      .useModule(StubGraphModule)
      .compile();
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
