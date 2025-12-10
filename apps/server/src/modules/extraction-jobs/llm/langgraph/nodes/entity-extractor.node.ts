/**
 * Entity Extractor Node
 *
 * Extracts entities from the document using the native Gemini SDK with structured output.
 *
 * Uses a simplified schema for LLM (name, type, description only) to maximize
 * extraction performance. temp_ids are generated in post-processing.
 *
 * This node produces entities that will be:
 * 1. Created as new objects in the database (no deduplication during extraction)
 * 2. Embeddings generated for vector-based merge suggestions
 * 3. Connected by the RelationshipBuilder node using temp_ids
 *
 * Deduplication is handled post-extraction via the merge suggestion system.
 *
 * NOTE: This implementation uses the native @google/genai SDK instead of LangChain
 * because LangChain's withStructuredOutput() times out 100% of the time on Vertex AI.
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
  LLMEntity,
  EntityExtractorOutputSchema,
  generateTempId,
} from '../state';
import {
  buildEntityExtractionPrompt,
  buildEntityExtractionRetryPrompt,
} from '../prompts/entity.prompts';
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
export type ExtractionMethod = 'responseSchema' | 'function_calling';

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
 * Batch chunks together up to a maximum size limit.
 * Returns an array of batched text strings.
 */
function batchChunks(chunks: string[], maxBatchSize: number): string[] {
  const batches: string[] = [];
  let currentBatch = '';

  for (const chunk of chunks) {
    // If adding this chunk would exceed the limit, start a new batch
    if (
      currentBatch.length > 0 &&
      currentBatch.length + chunk.length > maxBatchSize
    ) {
      batches.push(currentBatch);
      currentBatch = chunk;
    } else {
      // Add separator between chunks in the same batch
      currentBatch = currentBatch
        ? `${currentBatch}\n\n---\n\n${chunk}`
        : chunk;
    }
  }

  // Don't forget the last batch
  if (currentBatch) {
    batches.push(currentBatch);
  }

  return batches;
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
    timeoutMs = 120000,
    batchSizeChars = DEFAULT_BATCH_SIZE_CHARS,
    langfuseService = null,
    promptProvider = null,
    extractionMethod = 'responseSchema',
  } = config;

  // Convert Zod schema to Google Schema for structured output
  const entityOutputSchema = geminiService.zodToGoogleSchema(
    EntityExtractorOutputSchema
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
      // Use prompt provider with Langfuse support
      // Note: Langfuse prompts don't support method-specific variants yet
      promptResult = await promptProvider.getEntityExtractorPrompt(
        text,
        objectSchemas,
        allowedTypes,
        existingEntities,
        // Pass prompt label from state for experiment prompt selection
        state.prompt_label ? { label: state.prompt_label } : undefined
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
    logger.debug(
      `[EntityExtractor] Batch ${
        batchIndex + 1
      } prompt length: ${promptLength} chars, timeout: ${timeoutMs}ms`
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
            timeoutMs,
            functionName: 'extract_entities',
            forceCall: true,
          },
          tracingContext
        );
      } else {
        // Use responseSchema method (default)
        result = await geminiService.generateStructuredOutput<{
          entities: LLMEntity[];
        }>(promptString, entityOutputSchema, { timeoutMs }, tracingContext);
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

    // Determine text batches to process
    // Priority: 1. document_chunks from state, 2. fall back to original_text
    let textBatches: string[];
    const hasChunks = state.document_chunks && state.document_chunks.length > 0;

    if (hasChunks) {
      // Batch the chunks together up to the size limit
      textBatches = batchChunks(state.document_chunks, batchSizeChars);
      logger.log(
        `[EntityExtractor] Using ${state.document_chunks.length} chunks -> ${textBatches.length} batches (max ${batchSizeChars} chars each)`
      );
    } else if (state.original_text) {
      // Fall back to original_text - check if it needs to be batched
      if (state.original_text.length > batchSizeChars) {
        // Simple split by approximate size (not ideal, but works as fallback)
        const text = state.original_text;
        textBatches = [];
        for (let i = 0; i < text.length; i += batchSizeChars) {
          textBatches.push(text.slice(i, i + batchSizeChars));
        }
        logger.log(
          `[EntityExtractor] Original text too large (${text.length} chars), split into ${textBatches.length} batches`
        );
      } else {
        textBatches = [state.original_text];
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
    const totalTextLength = textBatches.reduce((sum, b) => sum + b.length, 0);
    // Get effective method from state or fall back to config
    const effectiveMethod = state.extraction_method || extractionMethod;
    const methodLabel = `native_gemini_${effectiveMethod}`;
    const span = createNodeSpan(
      langfuseService,
      state,
      'entity_extractor',
      {
        textLength: totalTextLength,
        batchCount: textBatches.length,
        usingChunks: hasChunks,
        allowedTypes,
        schemaTypes: Object.keys(state.object_schemas),
        method: methodLabel,
        extractionMethod: effectiveMethod,
      },
      {}
    );

    try {
      // Process all batches and collect raw LLM entities
      const allRawEntities: LLMEntity[] = [];

      for (let i = 0; i < textBatches.length; i++) {
        const batchEntities = await extractFromBatch(
          textBatches[i],
          state.object_schemas,
          allowedTypes,
          i,
          textBatches.length,
          state,
          span.getSpanId()
        );
        allRawEntities.push(...batchEntities);
      }

      logger.log(
        `[EntityExtractor] Total raw entities from all batches: ${allRawEntities.length}`
      );

      // Post-process: generate temp_ids and convert to InternalEntity
      const usedTempIds = new Set<string>();
      const entities: InternalEntity[] = [];
      const allowedTypesSet = new Set(allowedTypes);
      let filteredCount = 0;

      for (const rawEntity of allRawEntities) {
        // Skip entities with empty name or type
        if (!rawEntity.name?.trim() || !rawEntity.type?.trim()) {
          filteredCount++;
          continue;
        }

        // Filter out entities with types not in the allowed list
        if (allowedTypesSet.size > 0 && !allowedTypesSet.has(rawEntity.type)) {
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

        entities.push({
          temp_id: tempId,
          name: rawEntity.name.trim(),
          type: rawEntity.type.trim(),
          description: rawEntity.description?.trim() || undefined,
          properties: {}, // Empty properties - schema validation happens in graph service
          // Pass through context-aware extraction fields from LLM
          action: rawEntity.action,
          existing_entity_id: rawEntity.existing_entity_id,
        });
      }

      // Collect discovered types
      const discoveredTypes = [...new Set(entities.map((e) => e.type))];

      // Determine if entity extraction passed
      // Pass if we got entities OR if we've exhausted retries
      const maxEntityRetries = state.max_entity_retries ?? 2;
      const currentRetryCount = state.entity_retry_count ?? 0;
      const entityExtractionPassed =
        entities.length > 0 || currentRetryCount >= maxEntityRetries;

      // Generate feedback if extraction failed (for next retry)
      const newFeedback: string[] = [];
      if (entities.length === 0 && !entityExtractionPassed) {
        newFeedback.push(
          `Attempt ${
            currentRetryCount + 1
          }: Extracted 0 entities from ${totalTextLength} chars ` +
            `(${textBatches.length} batches, method: ${effectiveMethod})`
        );
      }

      logger.log(
        `Extracted ${entities.length} entities (${
          discoveredTypes.length
        } types) from ${textBatches.length} batches in ${
          Date.now() - startTime
        }ms` +
          (filteredCount > 0 ? ` (filtered ${filteredCount})` : '') +
          (currentRetryCount > 0 ? ` [retry ${currentRetryCount}]` : '')
      );

      // End tracing span with success
      span.end({
        entityCount: entities.length,
        types: discoveredTypes,
        filteredCount,
        batchesProcessed: textBatches.length,
        extractionMethod: effectiveMethod,
        isRetry: currentRetryCount > 0,
        retryAttempt: currentRetryCount,
        entityExtractionPassed,
      });

      return {
        extracted_entities: entities,
        discovered_types: discoveredTypes,
        entity_extraction_passed: entityExtractionPassed,
        entity_retry_count:
          entities.length === 0 ? currentRetryCount + 1 : currentRetryCount,
        feedback_log: newFeedback,
        total_prompt_tokens: 0, // Token usage is tracked in Langfuse
        total_completion_tokens: 0,
        node_responses: {
          entity_extractor: {
            entity_count: entities.length,
            types: discoveredTypes,
            batches_processed: textBatches.length,
            duration_ms: Date.now() - startTime,
            method: methodLabel,
            extraction_method: effectiveMethod,
            retry_attempt: currentRetryCount,
            passed: entityExtractionPassed,
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
