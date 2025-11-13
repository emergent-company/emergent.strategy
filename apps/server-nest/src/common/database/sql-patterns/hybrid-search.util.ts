/**
 * Hybrid Search Utilities
 *
 * Application-level hybrid search combining lexical (full-text) and semantic (vector) search channels.
 *
 * This utility provides a generalized approach to hybrid search that:
 * - Executes separate lexical and vector queries
 * - Normalizes scores using z-score transformation
 * - Fuses results with configurable weights
 * - Returns merged and ranked results
 *
 * Pattern extracted from SearchService and GraphSearchService implementations.
 * See: docs/migrations/PATTERN_EXTRACTION_OPPORTUNITIES.md - Pattern 3
 */

import { DatabaseService } from '../database.service';

/**
 * Configuration for hybrid search query execution
 */
export interface HybridSearchConfig {
  /**
   * SQL query for lexical (full-text) search
   * Must return: id (string), score (number), and all fields in T
   *
   * @example
   * `SELECT id, document_id, text, ts_rank(tsv, query) as score
   *  FROM documents WHERE tsv @@ query`
   */
  lexicalQuery: string;

  /**
   * Parameters for lexical query ($1, $2, etc.)
   */
  lexicalParams: any[];

  /**
   * SQL query for vector (semantic) search
   * Must return: id (string), score (number), and all fields in T
   *
   * @example
   * `SELECT id, document_id, text, (1 - (embedding <=> $1::vector)) as score
   *  FROM documents ORDER BY embedding <=> $1::vector LIMIT $2`
   */
  vectorQuery: string;

  /**
   * Parameters for vector query ($1, $2, etc.)
   */
  vectorParams: any[];

  /**
   * Weight for lexical channel (0-1)
   * @default 0.5
   */
  lexicalWeight?: number;

  /**
   * Weight for vector channel (0-1)
   * @default 0.5
   */
  vectorWeight?: number;

  /**
   * Normalization strategy
   * - 'zscore': Z-score normalization (mean/std)
   * - 'minmax': Min-max normalization [0,1]
   * @default 'zscore'
   */
  normalization?: 'zscore' | 'minmax';

  /**
   * Transform normalized z-scores with sigmoid for bounded [0,1] range
   * Only applies when normalization='zscore'
   * @default true
   */
  applySigmoid?: boolean;
}

/**
 * Result from a single search channel (lexical or vector)
 */
export interface ChannelResult<T = any> {
  id: string;
  score: number;
  data: T;
}

/**
 * Statistics for score normalization
 */
export interface ScoreStatistics {
  mean: number;
  std: number;
  min: number;
  max: number;
}

/**
 * Final hybrid search result with fused score
 */
export interface HybridSearchResult<T = any> {
  id: string;
  fusedScore: number;
  lexicalScore?: number;
  vectorScore?: number;
  data: T;
}

/**
 * Calculate statistics (mean, std, min, max) for a set of scores
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
 * Normalize score using z-score: z = (x - mean) / std
 */
export function zScoreNormalize(score: number, stats: ScoreStatistics): number {
  return (score - stats.mean) / stats.std;
}

/**
 * Normalize score using min-max: normalized = (x - min) / (max - min)
 */
export function minMaxNormalize(score: number, stats: ScoreStatistics): number {
  const range = stats.max - stats.min;
  if (range === 0) return 0;
  return (score - stats.min) / range;
}

/**
 * Apply sigmoid transformation: sigmoid(z) = 1 / (1 + e^(-z))
 * Maps z-scores to bounded [0, 1] range
 */
export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Normalize a score based on configuration
 */
export function normalizeScore(
  score: number,
  stats: ScoreStatistics,
  options: {
    normalization: 'zscore' | 'minmax';
    applySigmoid: boolean;
  }
): number {
  if (options.normalization === 'minmax') {
    return minMaxNormalize(score, stats);
  }

  // Z-score normalization
  const zScore = zScoreNormalize(score, stats);
  return options.applySigmoid ? sigmoid(zScore) : zScore;
}

/**
 * Fuse two normalized scores with configurable weights
 */
export function fuseScores(
  lexicalScore: number,
  vectorScore: number,
  lexicalWeight: number = 0.5,
  vectorWeight: number = 0.5
): number {
  // Normalize weights to sum to 1
  const totalWeight = lexicalWeight + vectorWeight;
  if (totalWeight === 0) return 0;

  const normLexWeight = lexicalWeight / totalWeight;
  const normVecWeight = vectorWeight / totalWeight;

  return normLexWeight * lexicalScore + normVecWeight * vectorScore;
}

