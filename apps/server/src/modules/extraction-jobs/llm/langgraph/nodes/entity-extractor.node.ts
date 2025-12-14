/**
 * Entity Extractor Node
 *
 * Extracts entities from the document using the native Gemini SDK with structured output.
 * Also builds relationships per-batch to ensure semantic coherence.
 *
 * Uses a simplified schema for LLM (name, type, description only) to maximize
 * extraction performance. temp_ids are generated in post-processing.
 *
 * This node produces entities that will be:
 * 1. Created as new objects in the database (no deduplication during extraction)
 * 2. Embeddings generated for vector-based merge suggestions
 * 3. Connected to each other via relationships built inline per-batch
 *
 * Deduplication is handled post-extraction via the merge suggestion system.
 *
 * NOTE: This implementation uses the native @google/genai SDK instead of LangChain
 * because LangChain's withStructuredOutput() times out 100% of the time on Vertex AI.
 *
 * Key Design Decision (Per-Batch Relationship Building):
 * - Relationships are built immediately after each entity extraction batch
 * - This uses the SAME chunk batch for both entity and relationship extraction
 * - Ensures semantic coherence: relationships are built from the same context that defined entities
 * - Avoids token overflow: chunk volume is controlled at the batch level
 * - Eliminates need for post-hoc chunk-entity correlation
 *
 * Supports two extraction methods:
 * - responseSchema: Uses JSON mode with schema enforcement (default, more reliable)
 * - function_calling: Uses function calling to extract entities (alternative method)
 */

import { Logger } from '@nestjs/common';
import {
  ExtractionGraphState,
  ExtractionGraphStateType,
  InternalEntity,
  InternalRelationship,
  LLMEntity,
  EntityExtractorOutputSchema,
  RelationshipBuilderOutputSchema,
  generateTempId,
} from '../state';
import {
  buildEntityExtractionPrompt,
  buildEntityExtractionRetryPrompt,
} from '../prompts/entity.prompts';
import { buildRelationshipPrompt } from '../prompts/relationship.prompts';
import {
  ExtractionPromptProvider,
  PromptResult,
} from '../prompts/prompt-provider.service';
import {
  NativeGeminiService,
  TracingContext,
} from '../../../../llm/native-gemini.service';
import { createNodeSpan } from '../tracing';
import { LangfuseService } from '../../../../langfuse/langfuse.service';

const logger = new Logger('EntityExtractorNode');

/** Maximum size in characters for a single LLM batch */
const DEFAULT_BATCH_SIZE_CHARS = 20000; // 20KB per batch

/** Extraction method type */
export type ExtractionMethod =
  | 'responseSchema'
  | 'function_calling'
  | 'json_freeform';

/**
 * Node configuration
 */
export interface EntityExtractorNodeConfig {
  /** NativeGeminiService instance for LLM calls */
  geminiService: NativeGeminiService;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum batch size in characters (default: 20KB) */
  batchSizeChars?: number;
  /** Optional LangfuseService for tracing */
  langfuseService?: LangfuseService | null;
  /** Optional prompt provider for Langfuse prompt management */
  promptProvider?: ExtractionPromptProvider | null;
  /** Extraction method: 'responseSchema' (default) or 'function_calling' */
  extractionMethod?: ExtractionMethod;
}

/**
 * Result of batching chunks - includes both combined text and source chunks
 */
interface ChunkBatch {
  /** Combined text of all chunks in this batch */
  text: string;
  /** Original chunks that make up this batch (for relationship extraction) */
  sourceChunks: string[];
}

/**
 * Batch chunks together up to a maximum size limit.
 * Returns batched text AND the original source chunks for each batch.
 * This is critical for per-batch relationship building: we use the SAME chunks
 * for both entity and relationship extraction to ensure semantic coherence.
 */
