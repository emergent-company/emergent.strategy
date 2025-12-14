/**
 * Relationship Builder Node
 *
 * Builds relationships between extracted entities using the native Gemini SDK
 * with structured output. Uses temp_ids for internal references, which will be
 * resolved to UUIDs.
 *
 * Key responsibilities:
 * 1. Analyze entities and their descriptions to find relationships
 * 2. Create relationships using temp_ids as references
 * 3. Validate that all references are valid temp_ids
 * 4. Handle retry attempts with orphan entity feedback
 *
 * NOTE: This implementation uses the native @google/genai SDK instead of LangChain
 * because LangChain's withStructuredOutput() times out 100% of the time on Vertex AI.
 *
 * Supports two extraction methods:
 * - responseSchema: Uses JSON mode with schema enforcement (default, more reliable)
 * - function_calling: Uses function calling to extract relationships (alternative method)
 */

import { Logger } from '@nestjs/common';
import {
  ExtractionGraphState,
  ExtractionGraphStateType,
  InternalRelationship,
  RelationshipBuilderOutputSchema,
} from '../state';
import {
  buildRelationshipPrompt,
  buildRelationshipRetryPrompt,
  validateRelationshipRefs,
  validateRelationshipTypeConstraints,
} from '../prompts/relationship.prompts';
import {
  ExtractionPromptProvider,
  PromptResult,
} from '../prompts/prompt-provider.service';
import {
  NativeGeminiService,
  TracingContext,
} from '../../../../llm/native-gemini.service';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import { createNodeSpan } from '../tracing';

const logger = new Logger('RelationshipBuilderNode');

/** Maximum number of entities to process in a single batch */
const MAX_ENTITIES_PER_BATCH = 3;

/** Maximum number of chunks to include per batch to avoid token overflow */
const MAX_CHUNKS_PER_BATCH = 3;

/**
 * Find document chunks that are relevant to a batch of entities.
 * Uses entity name matching to identify which chunks mention which entities.
 *
 * @param batchEntities - Entities in this batch
 * @param allEntities - All entities (for cross-reference context)
 * @param documentChunks - All document chunks
 * @returns Array of chunk indices that are relevant to this batch
 */
function findRelevantChunkIndices(
  batchEntities: { name: string; temp_id: string }[],
  allEntities: { name: string; temp_id: string }[],
  documentChunks: string[]
): number[] {
  const relevantIndices = new Set<number>();

  // For each entity in the batch, find chunks that mention it
  for (const entity of batchEntities) {
    const entityNameLower = entity.name.toLowerCase();
    // Also try partial name matching for multi-word names
    const nameParts = entityNameLower.split(/\s+/).filter((p) => p.length > 2);

    for (let i = 0; i < documentChunks.length; i++) {
      const chunkLower = documentChunks[i].toLowerCase();

      // Check if chunk contains the full entity name
      if (chunkLower.includes(entityNameLower)) {
        relevantIndices.add(i);
        continue;
      }

      // For multi-word names, check if all significant parts appear
      if (nameParts.length > 1) {
        const allPartsFound = nameParts.every((part) =>
          chunkLower.includes(part)
        );
        if (allPartsFound) {
          relevantIndices.add(i);
        }
      }
    }
  }

  // If no relevant chunks found, return first chunk as fallback
  if (relevantIndices.size === 0 && documentChunks.length > 0) {
    relevantIndices.add(0);
  }

  return Array.from(relevantIndices).sort((a, b) => a - b);
}

/**
 * Get relevant chunks for a batch, limited to avoid token overflow.
 *
 * @param batchEntities - Entities in this batch
 * @param allEntities - All entities
 * @param documentChunks - All document chunks
 * @param maxChunks - Maximum number of chunks to return
 * @returns Relevant chunks (limited)
 */
function getRelevantChunksForBatch(
  batchEntities: { name: string; temp_id: string }[],
  allEntities: { name: string; temp_id: string }[],
  documentChunks: string[],
  maxChunks: number = MAX_CHUNKS_PER_BATCH
): string[] {
  const relevantIndices = findRelevantChunkIndices(
    batchEntities,
    allEntities,
    documentChunks
  );

  // Limit to maxChunks
  const limitedIndices = relevantIndices.slice(0, maxChunks);

  return limitedIndices.map((i) => documentChunks[i]);
}

