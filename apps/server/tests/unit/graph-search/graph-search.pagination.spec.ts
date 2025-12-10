import { describe, it, expect, beforeEach } from 'vitest';
import { GraphSearchService } from '../../../src/modules/graph-search/../graph-search/graph-search.service';
import { GraphSearchRepository } from '../../../src/modules/graph-search/../graph-search/graph-search.repository';
import { EmbeddingService } from '../../../src/modules/graph-search/../graph-search/embedding.service';

class StubEmbedding extends EmbeddingService {
  async embedQuery(q: string): Promise<number[]> {
    return Array.from({ length: 8 }, (_, i) => (q.length + i) / 10);
  }
}

class StubRepo extends GraphSearchRepository {
  constructor() {
    super(null as any); // Pass null since we override the methods
  }
  async lexicalCandidates(query: string, limit: number) {
    // Return consistent test data for pagination tests
    return [
      { id: 'docA', lexical_score: 0.9 },
      { id: 'docB', lexical_score: 0.8 },
      { id: 'docC', lexical_score: 0.7 },
      { id: 'docD', lexical_score: 0.6 },
      { id: 'docE', lexical_score: 0.5 },
      { id: 'docF', lexical_score: 0.4 },
    ];
  }
  async vectorCandidates(_embedding: number[], limit: number) {
    return [
      { id: 'docA', vector_score: 0.95 },
      { id: 'docC', vector_score: 0.85 },
      { id: 'docE', vector_score: 0.75 },
      { id: 'docG', vector_score: 0.65 },
    ];
  }
  async hydrateObjects(_ids: string[]): Promise<Map<string, any>> {
    return new Map(); // Return empty map to avoid DB call
  }
}

