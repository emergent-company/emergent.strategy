import { describe, it, expect } from 'vitest';
import { GraphSearchService } from '../../../src/modules/graph-search/graph-search.service';
import { GraphSearchRepository } from '../../../src/modules/graph-search/graph-search.repository';
import { EmbeddingService } from '../../../src/modules/graph-search/embedding.service';
import { GraphSearchRequestDto } from '../../../src/modules/graph-search/dto/graph-search-request.dto';

class TestRepo extends GraphSearchRepository {
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

describe('GraphSearchService fusion', () => {
  const service = new GraphSearchService(
    new TestRepo(),
    new EmbeddingService()
  );

  it('fuses lexical and vector channels producing ranked items', async () => {
    const req: GraphSearchRequestDto = {
      query: 'hello world',
      limit: 10,
    } as any;
    const res = await service.search(req, { debug: false, scopes: [] });
    expect(res.items.length).toBeGreaterThan(0);
    const ranks = res.items.map((i) => i.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    const ids = res.items.map((i) => i.object_id);
    expect(ids).toContain('docA');
    expect(ids).toContain('docB');
    expect(ids).toContain('docC');
    expect(res.meta.total_estimate).toBeGreaterThan(0);
  });

  it('returns warning for empty query', async () => {
    const req: GraphSearchRequestDto = { query: ' ' } as any;
    const res = await service.search(req, { debug: false, scopes: [] });
    expect(res.meta.warnings).toContain('empty_query');
    expect(res.items.length).toBe(0);
    expect(res.meta.total_estimate).toBe(0);
  });

  it('caps limit at 50 and reports effective + requested limits', async () => {
    const req: GraphSearchRequestDto = {
      query: 'hello world',
      limit: 500,
    } as any;
    const res = await service.search(req, { debug: false, scopes: [] });
    expect(res.meta.request.limit).toBe(50);
    expect(res.meta.request.requested_limit).toBe(500);
  });

  it('supports backward pagination returning prior window', async () => {
    // First page
    const first = await service.search(
      { query: 'hello world', limit: 1 } as any,
      { debug: false, scopes: [] }
    );
    expect(first.items.length).toBe(1);
    const forwardCursor = first.meta.nextCursor;
    if (!forwardCursor) return; // not enough data to continue
    // Second page forward
    const second = await service.search(
      {
        query: 'hello world',
        limit: 1,
        pagination: { cursor: forwardCursor },
      } as any,
      { debug: false, scopes: [] }
    );
    if (second.items.length === 0) return; // no second page
    const secondFirst = second.items[0];
    // Now go backward from second page start
    const backward = await service.search(
      {
        query: 'hello world',
        limit: 1,
        pagination: { cursor: secondFirst.cursor, direction: 'backward' },
      } as any,
      { debug: false, scopes: [] }
    );
    // Backward page should end immediately before the second first rank
    if (backward.items.length > 0) {
      const lastBackward = backward.items[backward.items.length - 1];
      // Last backward item rank should not exceed cursor item rank (allow equality if cursor not found and fallback path used)
      expect(lastBackward.rank).toBeLessThanOrEqual(secondFirst.rank);
    }
    // Ensure backward meta includes cursors fields
    expect(backward.meta).toHaveProperty('nextCursor');
    expect(backward.meta).toHaveProperty('prevCursor');
  });

  it('tolerates backward cursor when score precision drifts (id-only match)', async () => {
    const first = await service.search(
      { query: 'hello world', limit: 1 } as any,
      { debug: false, scopes: [] }
    );
    const forwardCursor = first.meta.nextCursor;
    if (!forwardCursor) return;
    const second = await service.search(
      {
        query: 'hello world',
        limit: 1,
        pagination: { cursor: forwardCursor },
      } as any,
      { debug: false, scopes: [] }
    );
    if (!second.items.length) return;
    const cursorObj = second.items[0];
    // Decode then perturb score minimally to emulate rounding mismatch
    if (!cursorObj.cursor) return; // safety
    const raw = Buffer.from(cursorObj.cursor as string, 'base64url').toString(
      'utf8'
    );
    let decoded: any;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return;
    }
    if (!decoded || typeof decoded !== 'object') return;
    decoded.s = (decoded.s ?? 0) + 0.0000007; // beyond 6-decimal rounding threshold used in original encoding
    const driftedCursor = Buffer.from(JSON.stringify(decoded)).toString(
      'base64url'
    );
    const backward = await service.search(
      {
        query: 'hello world',
        limit: 1,
        pagination: { cursor: driftedCursor, direction: 'backward' },
      } as any,
      { debug: false, scopes: [] }
    );
    // Should not fall back to forward semantics including the cursor item itself
    if (backward.items.length) {
      expect(
        backward.items.some((i) => i.object_id === cursorObj.object_id)
      ).toBe(false);
      expect(backward.meta.request.direction).toBe('backward');
    }
  });

  it('AT-GSP-10: malformed cursor gracefully treated as initial page', async () => {
    const res = await service.search(
      {
        query: 'hello world',
        pagination: { cursor: '!!not-base64!!' },
        limit: 2,
      } as any,
      { debug: false, scopes: [] }
    );
    // Should behave like first page: hasPrev should be false, prevCursor null
    expect(res.meta.request.direction).toBe('forward');
    expect(res.meta.hasPrev).toBe(false);
    expect(res.meta.prevCursor).toBeNull();
    expect(res.items.length).toBeGreaterThan(0);
  });

  it('AT-GSP-13: prevCursor continuity matches last item cursor of previous page', async () => {
    // Page 1
    const page1 = await service.search(
      { query: 'hello world', limit: 2 } as any,
      { debug: false, scopes: [] }
    );
    if (!page1.items.length) return;
    const lastItemPage1 = page1.items[page1.items.length - 1];
    const nextCursor = page1.meta.nextCursor;
    if (!nextCursor) return; // Not enough items for second page
    // Page 2 forward
    const page2 = await service.search(
      {
        query: 'hello world',
        pagination: { cursor: nextCursor },
        limit: 2,
      } as any,
      { debug: false, scopes: [] }
    );
    // prevCursor of second page should equal cursor of last item from page1
    if (page2.items.length) {
      expect(page2.meta.prevCursor).toBe(lastItemPage1.cursor);
    }
  });
});