/** Extraction method type */
export type ExtractionMethod =
  | 'responseSchema'
  | 'function_calling'
  | 'json_freeform';

/**
 * Mapping of inverse relationship types.
 * When we encounter the key type, we CONVERT it to the value type with source/target swapped.
 * This ensures consistent directionality in the knowledge graph.
 *
 * Example: CHILD_OF(Mahlon, Elimelech) -> PARENT_OF(Elimelech, Mahlon)
 */
const INVERSE_RELATIONSHIP_TYPES: Record<string, string> = {
  // Family - prefer PARENT_OF direction (parent as source)
  child_of: 'PARENT_OF',
  son_of: 'PARENT_OF',
  daughter_of: 'PARENT_OF',
  // Containment - prefer CONTAINS direction
  contained_in: 'CONTAINS',
  part_of: 'CONTAINS',
  // Membership - keep MEMBER_OF direction (member as source -> group)
  has_member: 'MEMBER_OF',
  // Causal - prefer CAUSES direction
  caused_by: 'CAUSES',
  // Organizational - prefer active voice
  employed_by: 'EMPLOYS',
  supervised_by: 'SUPERVISES',
  works_for: 'EMPLOYS',
  // Location - prefer LOCATED_IN direction (smaller -> larger)
  contains_location: 'LOCATED_IN',
  // Residence - prefer LIVED_IN direction (person -> place)
  was_inhabited_by: 'LIVED_IN',
  inhabited_by: 'LIVES_IN',
  // Marriage - keep MARRIED_TO (symmetric, handled separately)
  spouse_of: 'MARRIED_TO',
  wife_of: 'MARRIED_TO',
  husband_of: 'MARRIED_TO',
};

/**
 * Symmetric relationship types where A--REL-->B is equivalent to B--REL-->A.
 * We normalize to alphabetical order of entity names to deduplicate.
 */
const SYMMETRIC_RELATIONSHIP_TYPES = new Set([
  'married_to',
  'sibling_of',
  'related_to',
  'connected_to',
  'associated_with',
  'similar_to',
  'linked_to',
]);

/**
 * Normalize relationships by converting inverse types to their preferred forms.
 *
 * This converts relationships like CHILD_OF(Mahlon, Elimelech) to PARENT_OF(Elimelech, Mahlon).
 * This ensures consistent directionality before deduplication.
 *
 * @param relationships - Array of relationships to normalize
 * @returns Normalized relationships with inverse types converted
 */
function normalizeInverseRelationships(
  relationships: InternalRelationship[]
): InternalRelationship[] {
  return relationships.map((rel) => {
    const typeLower = rel.type.toLowerCase();
    const preferredType = INVERSE_RELATIONSHIP_TYPES[typeLower];

    if (preferredType) {
      // Convert to preferred type with swapped source/target
      logger.debug(
        `Normalizing ${rel.type}(${rel.source_ref}, ${rel.target_ref}) -> ` +
          `${preferredType}(${rel.target_ref}, ${rel.source_ref})`
      );
      return {
        ...rel,
        type: preferredType,
        source_ref: rel.target_ref,
        target_ref: rel.source_ref,
        description: rel.description
          ? `${rel.description} (normalized from ${rel.type})`
          : `Normalized from ${rel.type}`,
      };
    }

    return rel;
  });
}

/**
 * Deduplicate relationships, removing inverse and symmetric duplicates.
 *
 * Examples:
 * - If we have both PARENT_OF(A,B) and CHILD_OF(B,A), keep only PARENT_OF
 * - If we have MARRIED_TO(A,B) and MARRIED_TO(B,A), keep only one (alphabetically first source)
 *
 * @param relationships - Array of relationships to deduplicate
 * @param entityMap - Map of temp_id to entity name for symmetric normalization
 * @returns Deduplicated relationships
 */