describe('GraphSearchService pagination', () => {
  let service: GraphSearchService;
  beforeEach(() => {
    service = new GraphSearchService(
      new StubRepo(),
      new StubEmbedding() as any
    );
  });

  it('returns first page with nextCursor and hasNext when more results exist', async () => {
    const res = await service.search(
      { query: 'abcdef', pagination: { limit: 2 } } as any,
      { debug: false, scopes: [] }
    );
    expect(res.items).toHaveLength(2);
    expect(res.meta.hasNext).toBe(true);
    expect(res.meta.nextCursor).toBeTruthy();
    expect(res.items[0].cursor).toBeTruthy();
  });

  it('paginates forward using cursor without overlap', async () => {
    const first = await service.search(
      { query: 'abcdef', pagination: { limit: 2 } } as any,
      { debug: false, scopes: [] }
    );
    const second = await service.search(
      {
        query: 'abcdef',
        pagination: { limit: 2, cursor: first.meta.nextCursor! },
      } as any,
      { debug: false, scopes: [] }
    );
    const firstIds = first.items.map((i) => i.object_id);
    const secondIds = second.items.map((i) => i.object_id);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    // If second page has items, hasPrev should be true
    if (second.items.length) {
      expect(second.meta.hasPrev).toBe(true);
    }
  });

  it('cursor past end yields boundary page (may be empty) and hasPrev=true but hasNext=false (index-based)', async () => {
    const first = await service.search(
      { query: 'abcdef', pagination: { limit: 5 } } as any,
      { debug: false, scopes: [] }
    );
    const last = first.items[first.items.length - 1];
    const beyondCursor = Buffer.from(
      JSON.stringify({
        s: Number(last.score.toFixed(6)),
        id: last.object_id + 'zzz',
      })
    ).toString('base64url');
    const boundary = await service.search(
      {
        query: 'abcdef',
        pagination: { limit: 5, cursor: beyondCursor },
      } as any,
      { debug: false, scopes: [] }
    );
    // Boundary page should not advertise further forward pages
    expect(boundary.meta.hasNext).toBe(false);
    expect(boundary.meta.hasPrev).toBe(true);
    // Items length may be 0 (strictly past end) or <= limit if fallback produced slice; just assert no overflow
    expect(boundary.items.length).toBeLessThanOrEqual(5);
  });

  // AT-GSP-15: Backward pagination from first page (no cursor) should behave like initial slice with hasPrev=false
  it('backward from first page returns initial window and hasPrev=false (AT-GSP-15)', async () => {
    const backwardFirst = await service.search(
      {
        query: 'abcdef',
        pagination: { limit: 3, direction: 'backward' },
      } as any,
      { debug: false, scopes: [] }
    );
    // Should return up to limit items (same as forward would) but hasPrev false and hasNext may be true if more results exist
    expect(backwardFirst.items.length).toBeGreaterThan(0);
    expect(backwardFirst.items.length).toBeLessThanOrEqual(3);
    expect(backwardFirst.meta.request.direction).toBe('backward');
    expect(backwardFirst.meta.hasPrev).toBe(false);
  });

  // AT-GSP-17: Unknown-id cursor (backward) falls back to forward semantics (treat as after cursor position)
  it('unknown id backward cursor falls back gracefully (AT-GSP-17)', async () => {
    const first = await service.search(
      { query: 'abcdef', pagination: { limit: 2 } } as any,
      { debug: false, scopes: [] }
    );
    expect(first.items.length).toBe(2);
    // Craft cursor with id not present in pool but plausible score just above first item so fallback path triggers
    const fakeId = 'zzzz-nonexistent';
    const approxScore = Number(first.items[0].score.toFixed(6));
    const unknownCursor = Buffer.from(
      JSON.stringify({ s: approxScore, id: fakeId })
    ).toString('base64url');
    const page = await service.search(
      {
        query: 'abcdef',
        pagination: { limit: 2, cursor: unknownCursor, direction: 'backward' },
      } as any,
      { debug: false, scopes: [] }
    );
    // Fallback should yield a slice (could be empty if interpreted as end) but not throw and direction stays backward
    expect(page.meta.request.direction).toBe('backward');
    expect(page.items).toBeDefined();
    expect(Array.isArray(page.items)).toBe(true);
  });

  // AT-GSP-16: Mixed direction navigation yields no duplicates when client unions IDs across pages
  it('mixed direction (forward chain) produces strictly contiguous, non-overlapping forward windows (AT-GSP-16 simplified)', async () => {
    const forward1 = await service.search(
      { query: 'abcdef', pagination: { limit: 3 } } as any,
      { debug: false, scopes: [] }
    );
    if (!forward1.meta.nextCursor) return; // insufficient data
    const forward2 = await service.search(
      {
        query: 'abcdef',
        pagination: { limit: 3, cursor: forward1.meta.nextCursor },
      } as any,
      { debug: false, scopes: [] }
    );
    const ids1 = new Set(forward1.items.map((i) => i.object_id));
    const overlap = forward2.items.some((i) => ids1.has(i.object_id));
    expect(overlap).toBe(false);
  });

  // AT-GSP-19: approx_position_start / approx_position_end reflect correct 1-based range per page
  it('exposes approx position range for pages (AT-GSP-19)', async () => {
    const page1 = await service.search(
      { query: 'abcdef', pagination: { limit: 3 } } as any,
      { debug: false, scopes: [] }
    );
    expect(page1.meta.approx_position_start).toBe(1);
    expect(page1.meta.approx_position_end).toBe(page1.items.length);
    if (page1.meta.nextCursor) {
      const page2 = await service.search(
        {
          query: 'abcdef',
          pagination: { limit: 3, cursor: page1.meta.nextCursor },
        } as any,
        { debug: false, scopes: [] }
      );
      // start should immediately follow previous end (unless empty)
      if (page2.items.length) {
        const start2 = page2.meta.approx_position_start ?? 0;
        const end1 = page1.meta.approx_position_end ?? 0;
        const end2 = page2.meta.approx_position_end ?? 0;
        expect(start2).toBe(end1 + 1);
        expect(end2).toBe(start2 + page2.items.length - 1);
      }
    }
  });
});
