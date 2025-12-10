import { describe, it, expect, beforeEach } from 'vitest';
import { GraphSearchService } from '../../../src/modules/graph-search/graph-search.service';
import { GraphSearchRepository } from '../../../src/modules/graph-search/graph-search.repository';
import { EmbeddingService } from '../../../src/modules/graph-search/embedding.service';

class StubEmbedding extends EmbeddingService {
  async embedQuery(q: string): Promise<number[]> {
    return Array.from({ length: 4 }, (_, i) => (q.length + i) / 10);
  }
}

class StubRepo extends GraphSearchRepository {
  constructor() {
    super(null as any); // Pass null since we override the methods
  }
  async lexicalCandidates(query: string, limit: number) {
    return [
      { id: 'docA', lexical_score: 0.4 },
      { id: 'docB', lexical_score: 0.6 },
    ];
  }
  async vectorCandidates(_embedding: number[], limit: number) {
    return [
      { id: 'docA', vector_score: 0.9 },
      { id: 'docC', vector_score: 0.8 },
    ];
  }
  async hydrateObjects(_ids: string[]): Promise<Map<string, any>> {
    return new Map(); // Return empty map to avoid DB call
  }
}

describe('GraphSearchService telemetry (AT-GSP-12)', () => {
  let service: GraphSearchService;
  beforeEach(() => {
    service = new GraphSearchService(
      new StubRepo(),
      new StubEmbedding() as any
    );
  });

  it('emits pagination telemetry event with required fields', async () => {
    const res = await service.search(
      { query: 'some query', pagination: { limit: 3 } } as any,
      { debug: false, scopes: [] }
    );
    expect(res.items.length).toBeGreaterThan(0);
    const t = service.getTelemetry();
    expect(t.pageEvents).toBe(1);
    expect(t.last).toBeTruthy();
    expect(t.last.type).toBe('graph.search.page');
    expect(t.last.direction).toBe('forward');
    expect(typeof t.last.requested_limit).toBe('number');
    expect(typeof t.last.effective_limit).toBe('number');
    expect(typeof t.last.elapsed_ms).toBe('number');
    expect(t.last.page_item_count).toBe(res.items.length);
    expect(t.last.total_estimate).toBe(res.meta.total_estimate);
    // query hash should be 8 hex chars
    expect(t.last.query_hash).toMatch(/^[0-9a-f]{8}$/);
  });
});