function deduplicateRelationships(
  relationships: InternalRelationship[],
  entityMap: Map<string, string>
): InternalRelationship[] {
  const seen = new Set<string>();
  const result: InternalRelationship[] = [];

  for (const rel of relationships) {
    const typeLower = rel.type.toLowerCase();

    // Check if this is an inverse type that should be skipped
    if (INVERSE_RELATIONSHIP_TYPES[typeLower]) {
      // This relationship type is the "inverse" form - check if we already have the preferred form
      const preferredType = INVERSE_RELATIONSHIP_TYPES[typeLower];
      const preferredKey = `${rel.target_ref}|${rel.source_ref}|${preferredType}`;

      // If we already have the preferred form, skip this inverse
      if (seen.has(preferredKey)) {
        continue;
      }

      // Otherwise, add the inverse key so we can track it
      // Note: We'll add this relationship but mark the inverse as seen
      const inverseKey = `${rel.source_ref}|${rel.target_ref}|${typeLower}`;
      if (seen.has(inverseKey)) {
        continue;
      }
      seen.add(inverseKey);
      // Also mark the preferred form as "seen" so future preferred forms are kept
      seen.add(preferredKey);
      result.push(rel);
      continue;
    }

    // Check if this is a symmetric relationship
    if (SYMMETRIC_RELATIONSHIP_TYPES.has(typeLower)) {
      // Normalize by sorting entity refs alphabetically (using names if available)
      const sourceName = entityMap.get(rel.source_ref) || rel.source_ref;
      const targetName = entityMap.get(rel.target_ref) || rel.target_ref;

      const [first, second] =
        sourceName.toLowerCase() <= targetName.toLowerCase()
          ? [rel.source_ref, rel.target_ref]
          : [rel.target_ref, rel.source_ref];

      const normalizedKey = `${first}|${second}|${typeLower}`;
      if (seen.has(normalizedKey)) {
        continue;
      }
      seen.add(normalizedKey);
      result.push(rel);
      continue;
    }

    // Regular relationship - just check for exact duplicates
    const key = `${rel.source_ref}|${rel.target_ref}|${typeLower}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(rel);
  }

  return result;
}

/**
 * Node configuration
 */
export interface RelationshipBuilderNodeConfig {
  /** NativeGeminiService instance for LLM calls */
  geminiService: NativeGeminiService;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Optional LangfuseService for tracing */
  langfuseService?: LangfuseService | null;
  /** Optional prompt provider for Langfuse prompt management */
  promptProvider?: ExtractionPromptProvider | null;
  /** Extraction method: 'json_freeform' (default), 'responseSchema', or 'function_calling' */
  extractionMethod?: ExtractionMethod;
}

/**
 * Create the relationship builder node function using native Gemini SDK
 *
 * Analyzes entities and builds relationships between them.
 * On retry attempts, focuses on connecting orphan entities.
 */
export function createRelationshipBuilderNode(
  config: RelationshipBuilderNodeConfig
) {
  const {
    geminiService,
    timeoutMs = 600000, // 10 minutes - increased for large document extraction
    langfuseService = null,
    promptProvider = null,
    extractionMethod = 'json_freeform', // Default to json_freeform for best property population
  } = config;

  // Convert Zod schema to Google Schema for structured output
  const relationshipOutputSchema = geminiService.zodToGoogleSchema(
    RelationshipBuilderOutputSchema
  );

  // Create function declaration for function calling method
  const relationshipExtractionFunction =
    geminiService.createFunctionDeclaration(
      'build_relationships',
      'Build relationships between entities extracted from the document. Returns an array of relationships with source, target, type, and description.',
      RelationshipBuilderOutputSchema
    );

  const methodLabel = `native_gemini_${extractionMethod}`;

  logger.log(
    `[RelationshipBuilder] Using native Gemini SDK with ${extractionMethod} for structured output (config default)`
  );

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const startTime = Date.now();
    const isRetry = state.retry_count > 0;

    logger.debug(
      `Starting relationship building${
        isRetry ? ` (retry ${state.retry_count})` : ''
      } ` + `for ${state.extracted_entities.length} entities`
    );

    // Check if service is available
    if (!geminiService.isAvailable()) {
      logger.error(
        '[RelationshipBuilder] NativeGeminiService is not available'
      );
      return {
        final_relationships: [],
        feedback_log: ['NativeGeminiService not initialized'],
      };
    }

    // If no entities, nothing to do
    if (state.extracted_entities.length === 0) {
      // Create span for empty case
      const span = createNodeSpan(
        langfuseService,
        state,
        'relationship_builder',
        { entityCount: 0, reason: 'no_entities' },
        {}
      );
      span.end({ reason: 'no_entities', relationshipCount: 0 });

      logger.warn('No entities to build relationships for');
      return {
        final_relationships: [],
        node_responses: {
          relationship_builder: {
            relationship_count: 0,
            reason: 'no_entities',
            duration_ms: Date.now() - startTime,
          },
        },
      };
    }

    // Check if relationships were already built per-batch by entity-extractor
    // This is the new per-batch relationship building approach that avoids token overflow
    if (state.final_relationships.length > 0 && !isRetry) {
      logger.log(
        `[RelationshipBuilder] Using ${state.final_relationships.length} relationships ` +
          `already built per-batch by entity-extractor - skipping LLM calls`
      );

      // Still apply normalization and deduplication to ensure consistency
      const entityMap = new Map<string, string>(
        state.extracted_entities.map((e) => [e.temp_id, e.name])
      );
      for (const entity of state.existing_entities) {
        entityMap.set(entity.id, entity.name);
      }

      // Normalize inverse relationships (e.g., CHILD_OF -> PARENT_OF with swapped refs)
      const normalizedRelationships = normalizeInverseRelationships(
        state.final_relationships
      );

      // Deduplicate inverse and symmetric relationships
      const beforeDedup = normalizedRelationships.length;
      const dedupedRelationships = deduplicateRelationships(
        normalizedRelationships,
        entityMap
      );
      const dedupedCount = beforeDedup - dedupedRelationships.length;

      if (dedupedCount > 0) {
        logger.log(
          `[RelationshipBuilder] Deduplicated ${dedupedCount} inverse/symmetric relationships ` +
            `(${beforeDedup} -> ${dedupedRelationships.length})`
        );
      }

      // Get relationship type statistics
      const typeStats: Record<string, number> = {};
      for (const rel of dedupedRelationships) {
        typeStats[rel.type] = (typeStats[rel.type] || 0) + 1;
      }

      // Create span for bypass case
      const span = createNodeSpan(
        langfuseService,
        state,
        'relationship_builder',
        {
          entityCount: state.extracted_entities.length,
          reason: 'per_batch_relationships_exist',
          inputRelationshipCount: state.final_relationships.length,
        },
        {}
      );
      span.end({
        reason: 'per_batch_relationships_exist',
        relationshipCount: dedupedRelationships.length,
        deduplicated: dedupedCount,
        typeStats,
      });

      logger.log(
        `[RelationshipBuilder] Bypass complete: ${dedupedRelationships.length} relationships ` +
          `in ${Date.now() - startTime}ms. Types: ${Object.entries(typeStats)
            .map(([t, c]) => `${t}:${c}`)
            .join(', ')}`
      );

      return {
        final_relationships: dedupedRelationships,
        node_responses: {
          relationship_builder: {
            relationship_count: dedupedRelationships.length,
            type_stats: typeStats,
            deduplicated: dedupedCount,
            reason: 'per_batch_relationships_exist',
            duration_ms: Date.now() - startTime,
          },
        },
      };
    }

    // Get effective method from state (per-job override) or fall back to config
    // Define this early so it can be used for prompt building
    const effectiveMethod = state.extraction_method || extractionMethod;

    // Get effective timeout from state (per-job) or fall back to config default
    const effectiveTimeoutMs = state.timeout_ms || timeoutMs;

    // Determine if we need batching (more than MAX_ENTITIES_PER_BATCH entities)
    const allEntities = state.extracted_entities;
    const needsBatching = allEntities.length > MAX_ENTITIES_PER_BATCH;
    const batchCount = needsBatching
      ? Math.ceil(allEntities.length / MAX_ENTITIES_PER_BATCH)
      : 1;

    if (needsBatching) {
      logger.log(
        `[RelationshipBuilder] Processing ${allEntities.length} entities in ${batchCount} batches (max ${MAX_ENTITIES_PER_BATCH} per batch)`
      );
    }

    // Create tracing span for this node
    const effectiveMethodLabel = `native_gemini_${effectiveMethod}`;
    const span = createNodeSpan(
      langfuseService,
      state,
      'relationship_builder',
      {
        entityCount: state.extracted_entities.length,
        isRetry,
        retryCount: state.retry_count,
        orphanCount: state.orphan_entities.length,
        entities: state.extracted_entities.map((e) => ({
          temp_id: e.temp_id,
          name: e.name,
          type: e.type,
        })),
        existingRelationshipCount: state.final_relationships.length,
        method: effectiveMethodLabel,
        extractionMethod: effectiveMethod,
        batchCount,
        needsBatching,
      },
      {}
    );

    try {
      // Accumulate all relationships from all batches
      let allRawRelationships: InternalRelationship[] = [];
      let totalInvalidRefs = 0;
      let totalDurationMs = 0;

      // Process entities in batches
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
        const batchStart = batchIndex * MAX_ENTITIES_PER_BATCH;
        const batchEnd = Math.min(
          batchStart + MAX_ENTITIES_PER_BATCH,
          allEntities.length
        );
        const batchEntities = allEntities.slice(batchStart, batchEnd);

        if (needsBatching) {
          logger.log(
            `[RelationshipBuilder] Processing batch ${
              batchIndex + 1
            }/${batchCount} ` +
              `(entities ${batchStart + 1}-${batchEnd} of ${
                allEntities.length
              })`
          );
        }

        // Get relevant chunks for this batch to avoid token overflow
        // When batching, only pass chunks that mention entities in this batch
        const batchChunks = needsBatching
          ? getRelevantChunksForBatch(
              batchEntities,
              allEntities,
              state.document_chunks
            )
          : state.document_chunks;

        if (needsBatching) {
          logger.debug(
            `[RelationshipBuilder] Batch ${batchIndex + 1}: Using ${
              batchChunks.length
            } relevant chunks (of ${state.document_chunks.length} total)`
          );
        }

        // Build the appropriate prompt based on whether this is a retry
        // For batching, we pass the batch entities AND batch chunks (not full document)
        let promptResult: PromptResult;

        if (isRetry && state.orphan_entities.length > 0) {
          // Use retry prompt focused on orphans (local only - too dynamic for Langfuse)
          // For retry, only include orphans that are in this batch
          const batchTempIds = new Set(batchEntities.map((e) => e.temp_id));
          const batchOrphans = state.orphan_entities.filter((orphanTempId) =>
            batchTempIds.has(orphanTempId)
          );
          promptResult = {
            prompt: buildRelationshipRetryPrompt(
              batchEntities,
              state.final_relationships,
              batchChunks, // Use batch-specific chunks
              batchOrphans,
              state.retry_count,
              state.feedback_log.slice(-3).join('\n'),
              effectiveMethod
            ),
            fromLangfuse: false,
          };
        } else if (promptProvider) {
          // Use prompt provider with Langfuse support
          // Pass extraction method so the prompt includes the correct output instruction
          const batchTempIds = new Set(batchEntities.map((e) => e.temp_id));
          promptResult = await promptProvider.getRelationshipBuilderPrompt(
            batchChunks, // Use batch-specific chunks
            batchEntities, // Only batch entities
            state.relationship_schemas,
            state.existing_entities,
            state.orphan_entities.filter((orphanTempId) =>
              batchTempIds.has(orphanTempId)
            ),
            // Pass prompt label from state for experiment prompt selection
            state.prompt_label ? { label: state.prompt_label } : undefined,
            effectiveMethod
          );
        } else {
          // Direct fallback to local prompt with extraction method
          const batchTempIds = new Set(batchEntities.map((e) => e.temp_id));
          promptResult = {
            prompt: buildRelationshipPrompt(
              batchEntities, // Only batch entities
              state.relationship_schemas,
              batchChunks, // Use batch-specific chunks
              state.existing_entities,
              state.orphan_entities.filter((orphanTempId) =>
                batchTempIds.has(orphanTempId)
              ),
              effectiveMethod
            ),
            fromLangfuse: false,
          };
        }

        const prompt = promptResult.prompt;

        // Log prompt source for debugging (only on first batch)
        if (batchIndex === 0 && promptResult.fromLangfuse) {
          logger.debug(
            `Using Langfuse prompt v${promptResult.version} [${
              promptResult.labels?.join(', ') || 'no labels'
            }]`
          );
        }

        // Create tracing context for this batch
        const batchTracingContext: TracingContext | undefined = state.trace_id
          ? {
              traceId: state.trace_id,
              parentObservationId:
                span.getSpanId() || state.parent_observation_id,
              generationName: needsBatching
                ? `build_relationships_batch_${batchIndex + 1}`
                : 'build_relationships_llm',
              metadata: {
                promptSource: promptResult.fromLangfuse ? 'langfuse' : 'local',
                promptVersion: promptResult.version,
                isRetry,
                entityCount: batchEntities.length,
                chunkCount: batchChunks.length,
                totalChunks: state.document_chunks.length,
                extractionMethod: effectiveMethod,
                batchIndex: batchIndex + 1,
                batchCount,
              },
            }
          : undefined;

        logger.debug(
          `[RelationshipBuilder] Calling native Gemini SDK (${effectiveMethod}) for batch ${
            batchIndex + 1
          }...`
        );

        const promptString =
          typeof prompt === 'string' ? prompt : JSON.stringify(prompt);

        let result;

        if (effectiveMethod === 'function_calling') {
          // Use function calling method
          result = await geminiService.generateWithFunctionCall<{
            relationships: InternalRelationship[];
          }>(
            promptString,
            relationshipExtractionFunction,
            {
              timeoutMs: effectiveTimeoutMs,
              maxOutputTokens: 65535,
              functionName: 'build_relationships',
              forceCall: true,
            },
            batchTracingContext
          );
        } else if (effectiveMethod === 'json_freeform') {
          // Use JSON freeform method (best for property population)
          result = await geminiService.generateJsonFreeform<{
            relationships: InternalRelationship[];
          }>(
            promptString,
            { timeoutMs: effectiveTimeoutMs, maxOutputTokens: 65535 },
            batchTracingContext
          );
        } else {
          // Use responseSchema method
          result = await geminiService.generateStructuredOutput<{
            relationships: InternalRelationship[];
          }>(
            promptString,
            relationshipOutputSchema,
            { timeoutMs: effectiveTimeoutMs, maxOutputTokens: 65535 },
            batchTracingContext
          );
        }

        if (!result.success) {
          throw new Error(
            result.error ||
              `Unknown error from Gemini SDK (batch ${batchIndex + 1})`
          );
        }

        const batchRelationships = result.data?.relationships || [];
        totalDurationMs += result.durationMs || 0;

        logger.log(
          `[RelationshipBuilder] Batch ${batchIndex + 1}/${batchCount}: ` +
            `Received ${batchRelationships.length} relationships in ${result.durationMs}ms`
        );

        // Validate references for this batch
        const validTempIds = new Set(allEntities.map((e) => e.temp_id));
        const existingIds = new Set(state.existing_entities.map((e) => e.id));

        const { valid, invalid } = validateRelationshipRefs(
          batchRelationships,
          validTempIds,
          existingIds
        );

        if (invalid.length > 0) {
          logger.warn(
            `Batch ${batchIndex + 1}: ${
              invalid.length
            } relationships had invalid references and were filtered out`
          );
          totalInvalidRefs += invalid.length;
        }

        // Accumulate valid relationships
        allRawRelationships = [...allRawRelationships, ...valid];
      }

      logger.log(
        `[RelationshipBuilder] All batches complete: ${allRawRelationships.length} total relationships in ${totalDurationMs}ms`
      );

      // Validate type constraints from relationship schemas
      // Build entity type map (temp_id -> type, UUID -> type)
      const entityTypeMap = new Map<string, string>();
      for (const entity of state.extracted_entities) {
        entityTypeMap.set(entity.temp_id, entity.type);
      }
      for (const entity of state.existing_entities) {
        entityTypeMap.set(entity.id, entity.type_name);
      }

      const typeConstraintResult = validateRelationshipTypeConstraints(
        allRawRelationships,
        entityTypeMap,
        state.relationship_schemas
      );

      if (typeConstraintResult.invalid.length > 0) {
        logger.warn(
          `${typeConstraintResult.invalid.length} relationships violated type constraints: ` +
            typeConstraintResult.invalid
              .slice(0, 3)
              .map(
                (r) =>
                  `${r.source_ref}[${entityTypeMap.get(r.source_ref)}] --${
                    r.type
                  }--> ${r.target_ref}[${entityTypeMap.get(r.target_ref)}]`
              )
              .join(', ')
        );
      }

      const validRelationships = typeConstraintResult.valid;

      // Merge with existing relationships if this is a retry
      let mergedRelationships: InternalRelationship[];
      if (isRetry) {
        // Deduplicate by source+target+type
        const existingKeys = new Set(
          state.final_relationships.map(
            (r) => `${r.source_ref}|${r.target_ref}|${r.type}`
          )
        );
        const newRelationships = validRelationships.filter(
          (r) => !existingKeys.has(`${r.source_ref}|${r.target_ref}|${r.type}`)
        );
        mergedRelationships = [
          ...state.final_relationships,
          ...newRelationships,
        ];

        logger.log(
          `Retry added ${newRelationships.length} new relationships ` +
            `(total: ${mergedRelationships.length})`
        );
      } else {
        mergedRelationships = validRelationships;
      }

      // Build entity map for deduplication (temp_id -> entity name)
      const entityMap = new Map<string, string>(
        state.extracted_entities.map((e) => [e.temp_id, e.name])
      );
      // Also add existing entities (UUID -> name)
      for (const entity of state.existing_entities) {
        entityMap.set(entity.id, entity.name);
      }

      // Normalize inverse relationships (e.g., CHILD_OF -> PARENT_OF with swapped refs)
      const normalizedRelationships =
        normalizeInverseRelationships(mergedRelationships);

      const normalizedCount =
        mergedRelationships.length - normalizedRelationships.length;
      if (normalizedCount > 0) {
        // Count how many were actually changed (type was an inverse)
        const changedCount = normalizedRelationships.filter(
          (r, i) => r.type !== mergedRelationships[i].type
        ).length;
        if (changedCount > 0) {
          logger.log(`Normalized ${changedCount} inverse relationships`);
        }
      }

      // Deduplicate inverse and symmetric relationships
      const beforeDedup = normalizedRelationships.length;
      const allRelationships = deduplicateRelationships(
        normalizedRelationships,
        entityMap
      );
      const dedupedCount = beforeDedup - allRelationships.length;

      if (dedupedCount > 0) {
        logger.log(
          `Deduplicated ${dedupedCount} inverse/symmetric relationships ` +
            `(${beforeDedup} -> ${allRelationships.length})`
        );
      }

      // Get relationship type statistics
      const typeStats: Record<string, number> = {};
      for (const rel of allRelationships) {
        typeStats[rel.type] = (typeStats[rel.type] || 0) + 1;
      }

      logger.log(
        `Built ${allRelationships.length} relationships in ${
          Date.now() - startTime
        }ms. ` +
          `Types: ${Object.entries(typeStats)
            .map(([t, c]) => `${t}:${c}`)
            .join(', ')}`
      );

      // End tracing span with success
      span.end({
        relationshipCount: allRelationships.length,
        typeStats,
        invalidRefsFiltered: totalInvalidRefs,
        deduplicated: dedupedCount,
        isRetry,
        extractionMethod: effectiveMethod,
        batchCount,
      });

      return {
        final_relationships: allRelationships,
        node_responses: {
          relationship_builder: {
            relationship_count: allRelationships.length,
            type_stats: typeStats,
            invalid_refs_filtered: totalInvalidRefs,
            deduplicated: dedupedCount,
            is_retry: isRetry,
            duration_ms: Date.now() - startTime,
            method: effectiveMethodLabel,
            extraction_method: effectiveMethod,
            batch_count: batchCount,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Relationship building failed: ${errorMessage}`);

      // End tracing span with error
      span.endWithError(errorMessage);

      // Keep existing relationships if this is a retry
      const existingRelationships = isRetry ? state.final_relationships : [];

      return {
        final_relationships: existingRelationships,
        feedback_log: [`Relationship builder error: ${errorMessage}`],
        node_responses: {
          relationship_builder: {
            error: errorMessage,
            relationship_count: existingRelationships.length,
            is_retry: isRetry,
            duration_ms: Date.now() - startTime,
            extraction_method: effectiveMethod,
          },
        },
      };
    }
  };
}
