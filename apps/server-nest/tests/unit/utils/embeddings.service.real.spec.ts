import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmbeddingsService,
  EMBEDDING_DIMENSION,
} from '../../../src/modules/embeddings/embeddings.service';
import { AppConfigService } from '../../../src/common/config/config.service';
import { validate } from '../../../src/common/config/config.schema';

// Mock @langchain/google-genai to provide deterministic test vectors without real API calls
vi.mock('@langchain/google-genai', () => {
  return {
    GoogleGenerativeAIEmbeddings: class MockEmbeddingsClient {
      public embedQuery = vi.fn(async (_text: string) =>
        Array.from({ length: EMBEDDING_DIMENSION }, (_, i) => Math.random())
      );
      public embedDocuments = vi.fn(async (texts: string[]) =>
        texts.map(() =>
          Array.from({ length: EMBEDDING_DIMENSION }, () => Math.random())
        )
      );
    },
  };
});

function buildService() {
  const env = validate({
    EMBEDDING_PROVIDER: 'google', // Enable embeddings
  });
  const config = new AppConfigService(env);
  const svc = new EmbeddingsService(config);
  return svc;
}

describe('EmbeddingsService (with mocked provider)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set required environment variables for the service to work
    process.env.EMBEDDING_PROVIDER = 'google';
    process.env.GOOGLE_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('generates document embeddings of expected dimension', async () => {
    const svc = buildService();
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
    const svc = buildService();
    const vec = await svc.embedQuery('test query embedding');
    expect(vec.length).toBe(EMBEDDING_DIMENSION);
    expect(vec.every((n) => Number.isFinite(n))).toBe(true);
  });
});