/**
 * Execute hybrid search combining lexical and vector channels
 *
 * This function:
 * 1. Executes separate lexical and vector queries in parallel
 * 2. Calculates statistics for each channel
 * 3. Normalizes scores using z-score or min-max
 * 4. Fuses scores with configurable weights
 * 5. Merges results and sorts by fused score
 *
 * @param db - DatabaseService instance
 * @param config - Hybrid search configuration
 * @returns Array of results sorted by fused score (descending)
 *
 * @example
 * ```typescript
 * const results = await hybridSearch<ChunkResult>(db, {
 *   lexicalQuery: `
 *     SELECT id, document_id, text, ts_rank(tsv, websearch_to_tsquery('simple', $1)) as score
 *     FROM kb.chunks
 *     WHERE tsv @@ websearch_to_tsquery('simple', $1)
 *     ORDER BY score DESC
 *     LIMIT $2
 *   `,
 *   lexicalParams: [query, limit * 2],
 *   vectorQuery: `
 *     SELECT id, document_id, text, (1 - (embedding <=> $1::vector)) as score
 *     FROM kb.chunks
 *     ORDER BY embedding <=> $1::vector
 *     LIMIT $2
 *   `,
 *   vectorParams: [vectorString, limit * 2],
 *   lexicalWeight: 0.55,
 *   vectorWeight: 0.45,
 * });
 * ```
 */
export async function hybridSearch<T = any>(
  db: DatabaseService,
  config: HybridSearchConfig
): Promise<HybridSearchResult<T>[]> {
  const {
    lexicalQuery,
    lexicalParams,
    vectorQuery,
    vectorParams,
    lexicalWeight = 0.5,
    vectorWeight = 0.5,
    normalization = 'zscore',
    applySigmoid = true,
  } = config;

  // Execute both queries in parallel
  const [lexicalResults, vectorResults] = await Promise.all([
    db.query<T & { id: string; score: number }>(lexicalQuery, lexicalParams),
    db.query<T & { id: string; score: number }>(vectorQuery, vectorParams),
  ]);

  const lexicalRows = lexicalResults.rows;
  const vectorRows = vectorResults.rows;

  // Handle empty results
  if (lexicalRows.length === 0 && vectorRows.length === 0) {
    return [];
  }

  // Calculate statistics for each channel
  const lexicalScores = lexicalRows.map((r) => r.score ?? 0);
  const vectorScores = vectorRows.map((r) => r.score ?? 0);

  const lexicalStats = calculateStatistics(lexicalScores);
  const vectorStats = calculateStatistics(vectorScores);

  // Build candidate map: id -> { lexicalScore?, vectorScore?, data }
  const candidateMap = new Map<
    string,
    {
      lexicalScore?: number;
      vectorScore?: number;
      data: T;
    }
  >();

  // Process lexical results
  for (const row of lexicalRows) {
    const { id, score, ...data } = row;
    candidateMap.set(id, {
      lexicalScore: score ?? 0,
      data: data as T,
    });
  }

  // Process vector results and merge
  for (const row of vectorRows) {
    const { id, score, ...data } = row;
    const existing = candidateMap.get(id);

    if (existing) {
      // Item appears in both channels
      existing.vectorScore = score ?? 0;
    } else {
      // Item only in vector channel
      candidateMap.set(id, {
        vectorScore: score ?? 0,
        data: data as T,
      });
    }
  }

  // Normalize and fuse scores
  const results: HybridSearchResult<T>[] = [];

  for (const [id, candidate] of candidateMap.entries()) {
    const normLexical = candidate.lexicalScore
      ? normalizeScore(candidate.lexicalScore, lexicalStats, {
          normalization,
          applySigmoid,
        })
      : 0;

    const normVector = candidate.vectorScore
      ? normalizeScore(candidate.vectorScore, vectorStats, {
          normalization,
          applySigmoid,
        })
      : 0;

    const fusedScore = fuseScores(
      normLexical,
      normVector,
      lexicalWeight,
      vectorWeight
    );

    results.push({
      id,
      fusedScore,
      lexicalScore: candidate.lexicalScore,
      vectorScore: candidate.vectorScore,
      data: candidate.data,
    });
  }

  // Sort by fused score (descending)
  results.sort((a, b) => b.fusedScore - a.fusedScore);

  return results;
}
