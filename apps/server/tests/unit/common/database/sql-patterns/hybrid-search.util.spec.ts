import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hybridSearch,
  calculateStatistics,
  zScoreNormalize,
  minMaxNormalize,
  sigmoid,
  normalizeScore,
  fuseScores,
  HybridSearchConfig,
} from '../../../../../src/common/database/sql-patterns/hybrid-search.util';
import { DatabaseService } from '../../../../../src/common/database/database.service';

describe('Hybrid Search Utilities', () => {
  describe('calculateStatistics', () => {
    it('should calculate mean, std, min, max for a set of scores', () => {
      const scores = [1, 2, 3, 4, 5];
      const stats = calculateStatistics(scores);

      expect(stats.mean).toBe(3);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.std).toBeCloseTo(1.414, 2);
    });

    it('should handle empty array', () => {
      const stats = calculateStatistics([]);

      expect(stats.mean).toBe(0);
      expect(stats.std).toBe(1);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it('should handle single value', () => {
      const stats = calculateStatistics([5]);

      expect(stats.mean).toBe(5);
      expect(stats.std).toBe(1);
      expect(stats.min).toBe(5);
      expect(stats.max).toBe(5);
    });

    it('should avoid division by zero with identical scores', () => {
      const stats = calculateStatistics([3, 3, 3, 3]);

      expect(stats.mean).toBe(3);
      expect(stats.std).toBe(1); // Falls back to 1
      expect(stats.min).toBe(3);
      expect(stats.max).toBe(3);
    });
  });

  describe('zScoreNormalize', () => {
    it('should normalize score using z-score formula', () => {
      const stats = { mean: 10, std: 2, min: 0, max: 20 };

      expect(zScoreNormalize(10, stats)).toBe(0); // mean
      expect(zScoreNormalize(12, stats)).toBe(1); // +1 std
      expect(zScoreNormalize(8, stats)).toBe(-1); // -1 std
    });
  });

  describe('minMaxNormalize', () => {
    it('should normalize score to [0,1] range', () => {
      const stats = { mean: 10, std: 5, min: 0, max: 20 };

      expect(minMaxNormalize(0, stats)).toBe(0);
      expect(minMaxNormalize(10, stats)).toBe(0.5);
      expect(minMaxNormalize(20, stats)).toBe(1);
    });

    it('should handle zero range', () => {
      const stats = { mean: 5, std: 1, min: 5, max: 5 };

      expect(minMaxNormalize(5, stats)).toBe(0);
    });
  });

  describe('sigmoid', () => {
    it('should map z-scores to [0,1] range', () => {
      expect(sigmoid(0)).toBeCloseTo(0.5, 2);
      expect(sigmoid(5)).toBeGreaterThan(0.99);
      expect(sigmoid(-5)).toBeLessThan(0.01);
    });
  });

  describe('normalizeScore', () => {
    const stats = { mean: 10, std: 2, min: 0, max: 20 };

    it('should use z-score normalization with sigmoid by default', () => {
      const result = normalizeScore(12, stats, {
        normalization: 'zscore',
        applySigmoid: true,
      });

      // z = (12 - 10) / 2 = 1, sigmoid(1) ≈ 0.731
      expect(result).toBeCloseTo(0.731, 2);
    });

    it('should use z-score without sigmoid when disabled', () => {
      const result = normalizeScore(12, stats, {
        normalization: 'zscore',
        applySigmoid: false,
      });

      expect(result).toBe(1); // Raw z-score
    });

    it('should use min-max normalization', () => {
      const result = normalizeScore(10, stats, {
        normalization: 'minmax',
        applySigmoid: false,
      });

      expect(result).toBe(0.5); // (10 - 0) / (20 - 0)
    });
  });

  describe('fuseScores', () => {
    it('should fuse scores with equal weights by default', () => {
      const result = fuseScores(0.8, 0.6);

      expect(result).toBe(0.7); // (0.8 + 0.6) / 2
    });

    it('should fuse scores with custom weights', () => {
      const result = fuseScores(0.8, 0.6, 0.7, 0.3);

      // normalized: 0.7/(0.7+0.3) = 0.7, 0.3/(0.7+0.3) = 0.3
      expect(result).toBeCloseTo(0.74, 2); // 0.8 * 0.7 + 0.6 * 0.3
    });

    it('should handle zero weights gracefully', () => {
      const result = fuseScores(0.8, 0.6, 0, 0);

      expect(result).toBe(0);
    });

    it('should normalize weights to sum to 1', () => {
      const result1 = fuseScores(0.8, 0.6, 1, 1);
      const result2 = fuseScores(0.8, 0.6, 0.5, 0.5);

      expect(result1).toBeCloseTo(result2, 5); // Should be equivalent
    });
  });

  describe('hybridSearch', () => {
    let mockDb: DatabaseService;

    beforeEach(() => {
      mockDb = {
        query: vi.fn(),
      } as unknown as DatabaseService;
    });

    it('should execute lexical and vector queries in parallel', async () => {
      const lexicalRows = [
        { id: 'doc1', score: 0.9, text: 'Machine learning' },
        { id: 'doc2', score: 0.7, text: 'Data science' },
      ];

      const vectorRows = [
        { id: 'doc1', score: 0.85, text: 'Machine learning' },
        { id: 'doc3', score: 0.6, text: 'Neural networks' },
      ];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: ['query'],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: ['[1,2,3]'],
      };

      const results = await hybridSearch(mockDb, config);

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM lexical', [
        'query',
      ]);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT * FROM vector', [
        '[1,2,3]',
      ]);
      expect(results).toHaveLength(3); // doc1, doc2, doc3
    });

    it('should merge results from both channels', async () => {
      const lexicalRows = [{ id: 'doc1', score: 0.9, text: 'Result 1' }];
      const vectorRows = [{ id: 'doc1', score: 0.85, text: 'Result 1' }];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
      };

      const results = await hybridSearch(mockDb, config);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc1');
      expect(results[0].lexicalScore).toBe(0.9);
      expect(results[0].vectorScore).toBe(0.85);
    });

    it('should handle results only in lexical channel', async () => {
      const lexicalRows = [{ id: 'doc1', score: 0.9, text: 'Result 1' }];
      const vectorRows: any[] = [];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
      };

      const results = await hybridSearch(mockDb, config);

      expect(results).toHaveLength(1);
      expect(results[0].lexicalScore).toBe(0.9);
      expect(results[0].vectorScore).toBeUndefined();
    });

    it('should handle results only in vector channel', async () => {
      const lexicalRows: any[] = [];
      const vectorRows = [{ id: 'doc1', score: 0.85, text: 'Result 1' }];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
      };

      const results = await hybridSearch(mockDb, config);

      expect(results).toHaveLength(1);
      expect(results[0].lexicalScore).toBeUndefined();
      expect(results[0].vectorScore).toBe(0.85);
    });

    it('should return empty array when both channels are empty', async () => {
      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
      };

      const results = await hybridSearch(mockDb, config);

      expect(results).toHaveLength(0);
    });

    it('should sort results by fused score descending', async () => {
      const lexicalRows = [
        { id: 'doc1', score: 0.9, text: 'High score' },
        { id: 'doc2', score: 0.5, text: 'Low score' },
      ];

      const vectorRows = [
        { id: 'doc1', score: 0.85, text: 'High score' },
        { id: 'doc2', score: 0.4, text: 'Low score' },
      ];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
      };

      const results = await hybridSearch(mockDb, config);

      expect(results[0].id).toBe('doc1'); // Higher fused score
      expect(results[1].id).toBe('doc2');
      expect(results[0].fusedScore).toBeGreaterThan(results[1].fusedScore);
    });

    it('should respect custom weights', async () => {
      const lexicalRows = [{ id: 'doc1', score: 1.0, text: 'Test' }];
      const vectorRows = [{ id: 'doc1', score: 0.0, text: 'Test' }];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const configLexicalBias: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
        lexicalWeight: 0.9,
        vectorWeight: 0.1,
      };

      const results = await hybridSearch(mockDb, configLexicalBias);

      // With lexical-biased weights, fused score should be closer to lexical
      expect(results[0].fusedScore).toBeGreaterThan(0);
    });

    it('should use z-score normalization by default', async () => {
      const lexicalRows = [
        { id: 'doc1', score: 0.9, text: 'Test 1' },
        { id: 'doc2', score: 0.7, text: 'Test 2' },
      ];
      const vectorRows = [
        { id: 'doc1', score: 0.8, text: 'Test 1' },
        { id: 'doc2', score: 0.6, text: 'Test 2' },
      ];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
        // Default normalization: 'zscore', applySigmoid: true
      };

      const results = await hybridSearch(mockDb, config);

      expect(results).toHaveLength(2);
      // Scores should be normalized and bounded
      expect(results[0].fusedScore).toBeGreaterThanOrEqual(0);
      expect(results[0].fusedScore).toBeLessThanOrEqual(1);
    });

    it('should support min-max normalization', async () => {
      const lexicalRows = [
        { id: 'doc1', score: 1.0, text: 'Max' },
        { id: 'doc2', score: 0.0, text: 'Min' },
      ];
      const vectorRows = [
        { id: 'doc1', score: 1.0, text: 'Max' },
        { id: 'doc2', score: 0.0, text: 'Min' },
      ];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
        normalization: 'minmax',
      };

      const results = await hybridSearch(mockDb, config);

      expect(results[0].fusedScore).toBe(1); // Max normalized to 1
      expect(results[1].fusedScore).toBe(0); // Min normalized to 0
    });

    it('should preserve original data fields', async () => {
      const lexicalRows = [
        {
          id: 'doc1',
          score: 0.9,
          text: 'Machine learning',
          document_id: 'abc123',
          chunk_index: 0,
        },
      ];
      const vectorRows = [
        {
          id: 'doc1',
          score: 0.85,
          text: 'Machine learning',
          document_id: 'abc123',
          chunk_index: 0,
        },
      ];

      (mockDb.query as any)
        .mockResolvedValueOnce({ rows: lexicalRows })
        .mockResolvedValueOnce({ rows: vectorRows });

      const config: HybridSearchConfig = {
        lexicalQuery: 'SELECT * FROM lexical',
        lexicalParams: [],
        vectorQuery: 'SELECT * FROM vector',
        vectorParams: [],
      };

      const results = await hybridSearch<{
        text: string;
        document_id: string;
        chunk_index: number;
      }>(mockDb, config);

      expect(results[0].data.text).toBe('Machine learning');
      expect(results[0].data.document_id).toBe('abc123');
      expect(results[0].data.chunk_index).toBe(0);
    });
  });
});
