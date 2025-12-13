/**
 * LangGraph Extraction Provider
 *
 * Implements ILLMProvider using a LangGraph-based multi-step pipeline.
 * This provider runs a 4-node graph for entity extraction with verification:
 *
 *   Entity_Extractor → Relationship_Builder → Entity_Verification → Relationship_Verification
 *         ↑______|
 *    (retry if 0 entities)
 *
 * Key features:
 * - Parallel service: Coexists with LangChainGeminiProvider
 * - Feature flag: Controlled by EXTRACTION_PIPELINE_MODE env var
 * - Entity retry: Retries entity extraction up to 2x if 0 entities returned
 * - Verification cascade: 3-tier verification (exact match, NLI, LLM judge)
 * - Confidence scoring: Weighted average (40% name, 30% description, 30% properties)
 * - Schema-driven: Works with any document type based on provided schemas
 */

import {
  Injectable,
  Logger,
  Optional,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { StateGraph, END, START } from '@langchain/langgraph';
import { AppConfigService } from '../../../common/config/config.service';
import { LangfuseService } from '../../langfuse/langfuse.service';
import { NativeGeminiService } from '../../llm/native-gemini.service';
import { ExtractionPromptProvider } from './langgraph/prompts/prompt-provider.service';
import {
  ILLMProvider,
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionOptions,
} from './llm-provider.interface';
import {
  ExtractionGraphState,
  InternalEntity,
  InternalRelationship,
} from './langgraph/state';
import { createEntityExtractorNode } from './langgraph/nodes/entity-extractor.node';
import { createRelationshipBuilderNode } from './langgraph/nodes/relationship-builder.node';
import { createEntityVerificationNode } from './langgraph/nodes/entity-verification.node';
import { createRelationshipVerificationNode } from './langgraph/nodes/relationship-verification.node';
import { VerificationService } from '../../verification/verification.service';

/**
 * Router function for entity extraction retry decision
 *
 * Returns:
 * - "retry": if extraction returned 0 entities/error and retries remain
 * - "continue": if extraction succeeded or no retries remain
 */
function entityExtractionRouter(
  state: typeof ExtractionGraphState.State
): 'retry' | 'continue' {
  if (state.entity_extraction_passed) {
    return 'continue';
  }

  const maxRetries = state.max_entity_retries ?? 2;
  if (state.entity_retry_count < maxRetries) {
    return 'retry';
  }

  return 'continue';
}

/**
 * LangGraph-based extraction provider
 *
 * Uses a multi-step graph pipeline for better relationship extraction.
 */
@Injectable()
export class LangGraphExtractionProvider implements ILLMProvider, OnModuleInit {
  private readonly logger = new Logger(LangGraphExtractionProvider.name);
  // Using 'any' for compiledGraph due to complex LangGraph generic types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private compiledGraph: any = null;
  private isInitialized = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(LangfuseService) private readonly langfuseService: LangfuseService,
    @Inject(NativeGeminiService)
    private readonly geminiService: NativeGeminiService,
    @Optional()
    @Inject(ExtractionPromptProvider)
    private readonly promptProvider: ExtractionPromptProvider | null,
    @Inject(VerificationService)
    private readonly verificationService: VerificationService
  ) {
    // Note: initialization moved to onModuleInit() to ensure NativeGeminiService
    // is fully initialized before we check isAvailable()
  }

  /**
   * Initialize the LangGraph pipeline after all dependencies are ready.
   * This runs after NativeGeminiService.onModuleInit() has completed.
   */
  onModuleInit() {
    this.initialize();
  }

  private initialize() {
    // Check if gemini service is available
    if (!this.geminiService.isAvailable()) {
      this.logger.warn(
        'LangGraph provider not configured: NativeGeminiService not available'
      );
      return;
    }

    // Get extraction method from config
    const extractionMethod = this.config.extractionMethod;

    try {
      // Create nodes with NativeGeminiService for LLM calls
      // Note: Document router removed - we now use general schema-driven extraction
      const entityExtractor = createEntityExtractorNode({
        geminiService: this.geminiService,
        timeoutMs: 600000, // 10 minutes - increased for large document extraction
        langfuseService: this.langfuseService,
        promptProvider: this.promptProvider,
        extractionMethod,
      });

      const relationshipBuilder = createRelationshipBuilderNode({
        geminiService: this.geminiService,
        timeoutMs: 600000, // 10 minutes - increased for large document extraction
        langfuseService: this.langfuseService,
        promptProvider: this.promptProvider,
        extractionMethod,
      });

      // Create verification nodes with 5-minute timeout
      const entityVerification = createEntityVerificationNode({
        verificationService: this.verificationService,
        langfuseService: this.langfuseService,
        timeoutMs: 300000, // 5 minutes
      });

      const relationshipVerification = createRelationshipVerificationNode({
        verificationService: this.verificationService,
        langfuseService: this.langfuseService,
        timeoutMs: 300000, // 5 minutes
      });

      // Build the graph - 4 nodes with entity extraction retry loop
      // Flow: entity_extractor → relationship_builder → entity_verification → relationship_verification
      const graph = new StateGraph(ExtractionGraphState)
        // Add nodes
        .addNode('entity_extractor', entityExtractor)
        .addNode('relationship_builder', relationshipBuilder)
        .addNode('entity_verification', entityVerification)
        .addNode('relationship_verification', relationshipVerification)
        // Define edges - start directly with entity extraction
        .addEdge(START, 'entity_extractor')
        // Conditional edge: retry entity extraction if 0 entities or error
        .addConditionalEdges('entity_extractor', entityExtractionRouter, {
          retry: 'entity_extractor',
          continue: 'relationship_builder',
        })
        .addEdge('relationship_builder', 'entity_verification')
        .addEdge('entity_verification', 'relationship_verification')
        .addEdge('relationship_verification', END);

      // Compile the graph
      this.compiledGraph = graph.compile();
      this.isInitialized = true;

      this.logger.log(
        `LangGraph extraction provider initialized with native Gemini SDK (method: ${extractionMethod})`
      );
    } catch (error) {
      this.logger.error('Failed to initialize LangGraph provider:', error);
      this.isInitialized = false;
    }
  }

  getName(): string {
    return 'LangGraph-Extraction';
  }

  isConfigured(): boolean {
    return this.isInitialized && this.compiledGraph !== null;
  }

  async extractEntities(
    documentContent: string,
    extractionPrompt: string,
    options: ExtractionOptions
  ): Promise<ExtractionResult> {
    if (!this.isConfigured()) {
      throw new Error('LangGraph extraction provider not configured');
    }

    const startTime = Date.now();
    this.logger.debug(
      `Starting LangGraph extraction for ${documentContent.length} chars`
    );

    // Create a parent span for the entire LangGraph pipeline
    const traceId = options.context?.traceId;
    const parentObservationId = options.context?.parentObservationId;
    const pipelineSpan = traceId
      ? this.langfuseService.createSpan(
          traceId,
          'langgraph-pipeline',
          {
            documentLength: documentContent.length,
            entityTypes:
              options.allowedTypes || Object.keys(options.objectSchemas),
            existingEntitiesCount: options.existingEntities?.length ?? 0,
          },
          {
            provider: 'LangGraph-Extraction',
            model: this.config.vertexAiModel,
          }
        )
      : null;

    // Use the pipeline span ID as parent for all nodes
    const graphParentId = pipelineSpan?.id || parentObservationId;

    try {
      // Prepare initial state with tracing context
      const initialState = {
        original_text: documentContent,
        // Pass pre-chunked document text if available for efficient batch processing
        document_chunks: options.documentChunks || [],
        file_metadata: {},
        existing_entities: options.existingEntities || [],
        object_schemas: options.objectSchemas,
        relationship_schemas: options.relationshipSchemas || {},
        allowed_types: options.allowedTypes,
        available_tags: options.availableTags || [],
        max_retries: 3,
        // Entity extraction retry state
        entity_retry_count: 0,
        max_entity_retries: 2,
        entity_extraction_passed: true,
        // Pass tracing context to graph nodes
        trace_id: traceId,
        parent_observation_id: graphParentId,
        // Pass prompt label for Langfuse prompt selection
        prompt_label: options.promptLabel,
        // Pass extraction method override (per-job) or use server default
        extraction_method:
          options.extractionMethod || this.config.extractionMethod,
        // Pass timeout and batch size from options or use defaults from state
        timeout_ms: options.timeoutMs, // Will use state default (180000) if undefined
        batch_size_chars: options.batchSizeChars, // Will use state default (30000) if undefined
        // Pass similarity threshold from options or use state default (0.7)
        similarity_threshold: options.similarityThreshold,
        // Verification configuration - options override config defaults
        verification_config: {
          enabled:
            options.verificationEnabled ??
            this.config.extractionVerificationEnabled,
          confidence_threshold:
            options.confidenceThreshold ??
            this.config.extractionConfidenceThresholdReview,
          auto_accept_threshold:
            options.autoAcceptThreshold ??
            this.config.extractionConfidenceThresholdAuto,
        },
      };

      // Log chunk info
      if (options.documentChunks?.length) {
        this.logger.log(
          `Using ${options.documentChunks.length} pre-computed chunks for extraction`
        );
      }

      // Invoke the graph
      const finalState = await this.compiledGraph.invoke(initialState);

      // Transform graph state to ExtractionResult
      const result = this.transformStateToResult(finalState, startTime);

      this.logger.log(
        `LangGraph extraction complete: ${result.entities.length} entities, ` +
          `${result.relationships.length} relationships in ${
            Date.now() - startTime
          }ms`
      );

      // End the pipeline span with success
      if (pipelineSpan) {
        this.langfuseService.endSpan(
          pipelineSpan,
          {
            entitiesCount: result.entities.length,
            relationshipsCount: result.relationships.length,
            durationMs: Date.now() - startTime,
          },
          'success'
        );
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`LangGraph extraction failed: ${errorMessage}`);

      // End the pipeline span with error
      if (pipelineSpan) {
        this.langfuseService.endSpan(
          pipelineSpan,
          { error: errorMessage },
          'error',
          errorMessage
        );
      }

      throw error;
    }
  }

  /**
   * Transform the graph's final state into ExtractionResult format
   */
  private transformStateToResult(
    state: typeof ExtractionGraphState.State,
    startTime: number
  ): ExtractionResult {
    // Transform internal entities to ExtractedEntity format
    // Include verification fields from the verification nodes
    const entities: ExtractedEntity[] = state.extracted_entities.map(
      (entity: InternalEntity) => ({
        type_name: entity.type,
        name: entity.name,
        description: entity.description || '', // Default to empty string
        // NOTE: business_key is no longer set - key column is nullable
        // Deduplication is handled by a separate merge process
        properties: entity.properties || {},
        // Verification fields from entity-verification node
        confidence: entity.confidence,
        verification_status: entity.verification_status,
        action: entity.action,
        existing_entity_id: entity.existing_entity_id,
      })
    );

    // Transform internal relationships to ExtractedRelationship format
    // Need to resolve temp_ids to entity names or UUIDs
    const relationships: ExtractedRelationship[] =
      state.final_relationships.map((rel: InternalRelationship) => {
        // Find source and target entities
        const sourceEntity = state.extracted_entities.find(
          (e: InternalEntity) => e.temp_id === rel.source_ref
        );
        const targetEntity = state.extracted_entities.find(
          (e: InternalEntity) => e.temp_id === rel.target_ref
        );

        // Check if refs point to existing entities (UUIDs)
        const sourceIsExisting = state.existing_entities.some(
          (e) => e.id === rel.source_ref
        );
        const targetIsExisting = state.existing_entities.some(
          (e) => e.id === rel.target_ref
        );

        // Only include ID for existing entities (already in DB with real UUIDs)
        // For NEW entities, only use name - the worker will resolve via batchEntityMap
        // NOTE: resolved_uuid_map contains pre-generated UUIDs that won't match
        // the actual UUIDs generated by createObject, so we don't use them
        return {
          source: {
            name: sourceEntity?.name,
            id: sourceIsExisting ? rel.source_ref : undefined,
          },
          target: {
            name: targetEntity?.name,
            id: targetIsExisting ? rel.target_ref : undefined,
          },
          relationship_type: rel.type,
          description: rel.description,
          // Verification fields from relationship-verification node
          confidence: rel.confidence,
          verification_status: rel.verification_status,
        };
      });

    return {
      entities,
      relationships,
      discovered_types: state.discovered_types,
      usage: {
        prompt_tokens: state.total_prompt_tokens,
        completion_tokens: state.total_completion_tokens,
        total_tokens: state.total_prompt_tokens + state.total_completion_tokens,
      },
      raw_response: {
        pipeline: 'langgraph',
        retry_count: state.retry_count,
        node_responses: state.node_responses,
        feedback_log: state.feedback_log,
        total_duration_ms: Date.now() - startTime,
        // Include verification summary
        verification_summary: state.verification_summary,
      },
    };
  }
}

/**
 * Factory function to create a simple graph for testing
 */
export function createTestLangGraphProvider(
  config: AppConfigService,
  langfuseService: LangfuseService,
  geminiService: NativeGeminiService,
  promptProvider?: ExtractionPromptProvider | null,
  verificationService?: VerificationService
): LangGraphExtractionProvider {
  if (!verificationService) {
    throw new Error(
      'VerificationService is required for LangGraphExtractionProvider'
    );
  }
  return new LangGraphExtractionProvider(
    config,
    langfuseService,
    geminiService,
    promptProvider ?? null,
    verificationService
  );
}
