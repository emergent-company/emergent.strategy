import { describe, it, expect } from 'vitest';
import { GraphSearchService } from '../../../src/modules/graph-search/graph-search.service';
import { GraphSearchRepository } from '../../../src/modules/graph-search/graph-search.repository';
import { EmbeddingService } from '../../../src/modules/graph-search/embedding.service';

class PerfEmbedding extends EmbeddingService {
  async embedQuery(q: string): Promise<number[]> {
    return Array.from({ length: 16 }, (_, i) => (q.length + i) / 50);
  }
}

class PerfRepo extends GraphSearchRepository {
  constructor() {
    super(null as any); // Pass null since we override the methods
  }
  async lexicalCandidates(query: string, limit: number) {
    // Return consistent test data for performance tests
    return [
      { id: 'docA', lexical_score: 0.9 },
      { id: 'docB', lexical_score: 0.85 },
      { id: 'docC', lexical_score: 0.8 },
      { id: 'docD', lexical_score: 0.75 },
      { id: 'docE', lexical_score: 0.7 },
      { id: 'docF', lexical_score: 0.65 },
      { id: 'docG', lexical_score: 0.6 },
      { id: 'docH', lexical_score: 0.55 },
    ];
  }
  async vectorCandidates(_embedding: number[], limit: number) {
    return [
      { id: 'docA', vector_score: 0.95 },
      { id: 'docC', vector_score: 0.9 },
      { id: 'docE', vector_score: 0.85 },
      { id: 'docG', vector_score: 0.8 },
      { id: 'docI', vector_score: 0.75 },
    ];
  }
  async hydrateObjects(_ids: string[]): Promise<Map<string, any>> {
    return new Map(); // Return empty map to avoid DB call
  }
}

/**
 * AT-GSP-11: Forward vs backward pagination latency parity.
 * We sample multiple pages in each direction, average meta.elapsed_ms and assert parity
 * within ±5% OR an absolute delta < 5ms (to avoid flakiness for very small times).
 */
describe('GraphSearchService performance parity (AT-GSP-11)', () => {
  const service = new GraphSearchService(
    new PerfRepo(),
    new PerfEmbedding() as any
  );
  const ITERATIONS = 20;

  it('forward vs backward latency parity (mean & p95)', async () => {
    // Warm
    await service.search(
      { query: 'performance test seed', pagination: { limit: 5 } } as any,
      { debug: false, scopes: [] }
    );
    await service.search(
      {
        query: 'performance test seed',
        pagination: { limit: 5, direction: 'backward' },
      } as any,
      { debug: false, scopes: [] }
    );

    const forwardTimes: number[] = [];
    const backwardTimes: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      // Forward page 1
      const f1 = await service.search(
        { query: 'performance test seed', pagination: { limit: 5 } } as any,
        { debug: false, scopes: [] }
      );
      forwardTimes.push(f1.meta.elapsed_ms);
      if (f1.meta.nextCursor) {
        const f2 = await service.search(
          {
            query: 'performance test seed',
            pagination: { limit: 5, cursor: f1.meta.nextCursor },
          } as any,
          { debug: false, scopes: [] }
        );
        forwardTimes.push(f2.meta.elapsed_ms);
      }
      // Backward path: simulate user lands on page2 then pages backward
      if (f1.meta.nextCursor) {
        const page2 = await service.search(
          {
            query: 'performance test seed',
            pagination: { limit: 5, cursor: f1.meta.nextCursor },
          } as any,
          { debug: false, scopes: [] }
        );
        if (page2.meta.prevCursor) {
          const back = await service.search(
            {
              query: 'performance test seed',
              pagination: {
                limit: 5,
                cursor: page2.meta.prevCursor,
                direction: 'backward',
              },
            } as any,
            { debug: false, scopes: [] }
          );
          backwardTimes.push(back.meta.elapsed_ms);
        } else {
          // Fallback: directly backward from first page
          const backFirst = await service.search(
            {
              query: 'performance test seed',
              pagination: { limit: 5, direction: 'backward' },
            } as any,
            { debug: false, scopes: [] }
          );
          backwardTimes.push(backFirst.meta.elapsed_ms);
        }
      }
    }

    const stats = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor(0.95 * (sorted.length - 1));
      const p95 = sorted[idx];
      return { mean, p95 };
    };
    const fStats = stats(forwardTimes);
    const bStats = stats(backwardTimes);
    const meanDelta = Math.abs(fStats.mean - bStats.mean);
    const p95Delta = Math.abs(fStats.p95 - bStats.p95);
    const meanRatio = meanDelta / Math.max(fStats.mean, bStats.mean);
    const p95Ratio = p95Delta / Math.max(fStats.p95, bStats.p95);

    const meanOk = meanRatio <= 0.05 || meanDelta < 5;
    const p95Ok = p95Ratio <= 0.05 || p95Delta < 5;
    if (!(meanOk && p95Ok)) {
      console.warn('[AT-GSP-11] parity breach', {
        fStats,
        bStats,
        meanDelta,
        p95Delta,
        meanRatio,
        p95Ratio,
      });
    }
    expect(meanOk && p95Ok).toBe(true);
  });
});