function batchChunksWithSources(
  chunks: string[],
  maxBatchSize: number
): ChunkBatch[] {
  const batches: ChunkBatch[] = [];
  let currentText = '';
  let currentChunks: string[] = [];

  for (const chunk of chunks) {
    // If adding this chunk would exceed the limit, start a new batch
    if (
      currentText.length > 0 &&
      currentText.length + chunk.length > maxBatchSize
    ) {
      batches.push({ text: currentText, sourceChunks: currentChunks });
      currentText = chunk;
      currentChunks = [chunk];
    } else {
      // Add separator between chunks in the same batch
      currentText = currentText ? `${currentText}\n\n---\n\n${chunk}` : chunk;
      currentChunks.push(chunk);
    }
  }

  // Don't forget the last batch
  if (currentText) {
    batches.push({ text: currentText, sourceChunks: currentChunks });
  }

  return batches;
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use batchChunksWithSources instead
 */
function batchChunks(chunks: string[], maxBatchSize: number): string[] {
  return batchChunksWithSources(chunks, maxBatchSize).map((b) => b.text);
}

/**
 * Create the entity extractor node function using native Gemini SDK
 *
 * Extracts entities from the document based on the classified category
 * and available object schemas.
 */
export function createEntityExtractorNode(config: EntityExtractorNodeConfig) {
  const {
    geminiService,
    timeoutMs = 600000, // 10 minutes - increased for large document extraction
    batchSizeChars = DEFAULT_BATCH_SIZE_CHARS,
    langfuseService = null,
    promptProvider = null,
    extractionMethod = 'json_freeform', // Default to json_freeform for best property population
  } = config;

  // Convert Zod schema to Google Schema for structured output
  const entityOutputSchema = geminiService.zodToGoogleSchema(
    EntityExtractorOutputSchema
  );

  // Debug log the generated schema to verify it includes additionalProperties for z.record()
  logger.debug(
    `[EntityExtractor] Generated Google Schema: ${JSON.stringify(
      entityOutputSchema,
      null,
      2
    )}`
  );

  // Create function declaration for function calling method
  const entityExtractionFunction = geminiService.createFunctionDeclaration(
    'extract_entities',
    'Extract entities from the document text. Returns an array of entities with their names, types, and descriptions.',
    EntityExtractorOutputSchema
  );

  logger.log(
    `[EntityExtractor] Using native Gemini SDK with ${extractionMethod} for structured output`
  );

  /**
   * Extract entities from a single text batch
   */
  async function extractFromBatch(
    text: string,
    objectSchemas: Record<string, any>,
    allowedTypes: string[],
    batchIndex: number,
    totalBatches: number,
    state: typeof ExtractionGraphState.State,
    parentSpanId?: string
  ): Promise<LLMEntity[]> {
    const batchStart = Date.now();

    // Get extraction method from state (per-job override) or fall back to config default
    const effectiveMethod = state.extraction_method || extractionMethod;

    // Get existing entities for context-aware extraction
    const existingEntities = state.existing_entities || [];

    // Check if this is a retry attempt
    const isRetry = (state.entity_retry_count || 0) > 0;

    // Build prompt for this batch
    let promptResult: PromptResult;

    if (isRetry) {
      // Use retry prompt with feedback from previous attempt
      promptResult = {
        prompt: buildEntityExtractionRetryPrompt(
          text,
          objectSchemas,
          allowedTypes,
          existingEntities,
          effectiveMethod,
          state.entity_retry_count || 1,
          state.feedback_log || []
        ),
        fromLangfuse: false,
      };
      logger.log(
        `[EntityExtractor] Retry attempt ${
          state.entity_retry_count
        } for batch ${batchIndex + 1}`
      );
    } else if (promptProvider) {
      // Use prompt provider with Langfuse support (method-specific prompts)
      promptResult = await promptProvider.getEntityExtractorPrompt(
        text,
        objectSchemas,
        allowedTypes,
        existingEntities,
        // Pass prompt label from state for experiment prompt selection
        state.prompt_label ? { label: state.prompt_label } : undefined,
        effectiveMethod
      );
    } else {
      // Direct fallback to local prompt with existing entities and extraction method
      promptResult = {
        prompt: buildEntityExtractionPrompt(
          text,
          objectSchemas,
          allowedTypes,
          existingEntities,
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

    logger.log(
      `[EntityExtractor] Processing batch ${batchIndex + 1}/${totalBatches} (${
        text.length
      } chars, ${existingEntities.length} existing entities for context)`
    );

    // Log prompt details for debugging
    const promptLength =
      typeof prompt === 'string'
        ? prompt.length
        : JSON.stringify(prompt).length;
    // Get effective timeout from state (per-job) or fall back to config default
    const effectiveTimeoutMs = state.timeout_ms || timeoutMs;
    logger.debug(
      `[EntityExtractor] Batch ${
        batchIndex + 1
      } prompt length: ${promptLength} chars, timeout: ${effectiveTimeoutMs}ms`
    );

    // Create tracing context for Langfuse
    const tracingContext: TracingContext | undefined = state.trace_id
      ? {
          traceId: state.trace_id,
          parentObservationId: parentSpanId || state.parent_observation_id,
          generationName: `extract_entities_batch_${batchIndex + 1}`,
          metadata: {
            batchIndex,
            totalBatches,
            textLength: text.length,
            promptLength,
            allowedTypes,
            existingEntityCount: existingEntities.length,
            promptSource: promptResult.fromLangfuse ? 'langfuse' : 'local',
            extractionMethod: effectiveMethod,
          },
        }
      : undefined;

    try {
      logger.debug(
        `[EntityExtractor] Batch ${
          batchIndex + 1
        } calling native Gemini SDK (${effectiveMethod})...`
      );

      const promptString =
        typeof prompt === 'string' ? prompt : JSON.stringify(prompt);

      let result;

      if (effectiveMethod === 'function_calling') {
        // Use function calling method
        result = await geminiService.generateWithFunctionCall<{
          entities: LLMEntity[];
        }>(
          promptString,
          entityExtractionFunction,
          {
            timeoutMs: effectiveTimeoutMs,
            functionName: 'extract_entities',
            forceCall: true,
          },
          tracingContext
        );
      } else if (effectiveMethod === 'json_freeform') {
        // Use JSON freeform method (best for property population)
        // No schema enforcement - model follows prompt instructions
        result = await geminiService.generateJsonFreeform<{
          entities: LLMEntity[];
        }>(promptString, { timeoutMs: effectiveTimeoutMs }, tracingContext);
      } else {
        // Use responseSchema method
        result = await geminiService.generateStructuredOutput<{
          entities: LLMEntity[];
        }>(
          promptString,
          entityOutputSchema,
          { timeoutMs: effectiveTimeoutMs },
          tracingContext
        );
      }

      if (!result.success) {
        logger.error(
          `[EntityExtractor] Batch ${batchIndex + 1} failed: ${result.error}`
        );
        return [];
      }

      const entities: LLMEntity[] = result.data?.entities || [];

      logger.log(
        `[EntityExtractor] Batch ${batchIndex + 1} extracted ${
          entities.length
        } entities in ${Date.now() - batchStart}ms (tokens: ${
          result.usage?.totalTokens || 'N/A'
        }, method: ${effectiveMethod})`
      );

      return entities;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `[EntityExtractor] Batch ${batchIndex + 1} failed: ${errorMessage}`
      );
      return [];
    }
  }

  // Convert Zod schema to Google Schema for relationship structured output
  const relationshipOutputSchema = geminiService.zodToGoogleSchema(
    RelationshipBuilderOutputSchema
  );

  // Create function declaration for relationship function calling
  const relationshipExtractionFunction =
    geminiService.createFunctionDeclaration(
      'build_relationships',
      'Build relationships between entities extracted from the document. Returns an array of relationships with source, target, type, and description.',
      RelationshipBuilderOutputSchema
    );

  /**
   * Build relationships for a batch of entities using the SAME chunk batch
   * that produced those entities. This ensures semantic coherence.
   */
  async function buildRelationshipsForBatch(
    batchEntities: InternalEntity[],
    allEntitiesSoFar: InternalEntity[],
    sourceChunks: string[],
    batchIndex: number,
    totalBatches: number,
    state: typeof ExtractionGraphState.State,
    parentSpanId?: string
  ): Promise<InternalRelationship[]> {
    // Skip if no entities in this batch
    if (batchEntities.length === 0) {
      logger.debug(
        `[EntityExtractor] Batch ${
          batchIndex + 1
        }: No entities, skipping relationship building`
      );
      return [];
    }

    const batchStart = Date.now();
    const effectiveMethod = state.extraction_method || extractionMethod;
    const effectiveTimeoutMs = state.timeout_ms || timeoutMs;

    // Build relationship prompt using the SAME chunks that produced these entities
    // Pass all entities accumulated so far for cross-batch relationship building
    const prompt = buildRelationshipPrompt(
      allEntitiesSoFar, // All entities for reference
      state.relationship_schemas,
      sourceChunks, // Use the exact same chunks that produced the entities
      state.existing_entities,
      [], // No orphans yet - this is initial extraction
      effectiveMethod
    );

    const promptString =
      typeof prompt === 'string' ? prompt : JSON.stringify(prompt);

    // Create tracing context for Langfuse
    const tracingContext: TracingContext | undefined = state.trace_id
      ? {
          traceId: state.trace_id,
          parentObservationId: parentSpanId || state.parent_observation_id,
          generationName: `build_relationships_batch_${batchIndex + 1}`,
          metadata: {
            batchIndex,
            totalBatches,
            batchEntityCount: batchEntities.length,
            totalEntityCount: allEntitiesSoFar.length,
            chunkCount: sourceChunks.length,
            extractionMethod: effectiveMethod,
            perBatchProcessing: true,
          },
        }
      : undefined;

    try {
      logger.debug(
        `[EntityExtractor] Batch ${
          batchIndex + 1
        }: Building relationships for ${batchEntities.length} entities using ${
          sourceChunks.length
        } source chunks...`
      );

      let result;

      if (effectiveMethod === 'function_calling') {
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
      } else if (effectiveMethod === 'json_freeform') {
        result = await geminiService.generateJsonFreeform<{
          relationships: InternalRelationship[];
        }>(
          promptString,
          { timeoutMs: effectiveTimeoutMs, maxOutputTokens: 65535 },
          tracingContext
        );
      } else {
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
        logger.error(
          `[EntityExtractor] Batch ${
            batchIndex + 1
          } relationship building failed: ${result.error}`
        );
        return [];
      }

      const relationships: InternalRelationship[] =
        result.data?.relationships || [];

      logger.log(
        `[EntityExtractor] Batch ${batchIndex + 1}: Built ${
          relationships.length
        } relationships in ${Date.now() - batchStart}ms`
      );

      return relationships;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `[EntityExtractor] Batch ${
          batchIndex + 1
        } relationship building failed: ${errorMessage}`
      );
      return [];
    }
  }

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const startTime = Date.now();
    logger.debug('Starting entity extraction with native Gemini SDK');

    // Check if service is available
    if (!geminiService.isAvailable()) {
      logger.error('[EntityExtractor] NativeGeminiService is not available');
      return {
        extracted_entities: [],
        feedback_log: ['NativeGeminiService not initialized'],
      };
    }

    // Get allowed types from state
    const allowedTypes =
      state.allowed_types || Object.keys(state.object_schemas);

    // Get effective batch size from state (per-job) or fall back to config default
    const effectiveBatchSizeChars = state.batch_size_chars || batchSizeChars;

    // Determine text batches to process
    // Priority: 1. document_chunks from state, 2. fall back to original_text
    // Use batchChunksWithSources to preserve source chunks for per-batch relationship building
    let chunkBatches: ChunkBatch[];
    const hasChunks = state.document_chunks && state.document_chunks.length > 0;

    if (hasChunks) {
      // Batch the chunks together up to the size limit, preserving source chunks
      chunkBatches = batchChunksWithSources(
        state.document_chunks,
        effectiveBatchSizeChars
      );
      logger.log(
        `[EntityExtractor] Using ${state.document_chunks.length} chunks -> ${chunkBatches.length} batches (max ${effectiveBatchSizeChars} chars each)`
      );
    } else if (state.original_text) {
      // Fall back to original_text - check if it needs to be batched
      if (state.original_text.length > effectiveBatchSizeChars) {
        // Simple split by approximate size (not ideal, but works as fallback)
        const text = state.original_text;
        chunkBatches = [];
        for (let i = 0; i < text.length; i += effectiveBatchSizeChars) {
          const batchText = text.slice(i, i + effectiveBatchSizeChars);
          chunkBatches.push({ text: batchText, sourceChunks: [batchText] });
        }
        logger.log(
          `[EntityExtractor] Original text too large (${text.length} chars), split into ${chunkBatches.length} batches`
        );
      } else {
        chunkBatches = [
          { text: state.original_text, sourceChunks: [state.original_text] },
        ];
        logger.log(
          `[EntityExtractor] Using original_text as single batch (${state.original_text.length} chars)`
        );
      }
    } else {
      logger.warn('[EntityExtractor] No text content provided');
      return {
        extracted_entities: [],
        feedback_log: ['No text content provided for extraction'],
      };
    }

    // Create tracing span for this node
    const totalTextLength = chunkBatches.reduce(
      (sum, b) => sum + b.text.length,
      0
    );
    // Get effective method from state or fall back to config
    const effectiveMethod = state.extraction_method || extractionMethod;
    const methodLabel = `native_gemini_${effectiveMethod}`;
    const span = createNodeSpan(
      langfuseService,
      state,
      'entity_extractor',
      {
        textLength: totalTextLength,
        batchCount: chunkBatches.length,
        usingChunks: hasChunks,
        allowedTypes,
        schemaTypes: Object.keys(state.object_schemas),
        method: methodLabel,
        extractionMethod: effectiveMethod,
        perBatchRelationshipBuilding: true,
      },
      {}
    );

    try {
      // Track all entities and relationships across batches
      const usedTempIds = new Set<string>();
      const allEntities: InternalEntity[] = [];
      const allRelationships: InternalRelationship[] = [];
      const allowedTypesSet = new Set(allowedTypes);
      let filteredCount = 0;
      let totalRelationshipsBuilt = 0;

      // Process each batch: extract entities → build relationships
      for (let i = 0; i < chunkBatches.length; i++) {
        const batch = chunkBatches[i];

        // Step 1: Extract entities from this batch
        const rawEntities = await extractFromBatch(
          batch.text,
          state.object_schemas,
          allowedTypes,
          i,
          chunkBatches.length,
          state,
          span.getSpanId()
        );

        // Step 2: Convert to InternalEntity with temp_ids
        const batchEntities: InternalEntity[] = [];
        for (const rawEntity of rawEntities) {
          // Skip entities with empty name or type
          if (!rawEntity.name?.trim() || !rawEntity.type?.trim()) {
            filteredCount++;
            continue;
          }

          // Filter out entities with types not in the allowed list
          if (
            allowedTypesSet.size > 0 &&
            !allowedTypesSet.has(rawEntity.type)
          ) {
            logger.debug(
              `Filtering out entity "${rawEntity.name}" with invalid type "${rawEntity.type}"`
            );
            filteredCount++;
            continue;
          }

          // Generate temp_id in post-processing
          const tempId = generateTempId(
            rawEntity.name,
            rawEntity.type,
            usedTempIds
          );
          usedTempIds.add(tempId);

          const entity: InternalEntity = {
            temp_id: tempId,
            name: rawEntity.name.trim(),
            type: rawEntity.type.trim(),
            description: rawEntity.description?.trim() || undefined,
            properties: rawEntity.properties || {},
            action: rawEntity.action,
            existing_entity_id: rawEntity.existing_entity_id,
          };
          batchEntities.push(entity);
          allEntities.push(entity);
        }

        // Step 3: Build relationships for this batch using the SAME source chunks
        // Pass all entities accumulated so far for cross-batch references
        if (batchEntities.length > 0) {
          const batchRelationships = await buildRelationshipsForBatch(
            batchEntities,
            allEntities, // All entities for reference
            batch.sourceChunks, // SAME chunks that produced these entities
            i,
            chunkBatches.length,
            state,
            span.getSpanId()
          );

          // Validate relationship references
          const validRelationships = batchRelationships.filter((rel) => {
            const sourceValid =
              usedTempIds.has(rel.source_ref) ||
              state.existing_entities.some((e) => e.id === rel.source_ref);
            const targetValid =
              usedTempIds.has(rel.target_ref) ||
              state.existing_entities.some((e) => e.id === rel.target_ref);

            if (!sourceValid || !targetValid) {
              logger.debug(
                `Filtering invalid relationship: ${rel.source_ref} -> ${rel.target_ref} ` +
                  `(source valid: ${sourceValid}, target valid: ${targetValid})`
              );
              return false;
            }
            return true;
          });

          allRelationships.push(...validRelationships);
          totalRelationshipsBuilt += validRelationships.length;
        }
      }

      logger.log(
        `[EntityExtractor] Total from all batches: ${allEntities.length} entities, ${allRelationships.length} relationships`
      );

      // Collect discovered types
      const discoveredTypes = [...new Set(allEntities.map((e) => e.type))];

      // Determine if entity extraction passed
      // Pass if we got entities OR if we've exhausted retries
      const maxEntityRetries = state.max_entity_retries ?? 2;
      const currentRetryCount = state.entity_retry_count ?? 0;
      const entityExtractionPassed =
        allEntities.length > 0 || currentRetryCount >= maxEntityRetries;

      // Generate feedback if extraction failed (for next retry)
      const newFeedback: string[] = [];
      if (allEntities.length === 0 && !entityExtractionPassed) {
        newFeedback.push(
          `Attempt ${
            currentRetryCount + 1
          }: Extracted 0 entities from ${totalTextLength} chars ` +
            `(${chunkBatches.length} batches, method: ${effectiveMethod})`
        );
      }

      logger.log(
        `Extracted ${allEntities.length} entities (${
          discoveredTypes.length
        } types) and ${allRelationships.length} relationships from ${
          chunkBatches.length
        } batches in ${Date.now() - startTime}ms` +
          (filteredCount > 0 ? ` (filtered ${filteredCount})` : '') +
          (currentRetryCount > 0 ? ` [retry ${currentRetryCount}]` : '')
      );

      // End tracing span with success
      span.end({
        entityCount: allEntities.length,
        relationshipCount: allRelationships.length,
        types: discoveredTypes,
        filteredCount,
        batchesProcessed: chunkBatches.length,
        extractionMethod: effectiveMethod,
        isRetry: currentRetryCount > 0,
        retryAttempt: currentRetryCount,
        entityExtractionPassed,
        perBatchRelationshipBuilding: true,
      });

      return {
        extracted_entities: allEntities,
        // Pass relationships built per-batch - relationship_builder will use these
        final_relationships: allRelationships,
        discovered_types: discoveredTypes,
        entity_extraction_passed: entityExtractionPassed,
        entity_retry_count:
          allEntities.length === 0 ? currentRetryCount + 1 : currentRetryCount,
        feedback_log: newFeedback,
        total_prompt_tokens: 0, // Token usage is tracked in Langfuse
        total_completion_tokens: 0,
        node_responses: {
          entity_extractor: {
            entity_count: allEntities.length,
            relationship_count: allRelationships.length,
            types: discoveredTypes,
            batches_processed: chunkBatches.length,
            duration_ms: Date.now() - startTime,
            method: methodLabel,
            extraction_method: effectiveMethod,
            retry_attempt: currentRetryCount,
            passed: entityExtractionPassed,
            per_batch_relationship_building: true,
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Entity extraction failed: ${errorMessage}`);

      // End tracing span with error
      span.endWithError(errorMessage);

      // Determine if we should trigger retry
      const maxEntityRetries = state.max_entity_retries ?? 2;
      const currentRetryCount = state.entity_retry_count ?? 0;
      const shouldRetry = currentRetryCount < maxEntityRetries;
      const entityExtractionPassed = !shouldRetry;

      // Add error feedback for retry
      const errorFeedback = shouldRetry
        ? [`Attempt ${currentRetryCount + 1} error: ${errorMessage}`]
        : [`Entity extractor error: ${errorMessage}`];

      return {
        extracted_entities: [],
        entity_extraction_passed: entityExtractionPassed,
        entity_retry_count: currentRetryCount + 1,
        feedback_log: errorFeedback,
        node_responses: {
          entity_extractor: {
            error: errorMessage,
            entity_count: 0,
            duration_ms: Date.now() - startTime,
            extraction_method: extractionMethod,
            retry_attempt: currentRetryCount,
            will_retry: shouldRetry,
          },
        },
      };
    }
  };
}
