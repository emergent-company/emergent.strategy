/**
 * Identity Resolver Node
 *
 * CODE-BASED node (no LLM) that resolves temp_ids to UUIDs.
 *
 * For each extracted entity:
 * 1. Check if it matches an existing entity in the project (by vector embedding similarity)
 * 2. If match found: map temp_id → existing UUID
 * 3. If no match: generate new UUID and map temp_id → new UUID
 *
 * This enables the RelationshipBuilder to create relationships between
 * new entities and existing ones in the knowledge graph.
 *
 * Similarity is calculated using cosine similarity between vector embeddings
 * of entity text (name + description).
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
import { EmbeddingProvider } from '../../../../graph/embedding.provider';

const logger = new Logger('IdentityResolverNode');

/**
 * Configuration for similarity matching
 */
export interface IdentityResolverConfig {
  /** Minimum similarity score to consider a match (0.0-1.0) */
  similarityThreshold?: number;
  /** Whether to use fuzzy matching (now uses vector embeddings) */
  fuzzyMatch?: boolean;
  /** Optional LangfuseService for tracing */
  langfuseService?: LangfuseService | null;
  /** Embedding provider for vector similarity (required for embedding-based matching) */
  embeddingProvider?: EmbeddingProvider | null;
}

/**
 * Build entity text for embedding: "name: description"
 * This captures both the identity (name) and semantic context (description)
 */
function buildEntityText(name: string, description?: string): string {
  if (description && description.trim()) {
    return `${name}: ${description.trim()}`;
  }
  return name;
}

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1, where 1 is identical
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Cache for embeddings to avoid redundant API calls within the same run
 */
interface EmbeddingCache {
  [text: string]: number[];
}

/**
 * Generate embeddings for all entities (extracted and existing)
 * Uses batching and caching for efficiency
 */
async function generateEmbeddings(
  embeddingProvider: EmbeddingProvider,
  extractedEntities: InternalEntity[],
  existingEntities: ExistingEntityContext[]
): Promise<{
  extractedEmbeddings: Map<string, number[]>;
  existingEmbeddings: Map<string, number[]>;
}> {
  const cache: EmbeddingCache = {};
  const extractedEmbeddings = new Map<string, number[]>();
  const existingEmbeddings = new Map<string, number[]>();

  // Generate embeddings for extracted entities
  for (const entity of extractedEntities) {
    const text = buildEntityText(entity.name, entity.description);
    if (!cache[text]) {
      const result = await embeddingProvider.generate(text);
      cache[text] = result.embedding;
    }
    extractedEmbeddings.set(entity.temp_id, cache[text]);
  }

  // Generate embeddings for existing entities
  for (const entity of existingEntities) {
    const text = buildEntityText(entity.name, entity.description);
    if (!cache[text]) {
      const result = await embeddingProvider.generate(text);
      cache[text] = result.embedding;
    }
    existingEmbeddings.set(entity.id, cache[text]);
  }

  return { extractedEmbeddings, existingEmbeddings };
}

/**
 * Find the best matching existing entity using vector embedding similarity
 */
function findBestMatchByEmbedding(
  entity: InternalEntity,
  entityEmbedding: number[],
  existingEntities: ExistingEntityContext[],
  existingEmbeddings: Map<string, number[]>,
  threshold: number
): { match: ExistingEntityContext | null; similarity: number } {
  let bestMatch: ExistingEntityContext | null = null;
  let bestScore = 0;

  for (const existing of existingEntities) {
    // Must be same type to match
    if (existing.type_name.toLowerCase() !== entity.type.toLowerCase()) {
      continue;
    }

    const existingEmbedding = existingEmbeddings.get(existing.id);
    if (!existingEmbedding) {
      logger.warn(`No embedding found for existing entity ${existing.id}`);
      continue;
    }

    const similarity = cosineSimilarity(entityEmbedding, existingEmbedding);

    if (similarity > bestScore && similarity >= threshold) {
      bestScore = similarity;
      bestMatch = existing;
    }
  }

  if (bestMatch) {
    logger.debug(
      `Matched "${entity.name}" → "${
        bestMatch.name
      }" (cosine similarity: ${bestScore.toFixed(3)})`
    );
  }

  return { match: bestMatch, similarity: bestScore };
}

/**
 * Create the identity resolver node function
 *
 * This is a CODE-BASED node (no LLM calls) that:
 * 1. Generates vector embeddings for all entities
 * 2. Compares extracted entities against existing entities using cosine similarity
 * 3. Maps temp_ids to UUIDs (existing or new)
 */
export function createIdentityResolverNode(
  config: IdentityResolverConfig = {}
) {
  const {
    similarityThreshold: configThreshold = 0.7,
    fuzzyMatch = true,
    langfuseService = null,
    embeddingProvider = null,
  } = config;

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const startTime = Date.now();

    // Use state threshold if provided, otherwise fall back to config
    const similarityThreshold = state.similarity_threshold ?? configThreshold;

    logger.debug(
      `Resolving identities for ${state.extracted_entities.length} entities (threshold: ${similarityThreshold})`
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
        matchingMethod: embeddingProvider ? 'vector_embedding' : 'disabled',
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

    // Check if we should attempt matching
    const shouldMatch =
      fuzzyMatch &&
      embeddingProvider &&
      state.existing_entities.length > 0 &&
      state.extracted_entities.length > 0;

    let extractedEmbeddings: Map<string, number[]> | null = null;
    let existingEmbeddings: Map<string, number[]> | null = null;

    // Generate embeddings if we have an embedding provider and entities to match
    if (shouldMatch) {
      try {
        logger.debug('Generating embeddings for entity matching...');
        const embeddings = await generateEmbeddings(
          embeddingProvider,
          state.extracted_entities,
          state.existing_entities
        );
        extractedEmbeddings = embeddings.extractedEmbeddings;
        existingEmbeddings = embeddings.existingEmbeddings;
        logger.debug(
          `Generated ${extractedEmbeddings.size} extracted + ${existingEmbeddings.size} existing embeddings`
        );
      } catch (error) {
        logger.warn(
          `Failed to generate embeddings, will create new UUIDs for all entities: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else if (!embeddingProvider) {
      logger.warn(
        'No embedding provider configured - all entities will be treated as new'
      );
    }

    for (const entity of state.extracted_entities) {
      let match: ExistingEntityContext | null = null;
      let similarity = 0;

      // Try to find a matching existing entity using vector embeddings
      if (extractedEmbeddings && existingEmbeddings) {
        const entityEmbedding = extractedEmbeddings.get(entity.temp_id);
        if (entityEmbedding) {
          const result = findBestMatchByEmbedding(
            entity,
            entityEmbedding,
            state.existing_entities,
            existingEmbeddings,
            similarityThreshold
          );
          match = result.match;
          similarity = result.similarity;
        }
      }

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
          similarity,
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
        `${Date.now() - startTime}ms (method: ${
          embeddingProvider ? 'vector_embedding' : 'none'
        })`
    );

    // End tracing span with success including match details
    span.end({
      matchedCount,
      newCount,
      totalEntities: state.extracted_entities.length,
      matchDetails,
      matchingMethod: embeddingProvider ? 'vector_embedding' : 'none',
    });

    return {
      resolved_uuid_map: resolvedMap,
      node_responses: {
        identity_resolver: {
          matched_count: matchedCount,
          new_count: newCount,
          total_entities: state.extracted_entities.length,
          similarity_threshold: similarityThreshold,
          matching_method: embeddingProvider ? 'vector_embedding' : 'none',
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
