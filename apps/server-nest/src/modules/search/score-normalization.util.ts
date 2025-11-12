/**
 * Score Normalization Utilities
 *
 * Provides z-score normalization and sigmoid transformation for hybrid search score fusion.
 *
 * Phase 3 Priority #4a: Score Normalization for Hybrid Search
 */

export interface ScoreStatistics {
  mean: number;
  std: number;
  min: number;
  max: number;
}

export interface NormalizedScore {
  raw: number;
  zScore: number;
  normalized: number; // after sigmoid
}

/**
 * Calculate mean and standard deviation for a set of scores
 */
export function calculateStatistics(scores: number[]): ScoreStatistics {
  if (scores.length === 0) {
    return { mean: 0, std: 1, min: 0, max: 0 };
  }

  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  if (scores.length === 1) {
    return { mean, std: 1, min: scores[0], max: scores[0] };
  }

  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const std = Math.sqrt(variance);

  return {
    mean,
    std: std > 0 ? std : 1, // Avoid division by zero
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}

/**
 * Apply z-score normalization: z = (x - mean) / std
 */
export function zScoreNormalize(score: number, stats: ScoreStatistics): number {
  return (score - stats.mean) / stats.std;
}

/**
 * Apply sigmoid transformation for bounded [0, 1] range
 * sigmoid(z) = 1 / (1 + e^(-z))
 */
export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Normalize a score using z-score + sigmoid pipeline
 */
export function normalizeScore(
  score: number,
  stats: ScoreStatistics
): NormalizedScore {
  const zScore = zScoreNormalize(score, stats);
  const normalized = sigmoid(zScore);
  return { raw: score, zScore, normalized };
}

/**
 * Fuse normalized scores with configurable weights
 *
 * @param lexicalScore - Normalized lexical score (0-1)
 * @param vectorScore - Normalized vector score (0-1)
 * @param lexicalWeight - Weight for lexical channel (default: 0.5)
 * @param vectorWeight - Weight for vector channel (default: 0.5)
 * @returns Final fused score
 */
export function fuseScores(
  lexicalScore: number,
  vectorScore: number,
  lexicalWeight: number = 0.5,
  vectorWeight: number = 0.5
): number {
  // Normalize weights to sum to 1
  const totalWeight = lexicalWeight + vectorWeight;
  const normLexWeight = totalWeight > 0 ? lexicalWeight / totalWeight : 0.5;
  const normVecWeight = totalWeight > 0 ? vectorWeight / totalWeight : 0.5;

  return normLexWeight * lexicalScore + normVecWeight * vectorScore;
}
