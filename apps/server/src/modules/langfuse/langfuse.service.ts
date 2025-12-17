import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import {
  Langfuse,
  LangfuseSpanClient,
  LangfuseGenerationClient,
} from 'langfuse-node';
import { AppConfigService } from '../../common/config/config.service';
import {
  PromptFetchOptions,
  PromptMetadata,
  LangfusePromptClient,
  LangfuseChatMessage,
} from './prompts/types';

/**
 * Extract the last segment of a UUID for shorter display names.
 * e.g., "9aaeeea9-094b-4e6a-aebb-def588b8be1a" -> "def588b8be1a"
 */
function getShortId(fullId: string): string {
  const parts = fullId.split('-');
  return parts.length > 0 ? parts[parts.length - 1] : fullId;
}

@Injectable()
export class LangfuseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangfuseService.name);
  private langfuse: Langfuse | null = null;
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  onModuleInit() {
    if (this.config.langfuseEnabled) {
      this.initializeLangfuse();
    } else {
      this.logger.log('LangFuse observability is disabled');
    }
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  private initializeLangfuse() {
    const publicKey = this.config.langfusePublicKey;
    const secretKey = this.config.langfuseSecretKey;
    const baseUrl = this.config.langfuseHost;

    if (!publicKey || !secretKey || !baseUrl) {
      this.logger.warn(
        'LangFuse enabled but missing configuration (public key, secret key, or host). Tracing will not work.'
      );
      return;
    }

    try {
      this.langfuse = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        flushAt: this.config.langfuseFlushAt,
        flushInterval: this.config.langfuseFlushInterval,
      });
      this.logger.log(`LangFuse initialized at ${baseUrl}`);
    } catch (error) {
      this.logger.error('Failed to initialize LangFuse', error);
      this.langfuse = null;
    }
  }

  isEnabled(): boolean {
    return this.langfuse !== null;
  }

  /**
   * Create a trace for a background job (e.g. extraction job)
   * @param jobId - Unique job identifier (used as trace ID)
   * @param metadata - Optional metadata to attach to the trace
   * @param environment - Optional environment label (e.g., 'test', 'production'). Defaults to NODE_ENV or 'default'.
   * @param traceType - Optional trace type for filtering (e.g., 'extraction', 'embedding', 'merge-suggestion')
   */
  createJobTrace(
    jobId: string,
    metadata?: Record<string, any>,
    environment?: string,
    traceType?: string
  ): string | null {
    if (!this.langfuse) return null;

    const envLabel = environment ?? process.env.NODE_ENV ?? 'default';
    const shortId = getShortId(jobId);

    // Build trace name: use short ID for readability if name contains full jobId
    let traceName = metadata?.name || `Job ${shortId}`;
    if (metadata?.name && metadata.name.includes(jobId)) {
      // Replace full ID with short ID in the name
      traceName = metadata.name.replace(jobId, shortId);
    }

    // Merge full jobId into metadata for reference
    const enrichedMetadata = {
      ...metadata,
      jobId, // Always include full job ID in metadata
      ...(traceType && { traceType }), // Include traceType in metadata for querying
    };

    // Build tags array: always include 'background-job', add traceType if provided
    const tags = ['background-job'];
    if (traceType) {
      tags.push(traceType);
    }

    try {
      const trace = this.langfuse.trace({
        id: jobId, // Use job ID as trace ID for easy correlation
        name: traceName,
        metadata: enrichedMetadata,
        tags,
        timestamp: new Date(),
        environment: envLabel,
      });
      return trace.id;
    } catch (error) {
      this.logger.error(`Failed to create job trace for ${jobId}`, error);
      return null;
    }
  }

  /**
   * Create a generation observation (LLM call).
   * Uses the standard Langfuse generation method.
   *
   * @param traceId - The trace ID to attach this generation to
   * @param name - Name of the generation (e.g., 'extract_entities')
   * @param input - Input prompt/data
   * @param metadata - Optional metadata
   * @param parentObservationId - Optional parent observation ID for nesting
   * @param prompt - Optional LangfusePromptClient for linking to Langfuse prompts
   */
  createObservation(
    traceId: string,
    name: string,
    input: any,
    metadata?: Record<string, any>,
    parentObservationId?: string,
    prompt?: LangfusePromptClient
  ): LangfuseGenerationClient | null {
    if (!this.langfuse) {
      this.logger.debug(
        `[createObservation] Langfuse not initialized, skipping observation for ${name}`
      );
      return null;
    }

    try {
      const parentInfo = parentObservationId
        ? ` (parent: ${parentObservationId})`
        : '';
      const promptInfoStr = prompt
        ? ` (prompt: ${prompt.name} v${prompt.version})`
        : '';
      this.logger.log(
        `[createObservation] Creating generation "${name}" for trace ${traceId}${parentInfo}${promptInfoStr}`
      );

      const generation = this.langfuse.generation({
        traceId,
        name,
        input,
        metadata,
        startTime: new Date(),
        parentObservationId: parentObservationId ?? undefined,
        // Cast to any to work around type mismatch between our LangfusePromptClient
        // interface and the SDK's internal type (TextPromptClient | ChatPromptClient)
        prompt: prompt as any,
      });

      this.logger.log(
        `[createObservation] Created generation with id: ${generation.id}`
      );
      return generation;
    } catch (error) {
      this.logger.error(
        `Failed to create observation for trace ${traceId}`,
        error
      );
      return null;
    }
  }

  /**
   * Create a span for grouping related observations (e.g., a pipeline step).
   * Spans can contain nested generations or other spans.
   *
   * @param traceId - The trace ID to attach this span to
   * @param name - Name of the span (e.g., 'llm_extract', 'load_document')
   * @param input - Input data for the span
   * @param metadata - Optional metadata
   */
  createSpan(
    traceId: string,
    name: string,
    input: any,
    metadata?: Record<string, any>
  ): LangfuseSpanClient | null {
    if (!this.langfuse) {
      this.logger.debug(
        `[createSpan] Langfuse not initialized, skipping span for ${name}`
      );
      return null;
    }

    try {
      this.logger.log(
        `[createSpan] Creating span "${name}" for trace ${traceId}`
      );
      const span = this.langfuse.span({
        traceId,
        name,
        input,
        metadata,
        startTime: new Date(),
      });
      this.logger.log(`[createSpan] Created span with id: ${span.id}`);
      return span;
    } catch (error) {
      this.logger.error(
        `Failed to create span "${name}" for trace ${traceId}`,
        error
      );
      return null;
    }
  }

  /**
   * Create an embedding generation observation with usage tracking.
   * This uses the 'generation' observation type which supports token/cost tracking.
   *
   * Note: While Langfuse has a newer 'embedding' observation type, the Node.js SDK v3
   * doesn't support it yet. Using 'generation' with proper usage fields achieves
   * the same token/cost tracking functionality.
   *
   * @param traceId - The trace ID to attach this observation to
   * @param name - Name of the embedding operation
   * @param input - Input text being embedded
   * @param model - The embedding model name (e.g., 'text-embedding-004')
   * @param metadata - Optional metadata
   * @param parentObservationId - Optional parent observation ID for nesting
   */
  createEmbeddingGeneration(
    traceId: string,
    name: string,
    input: any,
    model?: string,
    metadata?: Record<string, any>,
    parentObservationId?: string
  ): LangfuseGenerationClient | null {
    if (!this.langfuse) {
      this.logger.debug(
        `[createEmbeddingGeneration] Langfuse not initialized, skipping for ${name}`
      );
      return null;
    }

    try {
      const parentInfo = parentObservationId
        ? ` (parent: ${parentObservationId})`
        : '';
      this.logger.log(
        `[createEmbeddingGeneration] Creating embedding generation "${name}" for trace ${traceId}${parentInfo}`
      );

      const generation = this.langfuse.generation({
        traceId,
        name,
        input,
        model,
        metadata: {
          ...metadata,
          observation_type: 'embedding', // Mark as embedding for semantic clarity
        },
        startTime: new Date(),
        parentObservationId: parentObservationId ?? undefined,
      });

      this.logger.log(
        `[createEmbeddingGeneration] Created generation with id: ${generation.id}`
      );
      return generation;
    } catch (error) {
      this.logger.error(
        `Failed to create embedding generation for trace ${traceId}`,
        error
      );
      return null;
    }
  }

  /**
   * Update an embedding generation with output and usage data.
   *
   * @param generation - The generation client to update
   * @param output - Output from the embedding (e.g., embedding dimensions)
   * @param usage - Token usage details (uses usageDetails format for flexibility)
   * @param model - The model used (if not set during creation)
   * @param status - Status of the generation
   * @param statusMessage - Optional status message
   */
  updateEmbeddingGeneration(
    generation: LangfuseGenerationClient | null,
    output: any,
    usage?: {
      input?: number; // Input tokens (prompt tokens)
      total?: number; // Total tokens
    },
    model?: string,
    status: 'success' | 'error' = 'success',
    statusMessage?: string
  ): void {
    if (!generation || !this.langfuse) {
      this.logger.debug(
        `[updateEmbeddingGeneration] No generation or Langfuse not initialized, skipping update`
      );
      return;
    }

    try {
      this.logger.log(
        `[updateEmbeddingGeneration] Updating generation ${
          generation.id
        } with status: ${status}, usage: ${JSON.stringify(usage)}`
      );

      // Use usageDetails format for newer Langfuse versions
      // Keys: 'input' for input tokens, 'total' for total tokens
      // Build object with only defined values to satisfy type requirements
      let usageDetails: { [key: string]: number } | undefined;
      if (usage) {
        usageDetails = {};
        if (usage.input !== undefined) {
          usageDetails.input = usage.input;
        }
        if (usage.total !== undefined) {
          usageDetails.total = usage.total;
        } else if (usage.input !== undefined) {
          // Default total to input if not specified (embeddings typically only have input tokens)
          usageDetails.total = usage.input;
        }
      }

      generation.update({
        output,
        usageDetails,
        model,
        endTime: new Date(),
        level: status === 'error' ? 'ERROR' : undefined,
        statusMessage,
      });

      this.logger.log(
        `[updateEmbeddingGeneration] Successfully updated generation ${generation.id}`
      );
    } catch (error) {
      this.logger.error('Failed to update embedding generation', error);
    }
  }

  /**
   * End a span with optional output data.
   *
   * @param span - The span client to end
   * @param output - Optional output data
   * @param status - Status of the span ('success' or 'error')
   * @param statusMessage - Optional status message (useful for errors)
   */
  endSpan(
    span: LangfuseSpanClient | null,
    output?: any,
    status: 'success' | 'error' = 'success',
    statusMessage?: string
  ): void {
    if (!span || !this.langfuse) {
      return;
    }

    try {
      this.logger.debug(`[endSpan] Ending span ${span.id}`);
      span.update({
        output,
        endTime: new Date(),
        level: status === 'error' ? 'ERROR' : undefined,
        statusMessage,
      });
    } catch (error) {
      this.logger.error(`Failed to end span ${span.id}`, error);
    }
  }

  /**
   * Update a generation (LLM call observation) with output and usage.
   *
   * @param observation - The generation client to update
   * @param output - Output from the LLM
   * @param usage - Token usage details
   * @param model - The model used
   * @param status - Status of the generation
   * @param statusMessage - Optional status message
   */
  updateObservation(
    observation: LangfuseGenerationClient | null,
    output: any,
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    },
    model?: string,
    status: 'success' | 'error' = 'success',
    statusMessage?: string
  ): void {
    if (!observation || !this.langfuse) {
      this.logger.debug(
        `[updateObservation] No observation or Langfuse not initialized, skipping update`
      );
      return;
    }

    try {
      this.logger.log(
        `[updateObservation] Updating generation ${observation.id} with status: ${status}`
      );
      observation.update({
        output,
        usage: usage
          ? {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            }
          : undefined,
        model,
        endTime: new Date(),
        level: status === 'error' ? 'ERROR' : undefined,
        statusMessage,
      });
      this.logger.log(
        `[updateObservation] Successfully updated generation ${observation.id}`
      );
    } catch (error) {
      this.logger.error('Failed to update generation', error);
    }
  }

  /**
   * Finalize a trace (mark as completed)
   * Note: In LangFuse, traces don't explicitly need "closing" but we can update status/output
   */
  async finalizeTrace(
    traceId: string,
    status: 'success' | 'error',
    output?: any
  ) {
    if (!this.langfuse) return;

    try {
      this.logger.log(
        `[finalizeTrace] Finalizing trace ${traceId} with status: ${status}`
      );
      // We can update the trace using its ID
      this.langfuse.trace({
        id: traceId,
        output,
        tags: [status],
      });
      // Flush to ensure all observations are sent
      await this.flush();
    } catch (error) {
      this.logger.error(`Failed to finalize trace ${traceId}`, error);
    }
  }

  /**
   * Flush pending events to Langfuse
   */
  async flush(): Promise<void> {
    if (!this.langfuse) return;

    try {
      this.logger.debug('[flush] Flushing pending Langfuse events...');
      await this.langfuse.flushAsync();
      this.logger.debug('[flush] Successfully flushed Langfuse events');
    } catch (error) {
      this.logger.error('Failed to flush Langfuse events', error);
    }
  }

  async shutdown() {
    if (this.langfuse) {
      try {
        await this.langfuse.shutdownAsync();
        this.logger.log('LangFuse SDK shut down successfully');
      } catch (error) {
        this.logger.error('Error shutting down LangFuse SDK', error);
      }
    }
  }

  /**
   * Expose the raw client for advanced usage if needed
   */
  getClient(): Langfuse | null {
    return this.langfuse;
  }

  // ============================================================================
  // PROMPT MANAGEMENT METHODS
  // ============================================================================

  /**
   * Fetch a text prompt from Langfuse by name.
   *
   * @param name - The prompt name as configured in Langfuse
   * @param options - Optional fetch options (version, label, cache TTL)
   * @returns The prompt client or null if not found/disabled
   */
  async getTextPrompt(
    name: string,
    options?: PromptFetchOptions
  ): Promise<LangfusePromptClient | null> {
    if (!this.langfuse) {
      this.logger.debug(
        `[getTextPrompt] Langfuse not initialized, cannot fetch prompt "${name}"`
      );
      return null;
    }

    try {
      const cacheTtl =
        options?.cacheTtlSeconds ?? this.config.langfusePromptCacheTtl;
      const label = options?.label ?? this.config.langfusePromptLabel;

      this.logger.debug(
        `[getTextPrompt] Fetching prompt "${name}" (label: ${label}, cacheTtl: ${cacheTtl}s)`
      );

      const prompt = await this.langfuse.getPrompt(name, options?.version, {
        label,
        cacheTtlSeconds: cacheTtl,
        type: 'text',
      });

      this.logger.debug(
        `[getTextPrompt] Fetched prompt "${name}" v${prompt.version} (fallback: ${prompt.isFallback})`
      );

      return prompt as LangfusePromptClient;
    } catch (error) {
      this.logger.error(`Failed to fetch text prompt "${name}"`, error);
      if (options?.throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Fetch a chat prompt from Langfuse by name.
   *
   * @param name - The prompt name as configured in Langfuse
   * @param options - Optional fetch options (version, label, cache TTL)
   * @returns The prompt client or null if not found/disabled
   */
  async getChatPrompt(
    name: string,
    options?: PromptFetchOptions
  ): Promise<LangfusePromptClient | null> {
    if (!this.langfuse) {
      this.logger.debug(
        `[getChatPrompt] Langfuse not initialized, cannot fetch prompt "${name}"`
      );
      return null;
    }

    try {
      const cacheTtl =
        options?.cacheTtlSeconds ?? this.config.langfusePromptCacheTtl;
      const label = options?.label ?? this.config.langfusePromptLabel;

      this.logger.debug(
        `[getChatPrompt] Fetching chat prompt "${name}" (label: ${label}, cacheTtl: ${cacheTtl}s)`
      );

      const prompt = await this.langfuse.getPrompt(name, options?.version, {
        label,
        cacheTtlSeconds: cacheTtl,
        type: 'chat',
      });

      this.logger.debug(
        `[getChatPrompt] Fetched chat prompt "${name}" v${prompt.version} (fallback: ${prompt.isFallback})`
      );

      return prompt as LangfusePromptClient;
    } catch (error) {
      this.logger.error(`Failed to fetch chat prompt "${name}"`, error);
      if (options?.throwOnError) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Compile a prompt with variables.
   * This is a convenience wrapper that handles the type coercion.
   *
   * @param prompt - The prompt client from getTextPrompt/getChatPrompt
   * @param variables - Variables to interpolate into the prompt template
   * @returns The compiled prompt string or chat messages
   */
  compilePrompt(
    prompt: LangfusePromptClient,
    variables: Record<string, string>
  ): string | LangfuseChatMessage[] {
    this.logger.debug(
      `[compilePrompt] Compiling prompt "${prompt.name}" v${
        prompt.version
      } with variables: ${Object.keys(variables).join(', ')}`
    );
    this.logger.debug(
      `[compilePrompt] Variable lengths: ${Object.entries(variables)
        .map(
          ([k, v]) => `${k}=${typeof v === 'string' ? v.length : 'non-string'}`
        )
        .join(', ')}`
    );
    const compiled = prompt.compile(variables);
    const resultLength =
      typeof compiled === 'string'
        ? compiled.length
        : JSON.stringify(compiled).length;
    this.logger.debug(
      `[compilePrompt] Compiled result type: ${typeof compiled}, length: ${resultLength}`
    );
    if (resultLength === 0) {
      this.logger.warn(
        `[compilePrompt] WARNING: Compiled prompt is empty! Prompt template length: ${
          (prompt as any).prompt?.length || 'unknown'
        }`
      );
    }
    return compiled as string | LangfuseChatMessage[];
  }

  /**
   * Get metadata about a fetched prompt.
   *
   * @param prompt - The prompt client
   * @returns Metadata about the prompt
   */
  getPromptMetadata(prompt: LangfusePromptClient): PromptMetadata {
    return {
      name: prompt.name,
      version: prompt.version,
      labels: prompt.labels,
      fromCache: false, // SDK doesn't expose this, but it's managed internally
      type: prompt.type,
    };
  }

  /**
   * Create or update a text prompt in Langfuse.
   * If a prompt with the same name exists, this creates a new version.
   *
   * @param name - The prompt name
   * @param prompt - The prompt text content
   * @param options - Optional settings (labels, tags, config, commitMessage)
   * @returns The created prompt metadata or null if failed
   */
  async createOrUpdateTextPrompt(
    name: string,
    prompt: string,
    options?: {
      labels?: string[];
      tags?: string[];
      config?: Record<string, unknown>;
      commitMessage?: string;
    }
  ): Promise<{ name: string; version: number; labels: string[] } | null> {
    if (!this.langfuse) {
      this.logger.debug(
        `[createOrUpdateTextPrompt] Langfuse not initialized, cannot create/update prompt "${name}"`
      );
      return null;
    }

    try {
      this.logger.debug(
        `[createOrUpdateTextPrompt] Creating/updating prompt "${name}"`
      );
      const result = await this.langfuse.createPrompt({
        name,
        type: 'text',
        prompt,
        labels: options?.labels ?? ['production'],
        tags: options?.tags,
        config: options?.config,
        commitMessage: options?.commitMessage,
      });
      this.logger.log(
        `[createOrUpdateTextPrompt] Created/updated prompt "${name}" version ${result.version}`
      );
      return {
        name: result.name,
        version: result.version,
        labels: result.labels,
      };
    } catch (error) {
      this.logger.error(`Failed to create/update text prompt "${name}"`, error);
      return null;
    }
  }

  /**
   * Check if prompt management is available.
   * This is true when Langfuse is enabled and configured.
   */
  isPromptManagementAvailable(): boolean {
    return this.langfuse !== null;
  }

  // ============================================================================
  // DATASET AND EVALUATION METHODS
  // ============================================================================

  /**
   * Get a dataset by name from LangFuse.
   *
   * @param name - The dataset name
   * @returns The dataset or null if not found/disabled
   */
  async getDataset(name: string): Promise<{
    name: string;
    items: Array<{
      id: string;
      input?: unknown;
      expectedOutput?: unknown;
      metadata?: Record<string, unknown>;
      link: (
        trace: { id: string } | string,
        runName: string,
        options?: { description?: string; metadata?: Record<string, unknown> }
      ) => Promise<void>;
    }>;
  } | null> {
    if (!this.langfuse) {
      this.logger.debug(
        `[getDataset] Langfuse not initialized, cannot fetch dataset "${name}"`
      );
      return null;
    }

    try {
      this.logger.debug(`[getDataset] Fetching dataset "${name}"`);
      const dataset = await this.langfuse.getDataset(name);
      this.logger.debug(
        `[getDataset] Fetched dataset "${name}" with ${dataset.items.length} items`
      );
      // Cast to our expected interface (SDK types may vary)
      return dataset as unknown as {
        name: string;
        items: Array<{
          id: string;
          input?: unknown;
          expectedOutput?: unknown;
          metadata?: Record<string, unknown>;
          link: (
            trace: { id: string } | string,
            runName: string,
            options?: {
              description?: string;
              metadata?: Record<string, unknown>;
            }
          ) => Promise<void>;
        }>;
      };
    } catch (error) {
      this.logger.error(`Failed to fetch dataset "${name}"`, error);
      return null;
    }
  }

  /**
   * Create a dataset in LangFuse.
   *
   * @param name - The dataset name
   * @param description - Optional description
   * @param metadata - Optional metadata
   */
  async createDataset(
    name: string,
    description?: string,
    metadata?: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.langfuse) {
      this.logger.debug(
        `[createDataset] Langfuse not initialized, cannot create dataset "${name}"`
      );
      return false;
    }

    try {
      this.logger.debug(`[createDataset] Creating dataset "${name}"`);
      await this.langfuse.createDataset({
        name,
        description,
        metadata,
      });
      this.logger.log(`[createDataset] Created dataset "${name}"`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to create dataset "${name}"`, error);
      return false;
    }
  }

  /**
   * Create a dataset item in LangFuse.
   *
   * @param datasetName - The dataset name to add the item to
   * @param input - The input data
   * @param expectedOutput - The expected output for evaluation
   * @param metadata - Optional metadata
   * @param id - Optional custom ID (for upserting)
   */
  async createDatasetItem(
    datasetName: string,
    input: unknown,
    expectedOutput?: unknown,
    metadata?: Record<string, unknown>,
    id?: string
  ): Promise<string | null> {
    if (!this.langfuse) {
      this.logger.debug(
        `[createDatasetItem] Langfuse not initialized, cannot create item in "${datasetName}"`
      );
      return null;
    }

    try {
      this.logger.debug(
        `[createDatasetItem] Creating item in dataset "${datasetName}"`
      );
      const item = await this.langfuse.createDatasetItem({
        datasetName,
        input,
        expectedOutput,
        metadata,
        id,
      });
      this.logger.log(
        `[createDatasetItem] Created item ${item.id} in dataset "${datasetName}"`
      );
      return item.id;
    } catch (error) {
      this.logger.error(
        `Failed to create dataset item in "${datasetName}"`,
        error
      );
      return null;
    }
  }

  /**
   * Score a trace with evaluation metrics.
   *
   * @param traceId - The trace ID to score
   * @param name - Score name (e.g., 'entity_precision', 'relationship_f1')
   * @param value - Score value (0.0 to 1.0 for numeric)
   * @param comment - Optional comment explaining the score
   * @param dataType - Data type ('NUMERIC' or 'BOOLEAN')
   */
  scoreTrace(
    traceId: string,
    name: string,
    value: number,
    comment?: string,
    dataType: 'NUMERIC' | 'BOOLEAN' = 'NUMERIC'
  ): void {
    if (!this.langfuse) {
      this.logger.debug(
        `[scoreTrace] Langfuse not initialized, cannot score trace "${traceId}"`
      );
      return;
    }

    try {
      this.logger.debug(
        `[scoreTrace] Scoring trace "${traceId}" with ${name}=${value}`
      );
      this.langfuse.score({
        traceId,
        name,
        value,
        comment,
        dataType,
      });
      this.logger.log(
        `[scoreTrace] Scored trace "${traceId}" with ${name}=${value}`
      );
    } catch (error) {
      this.logger.error(`Failed to score trace "${traceId}"`, error);
    }
  }

  /**
   * Score a trace with multiple metrics at once.
   *
   * @param traceId - The trace ID to score
   * @param scores - Array of scores to apply
   */
  scoreTraceMultiple(
    traceId: string,
    scores: Array<{
      name: string;
      value: number;
      comment?: string;
      dataType?: 'NUMERIC' | 'BOOLEAN';
    }>
  ): void {
    if (!this.langfuse) {
      this.logger.debug(
        `[scoreTraceMultiple] Langfuse not initialized, cannot score trace "${traceId}"`
      );
      return;
    }

    for (const score of scores) {
      this.scoreTrace(
        traceId,
        score.name,
        score.value,
        score.comment,
        score.dataType ?? 'NUMERIC'
      );
    }
  }

  /**
   * Create a trace specifically for an experiment run.
   * This trace can be linked to a dataset item.
   *
   * @param name - The trace name
   * @param input - Input data
   * @param metadata - Optional metadata including experiment info
   * @param tags - Optional tags for filtering
   * @param environment - Optional environment label (e.g., 'test', 'production')
   */
  createExperimentTrace(
    name: string,
    input: unknown,
    metadata?: Record<string, unknown>,
    tags?: string[],
    environment?: string
  ): { id: string; traceId: string } | null {
    if (!this.langfuse) {
      this.logger.debug(
        `[createExperimentTrace] Langfuse not initialized, cannot create trace "${name}"`
      );
      return null;
    }

    try {
      const envLabel = environment ?? 'default';
      this.logger.debug(
        `[createExperimentTrace] Creating trace "${name}" (environment: ${envLabel})`
      );
      const trace = this.langfuse.trace({
        name,
        input,
        metadata,
        tags: tags ?? ['experiment'],
        timestamp: new Date(),
        environment: envLabel,
      });
      this.logger.log(
        `[createExperimentTrace] Created trace "${name}" with id ${trace.id} (environment: ${envLabel})`
      );
      return { id: trace.id, traceId: trace.id };
    } catch (error) {
      this.logger.error(`Failed to create experiment trace "${name}"`, error);
      return null;
    }
  }

  /**
   * Update a trace with output data (for experiment completion).
   *
   * @param traceId - The trace ID to update
   * @param output - Output data
   * @param metadata - Additional metadata to merge
   */
  updateTrace(
    traceId: string,
    output: unknown,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.langfuse) {
      this.logger.debug(
        `[updateTrace] Langfuse not initialized, cannot update trace "${traceId}"`
      );
      return;
    }

    try {
      this.logger.debug(`[updateTrace] Updating trace "${traceId}"`);
      this.langfuse.trace({
        id: traceId,
        output,
        metadata,
      });
      this.logger.log(`[updateTrace] Updated trace "${traceId}"`);
    } catch (error) {
      this.logger.error(`Failed to update trace "${traceId}"`, error);
    }
  }

  /**
   * Check if dataset/evaluation features are available.
   */
  isEvaluationAvailable(): boolean {
    return this.langfuse !== null;
  }
}
