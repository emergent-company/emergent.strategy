import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingsService, EMBEDDING_DIMENSION } from '../../src/modules/embeddings/embeddings.service';
import { AppConfigService } from '../../src/common/config/config.service';
import { validate } from '../../src/common/config/config.schema';

// Mock dynamic import of @langchain/google-genai
vi.mock('@langchain/google-genai', () => {
    return {
        GoogleGenerativeAIEmbeddings: class MockEmbeddingsClient {
            public embedQuery = vi.fn(async (text: string) => Array.from({ length: EMBEDDING_DIMENSION }, (_, i) => i));
            public embedDocuments = vi.fn(async (texts: string[]) => texts.map((_, idx) => Array.from({ length: EMBEDDING_DIMENSION }, () => idx)));
        },
    };
});

function build(configOverrides: Record<string, any> = {}) {
    const env = validate({
        EMBEDDING_PROVIDER: configOverrides.EMBEDDING_PROVIDER,
    });
    const config = new AppConfigService(env);
    const svc = new EmbeddingsService(config);
    return { config, svc };
}

describe('EmbeddingsService (Legacy - use Vertex AI in production)', () => {
    const ORIGINAL_ENV = { ...process.env };
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.GOOGLE_API_KEY;
        delete process.env.EMBEDDING_PROVIDER;
    });
    afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

    it('is disabled when EMBEDDING_PROVIDER not set to google/vertex', () => {
        const { svc } = build();
        expect(svc.isEnabled()).toBe(false);
    });

    it('ensureClient throws when disabled (no EMBEDDING_PROVIDER)', async () => {
        const { svc } = build();
        await expect(svc.embedQuery('hi')).rejects.toThrow(/Embeddings disabled/);
    });

    it('ensureClient throws when enabled but GOOGLE_API_KEY missing', async () => {
        // Set EMBEDDING_PROVIDER but not GOOGLE_API_KEY
        process.env.EMBEDDING_PROVIDER = 'google';
        const { svc } = build({ EMBEDDING_PROVIDER: 'google' });
        await expect(svc.embedQuery('hi')).rejects.toThrow(/GOOGLE_API_KEY not set/);
    });

    it('lazy initializes client and caches for subsequent calls (embedQuery)', async () => {
        // Set GOOGLE_API_KEY before building the service
        process.env.GOOGLE_API_KEY = 'test-key';
        process.env.EMBEDDING_PROVIDER = 'google';
        const { svc } = build({ EMBEDDING_PROVIDER: 'google' });
        const res = await svc.embedQuery('hello world');
        expect(res).toHaveLength(EMBEDDING_DIMENSION);
        // Second call should reuse same client
        const res2 = await svc.embedQuery('second');
        expect(res2).toHaveLength(EMBEDDING_DIMENSION);
        expect(res[0]).toBe(0);
    });

    it('embedDocuments returns expected shape and uses existing client', async () => {
        // Set GOOGLE_API_KEY before building the service
        process.env.GOOGLE_API_KEY = 'test-key';
        process.env.EMBEDDING_PROVIDER = 'google';
        const { svc } = build({ EMBEDDING_PROVIDER: 'google' });
        const docs = await svc.embedDocuments(['a', 'b']);
        expect(docs).toHaveLength(2);
        expect(docs[0]).toHaveLength(EMBEDDING_DIMENSION);
        expect(docs[1]).toHaveLength(EMBEDDING_DIMENSION);
        // Call query to confirm reuse
        await svc.embedQuery('c');
    });

    it('propagates underlying client errors', async () => {
        // Set GOOGLE_API_KEY before building the service
        process.env.GOOGLE_API_KEY = 'test-key';
        process.env.EMBEDDING_PROVIDER = 'google';
        const { svc } = build({ EMBEDDING_PROVIDER: 'google' });
        // Force client creation
        // @ts-expect-error accessing private for test
        const client = await svc.ensureClient();
        // Override the instance method
        (client.embedQuery as any) = vi.fn(async () => { throw new Error('underlying fail'); });
        await expect(svc.embedQuery('boom')).rejects.toThrow(/underlying fail/);
    });
});
