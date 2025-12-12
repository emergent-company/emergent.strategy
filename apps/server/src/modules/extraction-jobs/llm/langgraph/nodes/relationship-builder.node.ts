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

/** Extraction method type */
export type ExtractionMethod = 'responseSchema' | 'function_calling';

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
  /** Extraction method: 'responseSchema' (default) or 'function_calling' */
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
    extractionMethod = 'function_calling',
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

    // Get effective method from state (per-job override) or fall back to config
    // Define this early so it can be used for prompt building
    const effectiveMethod = state.extraction_method || extractionMethod;

    // Build the appropriate prompt based on whether this is a retry
    let promptResult: PromptResult;

    if (isRetry && state.orphan_entities.length > 0) {
      // Use retry prompt focused on orphans (local only - too dynamic for Langfuse)
      promptResult = {
        prompt: buildRelationshipRetryPrompt(
          state.extracted_entities,
          state.final_relationships,
          state.document_chunks,
          state.orphan_entities,
          state.retry_count,
          state.feedback_log.slice(-3).join('\n'),
          effectiveMethod
        ),
        fromLangfuse: false,
      };
    } else if (promptProvider) {
      // Use prompt provider with Langfuse support
      // Note: Langfuse prompts don't support method-specific variants yet
      promptResult = await promptProvider.getRelationshipBuilderPrompt(
        state.document_chunks,
        state.extracted_entities,
        state.relationship_schemas,
        state.existing_entities,
        state.orphan_entities,
        // Pass prompt label from state for experiment prompt selection
        state.prompt_label ? { label: state.prompt_label } : undefined
      );
    } else {
      // Direct fallback to local prompt with extraction method
      promptResult = {
        prompt: buildRelationshipPrompt(
          state.extracted_entities,
          state.relationship_schemas,
          state.document_chunks,
          state.existing_entities,
          state.orphan_entities,
          effectiveMethod
        ),
        fromLangfuse: false,
      };
    }

    const prompt = promptResult.prompt;

    // Log prompt source for debugging
    if (promptResult.fromLangfuse) {
      logger.debug(
        `Using Langfuse prompt v${promptResult.version} [${
          promptResult.labels?.join(', ') || 'no labels'
        }]`
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
        promptSource: promptResult.fromLangfuse ? 'langfuse' : 'local',
        promptVersion: promptResult.version,
        promptLabels: promptResult.labels,
        method: effectiveMethodLabel,
        extractionMethod: effectiveMethod,
      },
      {}
    );

    // Create tracing context for Langfuse
    const tracingContext: TracingContext | undefined = state.trace_id
      ? {
          traceId: state.trace_id,
          parentObservationId: span.getSpanId() || state.parent_observation_id,
          generationName: 'build_relationships_llm',
          metadata: {
            promptSource: promptResult.fromLangfuse ? 'langfuse' : 'local',
            promptVersion: promptResult.version,
            isRetry,
            entityCount: state.extracted_entities.length,
            extractionMethod: effectiveMethod,
          },
        }
      : undefined;

    // Get effective timeout from state (per-job) or fall back to config default
    const effectiveTimeoutMs = state.timeout_ms || timeoutMs;

    try {
      logger.debug(
        `[RelationshipBuilder] Calling native Gemini SDK (${effectiveMethod})...`
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
          tracingContext
        );
      } else {
        // Use responseSchema method (default)
        result = await geminiService.generateStructuredOutput<{
          relationships: InternalRelationship[];
        }>(
          promptString,
          relationshipOutputSchema,
          { timeoutMs: effectiveTimeoutMs, maxOutputTokens: 65535 },
          tracingContext
        );
      }

      if (!result.success) {
        throw new Error(result.error || 'Unknown error from Gemini SDK');
      }

      const rawRelationships = result.data?.relationships || [];

      logger.log(
        `[RelationshipBuilder] Received ${rawRelationships.length} relationships in ${result.durationMs}ms (method: ${effectiveMethod})`
      );

      // Validate that all references point to valid temp_ids or existing UUIDs
      const validTempIds = new Set(
        state.extracted_entities.map((e) => e.temp_id)
      );
      const existingIds = new Set(state.existing_entities.map((e) => e.id));

      const { valid, invalid } = validateRelationshipRefs(
        rawRelationships,
        validTempIds,
        existingIds
      );

      if (invalid.length > 0) {
        logger.warn(
          `${invalid.length} relationships had invalid references and were filtered out`
        );
      }

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
        valid,
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
        invalidRefsFiltered: invalid.length,
        deduplicated: dedupedCount,
        isRetry,
        extractionMethod: effectiveMethod,
      });

      return {
        final_relationships: allRelationships,
        node_responses: {
          relationship_builder: {
            relationship_count: allRelationships.length,
            type_stats: typeStats,
            invalid_refs_filtered: invalid.length,
            deduplicated: dedupedCount,
            is_retry: isRetry,
            duration_ms: Date.now() - startTime,
            method: effectiveMethodLabel,
            extraction_method: effectiveMethod,
            prompt_source: promptResult.fromLangfuse ? 'langfuse' : 'local',
            prompt_version: promptResult.version,
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
