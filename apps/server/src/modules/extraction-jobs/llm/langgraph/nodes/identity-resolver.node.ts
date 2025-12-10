/**
 * Identity Resolver Node
 *
 * CODE-BASED node (no LLM) that resolves temp_ids to UUIDs.
 *
 * For each extracted entity:
 * 1. Check if it matches an existing entity in the project (by name similarity)
 * 2. If match found: map temp_id → existing UUID
 * 3. If no match: generate new UUID and map temp_id → new UUID
 *
 * This enables the RelationshipBuilder to create relationships between
 * new entities and existing ones in the knowledge graph.
 */

import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ExtractionGraphState,
  ExtractionGraphStateType,
  InternalEntity,
} from '../state';
import type { ExistingEntityContext } from '../../llm-provider.interface';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import { createNodeSpan } from '../tracing';

const logger = new Logger('IdentityResolverNode');

/**
 * Configuration for similarity matching
 */
export interface IdentityResolverConfig {
  /** Minimum similarity score to consider a match (0.0-1.0) */
  similarityThreshold?: number;
  /** Whether to use fuzzy matching */
  fuzzyMatch?: boolean;
  /** Optional LangfuseService for tracing */
  langfuseService?: LangfuseService | null;
}

/**
 * Calculate normalized similarity between two strings
 *
 * Uses a combination of:
 * - Exact match (case-insensitive)
 * - Levenshtein distance
 * - Token overlap (for multi-word names)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  // Exact match
  if (s1 === s2) return 1.0;

  // Empty string check
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // Token overlap for multi-word names
  const tokens1 = new Set(s1.split(/\s+/));
  const tokens2 = new Set(s2.split(/\s+/));

  if (tokens1.size > 1 || tokens2.size > 1) {
    const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);
    const jaccardSimilarity = intersection.size / union.size;

    // If high token overlap, boost the score
    if (jaccardSimilarity > 0.5) {
      return 0.7 + jaccardSimilarity * 0.3;
    }
  }

  // Levenshtein distance for short strings
  const maxLen = Math.max(s1.length, s2.length);
  const distance = levenshteinDistance(s1, s2);
  const similarity = 1 - distance / maxLen;

  return similarity;
}

/**
 * Compute Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Create distance matrix
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Find the best matching existing entity for a given extracted entity
 */
function findBestMatch(
  entity: InternalEntity,
  existingEntities: ExistingEntityContext[],
  threshold: number
): ExistingEntityContext | null {
  let bestMatch: ExistingEntityContext | null = null;
  let bestScore = 0;

  for (const existing of existingEntities) {
    // Must be same type to match
    if (existing.type_name.toLowerCase() !== entity.type.toLowerCase()) {
      continue;
    }

    const similarity = calculateSimilarity(entity.name, existing.name);

    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = existing;
    }
  }

  if (bestMatch) {
    logger.debug(
      `Matched "${entity.name}" → "${
        bestMatch.name
      }" (score: ${bestScore.toFixed(2)})`
    );
  }

  return bestMatch;
}

/**
 * Create the identity resolver node function
 *
 * This is a CODE-BASED node (no LLM calls) that:
 * 1. Compares extracted entities against existing entities
 * 2. Maps temp_ids to UUIDs (existing or new)
 */
export function createIdentityResolverNode(
  config: IdentityResolverConfig = {}
) {
  const {
    similarityThreshold = 0.85,
    fuzzyMatch = true,
    langfuseService = null,
  } = config;

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const startTime = Date.now();
    logger.debug(
      `Resolving identities for ${state.extracted_entities.length} entities`
    );

    // Prepare existing entities summary for tracing
    const existingEntitiesSummary = state.existing_entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type_name,
    }));

    // Create tracing span for this node with full existing entities data
    const span = createNodeSpan(
      langfuseService,
      state,
      'identity_resolver',
      {
        entityCount: state.extracted_entities.length,
        existingEntitiesCount: state.existing_entities.length,
        existingEntities: existingEntitiesSummary,
        extractedEntities: state.extracted_entities.map((e) => ({
          temp_id: e.temp_id,
          name: e.name,
          type: e.type,
        })),
      },
      { similarityThreshold, fuzzyMatch }
    );

    const resolvedMap: Record<string, string> = {};
    const matchDetails: Array<{
      extractedName: string;
      extractedType: string;
      tempId: string;
      matchedTo: { id: string; name: string } | null;
      isNew: boolean;
      similarity?: number;
    }> = [];
    let matchedCount = 0;
    let newCount = 0;

    for (const entity of state.extracted_entities) {
      // Try to find a matching existing entity
      const match = fuzzyMatch
        ? findBestMatch(entity, state.existing_entities, similarityThreshold)
        : null;

      if (match) {
        // Map temp_id to existing UUID
        resolvedMap[entity.temp_id] = match.id;
        matchedCount++;
        matchDetails.push({
          extractedName: entity.name,
          extractedType: entity.type,
          tempId: entity.temp_id,
          matchedTo: { id: match.id, name: match.name },
          isNew: false,
          similarity: calculateSimilarity(entity.name, match.name),
        });
      } else {
        // Generate new UUID
        const newId = uuidv4();
        resolvedMap[entity.temp_id] = newId;
        newCount++;
        matchDetails.push({
          extractedName: entity.name,
          extractedType: entity.type,
          tempId: entity.temp_id,
          matchedTo: null,
          isNew: true,
        });
      }
    }

    logger.log(
      `Identity resolution complete: ${matchedCount} matched, ${newCount} new, ` +
        `${Date.now() - startTime}ms`
    );

    // End tracing span with success including match details
    span.end({
      matchedCount,
      newCount,
      totalEntities: state.extracted_entities.length,
      matchDetails,
    });

    return {
      resolved_uuid_map: resolvedMap,
      node_responses: {
        identity_resolver: {
          matched_count: matchedCount,
          new_count: newCount,
          total_entities: state.extracted_entities.length,
          similarity_threshold: similarityThreshold,
          match_details: matchDetails,
          duration_ms: Date.now() - startTime,
        },
      },
    };
  };
}

/**
 * Create a simple identity resolver that always generates new UUIDs
 *
 * Useful for testing or when no existing entities are provided
 */
export function createSimpleIdentityResolverNode() {
  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const startTime = Date.now();

    const resolvedMap: Record<string, string> = {};

    for (const entity of state.extracted_entities) {
      resolvedMap[entity.temp_id] = uuidv4();
    }

    logger.debug(
      `Simple identity resolution: ${Object.keys(resolvedMap).length} new UUIDs`
    );

    return {
      resolved_uuid_map: resolvedMap,
      node_responses: {
        identity_resolver: {
          method: 'simple',
          new_count: Object.keys(resolvedMap).length,
          duration_ms: Date.now() - startTime,
        },
      },
    };
  };
}
