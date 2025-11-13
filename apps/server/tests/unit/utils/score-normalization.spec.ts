import { describe, it, expect } from 'vitest';
import {
  calculateStatistics,
  zScoreNormalize,
  sigmoid,
  normalizeScore,
  fuseScores,
} from '../../../src/modules/search/score-normalization.util';

describe('Score Normalization Utilities', () => {
  describe('calculateStatistics', () => {
    it('should calculate correct mean and std for a set of scores', () => {
      const scores = [1, 2, 3, 4, 5];
      const stats = calculateStatistics(scores);

      expect(stats.mean).toBe(3);
      expect(stats.std).toBeCloseTo(1.414, 2); // sqrt(2)
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
    });

    it('should handle empty array gracefully', () => {
      const stats = calculateStatistics([]);

      expect(stats.mean).toBe(0);
      expect(stats.std).toBe(1);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it('should handle single value', () => {
      const stats = calculateStatistics([5.5]);

      expect(stats.mean).toBe(5.5);
      expect(stats.std).toBe(1); // Default to 1 to avoid division by zero
      expect(stats.min).toBe(5.5);
      expect(stats.max).toBe(5.5);
    });

    it('should handle all same values (zero variance)', () => {
      const scores = [7, 7, 7, 7];
      const stats = calculateStatistics(scores);

      expect(stats.mean).toBe(7);
      expect(stats.std).toBe(1); // Default to 1 to avoid division by zero
    });
  });

  describe('zScoreNormalize', () => {
    it('should normalize score using z-score formula', () => {
      const stats = { mean: 10, std: 2, min: 5, max: 15 };

      expect(zScoreNormalize(10, stats)).toBe(0); // At mean
      expect(zScoreNormalize(12, stats)).toBe(1); // 1 std above mean
      expect(zScoreNormalize(8, stats)).toBe(-1); // 1 std below mean
    });

    it('should handle edge values', () => {
      const stats = { mean: 100, std: 10, min: 80, max: 120 };

      expect(zScoreNormalize(120, stats)).toBe(2); // 2 std above mean
      expect(zScoreNormalize(80, stats)).toBe(-2); // 2 std below mean
    });
  });

  describe('sigmoid', () => {
    it('should return 0.5 for z=0', () => {
      expect(sigmoid(0)).toBeCloseTo(0.5, 5);
    });

    it('should return value close to 1 for large positive z', () => {
      expect(sigmoid(5)).toBeGreaterThan(0.99);
    });

    it('should return value close to 0 for large negative z', () => {
      expect(sigmoid(-5)).toBeLessThan(0.01);
    });

    it('should be monotonically increasing', () => {
      const z1 = sigmoid(-2);
      const z2 = sigmoid(-1);
      const z3 = sigmoid(0);
      const z4 = sigmoid(1);
      const z5 = sigmoid(2);

      expect(z1 < z2).toBe(true);
      expect(z2 < z3).toBe(true);
      expect(z3 < z4).toBe(true);
      expect(z4 < z5).toBe(true);
    });

    it('should always return values between 0 and 1', () => {
      const testValues = [-10, -5, -1, 0, 1, 5, 10];

      for (const z of testValues) {
        const result = sigmoid(z);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('normalizeScore', () => {
    it('should return normalized score with all components', () => {
      const stats = { mean: 10, std: 2, min: 5, max: 15 };
      const result = normalizeScore(12, stats);

      expect(result.raw).toBe(12);
      expect(result.zScore).toBe(1);
      expect(result.normalized).toBeCloseTo(sigmoid(1), 5);
    });

    it('should produce values between 0 and 1 after sigmoid', () => {
      const stats = { mean: 50, std: 10, min: 20, max: 80 };
      const testScores = [20, 30, 50, 70, 80];

      for (const score of testScores) {
        const result = normalizeScore(score, stats);
        expect(result.normalized).toBeGreaterThanOrEqual(0);
        expect(result.normalized).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('fuseScores', () => {
    it('should apply default 50/50 weights', () => {
      const result = fuseScores(0.8, 0.6);
      expect(result).toBeCloseTo(0.7, 5); // (0.8 + 0.6) / 2
    });

    it('should apply custom weights correctly', () => {
      const result = fuseScores(0.8, 0.4, 0.7, 0.3);
      // Weights normalized: 0.7/1.0 * 0.8 + 0.3/1.0 * 0.4 = 0.56 + 0.12 = 0.68
      expect(result).toBeCloseTo(0.68, 5);
    });

    it('should normalize weights to sum to 1', () => {
      // Weights 0.6 and 0.6 should be normalized to 0.5 and 0.5
      const result = fuseScores(1.0, 0.0, 0.6, 0.6);
      expect(result).toBeCloseTo(0.5, 5);
    });

    it('should handle extreme weights', () => {
      // Lexical weight = 1.0, vector weight = 0.0
      const result1 = fuseScores(0.9, 0.3, 1.0, 0.0);
      expect(result1).toBeCloseTo(0.9, 5);

      // Lexical weight = 0.0, vector weight = 1.0
      const result2 = fuseScores(0.9, 0.3, 0.0, 1.0);
      expect(result2).toBeCloseTo(0.3, 5);
    });

    it('should handle zero total weight gracefully', () => {
      const result = fuseScores(0.8, 0.6, 0.0, 0.0);
      expect(result).toBeCloseTo(0.7, 5); // Falls back to 0.5/0.5
    });

    it('should produce values between min and max of inputs', () => {
      const result = fuseScores(0.8, 0.4, 0.5, 0.5);
      expect(result).toBeGreaterThanOrEqual(0.4);
      expect(result).toBeLessThanOrEqual(0.8);
    });
  });

  describe('Integration: Full normalization pipeline', () => {
    it('should normalize and fuse lexical and vector scores correctly', () => {
      // Simulate lexical scores
      const lexScores = [0.5, 1.0, 1.5, 2.0, 2.5];
      const lexStats = calculateStatistics(lexScores);

      // Simulate vector scores
      const vecScores = [0.7, 0.75, 0.8, 0.85, 0.9];
      const vecStats = calculateStatistics(vecScores);

      // Normalize and fuse a sample pair
      const lexResult = normalizeScore(2.0, lexStats);
      const vecResult = normalizeScore(0.85, vecStats);
      const fused = fuseScores(
        lexResult.normalized,
        vecResult.normalized,
        0.6,
        0.4
      );

      // Both scores are above their respective means, so fused should be > 0.5
      expect(fused).toBeGreaterThan(0.5);
      expect(fused).toBeLessThanOrEqual(1.0);
    });

    it('should handle real-world hybrid search scenario', () => {
      // Lexical scores (ts_rank typically 0-1 range)
      const lexScores = [0.1, 0.3, 0.5, 0.7, 0.9];
      const lexStats = calculateStatistics(lexScores);

      // Vector scores (cosine similarity 0-1 range)
      const vecScores = [0.6, 0.65, 0.7, 0.75, 0.8];
      const vecStats = calculateStatistics(vecScores);

      // Document appears in both channels
      const lexScore = 0.7; // High lexical match
      const vecScore = 0.65; // Lower vector match

      const lexNorm = normalizeScore(lexScore, lexStats);
      const vecNorm = normalizeScore(vecScore, vecStats);
      const fused = fuseScores(lexNorm.normalized, vecNorm.normalized);

      // Should produce reasonable fused score
      expect(fused).toBeGreaterThan(0);
      expect(fused).toBeLessThan(1);
    });
  });
});
