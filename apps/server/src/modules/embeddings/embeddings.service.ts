import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { LangfuseService } from '../langfuse/langfuse.service';

// Embedding vector dimension (Gemini text-embedding-004)
export const EMBEDDING_DIMENSION = 768;

/**
 * Result from embedding generation, includes usage data when available.
 */
export interface EmbeddingResultWithUsage {
  embedding: number[];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingBatchResultWithUsage {
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

type EmbeddingClient = {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
  // Extended methods that return usage data
  embedQueryWithUsage?(text: string): Promise<EmbeddingResultWithUsage>;
  embedDocumentsWithUsage?(
    texts: string[]
  ): Promise<EmbeddingBatchResultWithUsage>;
};

/**
 * Tracing context for embedding operations.
 * Similar to TracingContext used in LLM operations.
 */
export interface EmbeddingTracingContext {
  /** Parent trace ID (e.g., from extraction job) */
  traceId?: string;
  /** Parent observation/span ID for nesting */
  parentObservationId?: string;
  /** Custom name for the span */
  spanName?: string;
  /** Additional metadata to attach to the trace */
  metadata?: Record<string, any>;
}

@Injectable()
export class EmbeddingsService {
  private client: EmbeddingClient | null = null;
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly config: AppConfigService,
    @Optional() private readonly langfuseService?: LangfuseService
  ) {}

  isEnabled(): boolean {
    return this.config.embeddingsEnabled;
  }

  private async ensureClient(): Promise<EmbeddingClient> {
    if (!this.isEnabled()) {
      throw new Error(
        'Embeddings disabled (EMBEDDING_PROVIDER not configured)'
      );
    }

    if (!this.client) {
      // Try Vertex AI first (production), fallback to Generative AI (development)
      const useVertexAI =
        process.env.GCP_PROJECT_ID && process.env.VERTEX_AI_LOCATION;

      if (useVertexAI) {
        this.client = await this.createVertexAIClient();
        this.logger.log('Embeddings client initialized (Vertex AI)');
      } else {
        this.client = await this.createGenerativeAIClient();
        this.logger.log('Embeddings client initialized (Generative AI)');
      }
    }
    return this.client;
  }

  private async createVertexAIClient(): Promise<EmbeddingClient> {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION;
    const model = 'text-embedding-004';

    if (!projectId || !location) {
      throw new Error(
        'Vertex AI configuration missing: GCP_PROJECT_ID and VERTEX_AI_LOCATION required'
      );
    }

    // Import GoogleAuth for ADC authentication
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const embedQuery = async (text: string): Promise<number[]> => {
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();

      if (!accessToken.token) {
        throw new Error('Failed to get access token from ADC');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ content: text, task_type: 'RETRIEVAL_DOCUMENT' }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      const values =
        data.predictions?.[0]?.embeddings?.values ||
        data.predictions?.[0]?.values;

      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('No embedding values returned from Vertex AI');
      }

      return values as number[];
    };

    const embedDocuments = async (texts: string[]): Promise<number[][]> => {
      const result = await embedDocumentsWithUsage(texts);
      return result.embeddings;
    };

    const embedDocumentsWithUsage = async (
      texts: string[]
    ): Promise<EmbeddingBatchResultWithUsage> => {
      // Batch process all texts
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();

      if (!accessToken.token) {
        throw new Error('Failed to get access token from ADC');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: texts.map((text) => ({
            content: text,
            task_type: 'RETRIEVAL_DOCUMENT',
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.predictions)) {
        throw new Error('No predictions returned from Vertex AI');
      }

      const embeddings = data.predictions.map((prediction: any) => {
        const values = prediction.embeddings?.values || prediction.values || [];
        if (!Array.isArray(values) || values.length === 0) {
          throw new Error('Invalid embedding values in prediction');
        }
        return values as number[];
      });

      // Extract token usage from predictions
      // Vertex AI returns token_count in predictions[i].embeddings.statistics.token_count
      let totalTokens = 0;
      for (const prediction of data.predictions) {
        const tokenCount = prediction.embeddings?.statistics?.token_count;
        if (typeof tokenCount === 'number') {
          totalTokens += tokenCount;
        }
      }

      const usage: { promptTokens: number; totalTokens: number } | undefined =
        totalTokens > 0
          ? { promptTokens: totalTokens, totalTokens }
          : undefined;

      return { embeddings, usage };
    };

    return { embedQuery, embedDocuments, embedDocumentsWithUsage };
  }

  private async createGenerativeAIClient(): Promise<EmbeddingClient> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY not set - required for Generative AI embeddings. ' +
          'For production, configure Vertex AI with GCP_PROJECT_ID and VERTEX_AI_LOCATION instead.'
      );
    }

    // Lazy import to avoid require at startup when key missing
    const { GoogleGenerativeAIEmbeddings } = await import(
      '@langchain/google-genai'
    );
    return new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      model: 'text-embedding-004',
    }) as EmbeddingClient;
  }

  /**
   * Generate embedding for a single query text.
   *
   * @param text - The text to embed
   * @param tracing - Optional tracing context for Langfuse observability
   */
  async embedQuery(
    text: string,
    tracing?: EmbeddingTracingContext
  ): Promise<number[]> {
    const startTime = Date.now();
    const spanName = tracing?.spanName || 'embed_query';
    const inputChars = text.length;

    // Create Langfuse span if tracing is enabled
    const span =
      this.langfuseService && tracing?.traceId
        ? this.langfuseService.createSpan(
            tracing.traceId,
            spanName,
            {
              input_chars: inputChars,
              input_preview: text.slice(0, 200),
            },
            {
              ...tracing.metadata,
              model: 'text-embedding-004',
              operation: 'embed_query',
            }
          )
        : null;

    try {
      const client = await this.ensureClient();
      const result = await client.embedQuery(text);
      const durationMs = Date.now() - startTime;

      // End span with success
      if (span && this.langfuseService) {
        this.langfuseService.endSpan(
          span,
          {
            dimensions: result.length,
            duration_ms: durationMs,
          },
          'success'
        );
      }

      this.logger.debug(
        `[embedQuery] Generated ${result.length}-dim embedding in ${durationMs}ms (${inputChars} chars)`
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // End span with error
      if (span && this.langfuseService) {
        this.langfuseService.endSpan(
          span,
          { error: errorMessage, duration_ms: durationMs },
          'error',
          errorMessage
        );
      }

      this.logger.error(
        `[embedQuery] Failed after ${durationMs}ms: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple documents in batch.
   *
   * @param texts - Array of texts to embed
   * @param tracing - Optional tracing context for Langfuse observability
   */
  async embedDocuments(
    texts: string[],
    tracing?: EmbeddingTracingContext
  ): Promise<number[][]> {
    const startTime = Date.now();
    const spanName = tracing?.spanName || 'embed_documents';
    const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

    // Create Langfuse span if tracing is enabled
    const span =
      this.langfuseService && tracing?.traceId
        ? this.langfuseService.createSpan(
            tracing.traceId,
            spanName,
            {
              document_count: texts.length,
              total_chars: totalChars,
              avg_chars:
                texts.length > 0 ? Math.round(totalChars / texts.length) : 0,
            },
            {
              ...tracing.metadata,
              model: 'text-embedding-004',
              operation: 'embed_documents',
            }
          )
        : null;

    try {
      const client = await this.ensureClient();
      const result = await client.embedDocuments(texts);
      const durationMs = Date.now() - startTime;

      // End span with success
      if (span && this.langfuseService) {
        this.langfuseService.endSpan(
          span,
          {
            vectors_generated: result.length,
            dimensions: result[0]?.length || 0,
            duration_ms: durationMs,
            ms_per_document:
              texts.length > 0 ? Math.round(durationMs / texts.length) : 0,
          },
          'success'
        );
      }

      this.logger.debug(
        `[embedDocuments] Generated ${result.length} embeddings (${
          result[0]?.length || 0
        } dims) ` +
          `in ${durationMs}ms (${texts.length} docs, ${totalChars} chars)`
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // End span with error
      if (span && this.langfuseService) {
        this.langfuseService.endSpan(
          span,
          {
            error: errorMessage,
            duration_ms: durationMs,
            attempted_documents: texts.length,
          },
          'error',
          errorMessage
        );
      }

      this.logger.error(
        `[embedDocuments] Failed after ${durationMs}ms for ${texts.length} docs: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple documents in batch, returning usage data.
   * This is used by the chunk embedding worker for Langfuse token tracking.
   *
   * @param texts - Array of texts to embed
   * @returns Embeddings array and usage data (if available from provider)
   */
  async embedDocumentsWithUsage(
    texts: string[]
  ): Promise<EmbeddingBatchResultWithUsage> {
    const startTime = Date.now();

    try {
      const client = await this.ensureClient();

      // Use the extended method if available (Vertex AI), otherwise fall back
      if (client.embedDocumentsWithUsage) {
        const result = await client.embedDocumentsWithUsage(texts);
        const durationMs = Date.now() - startTime;

        this.logger.debug(
          `[embedDocumentsWithUsage] Generated ${
            result.embeddings.length
          } embeddings (${result.embeddings[0]?.length || 0} dims) ` +
            `in ${durationMs}ms (${texts.length} docs), tokens: ${
              result.usage?.promptTokens ?? 'N/A'
            }`
        );

        return result;
      } else {
        // Fallback for clients without usage support (e.g., Generative AI)
        const embeddings = await client.embedDocuments(texts);
        const durationMs = Date.now() - startTime;

        this.logger.debug(
          `[embedDocumentsWithUsage] Generated ${
            embeddings.length
          } embeddings (${
            embeddings[0]?.length || 0
          } dims) in ${durationMs}ms (${texts.length} docs), usage: N/A`
        );

        return { embeddings, usage: undefined };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[embedDocumentsWithUsage] Failed after ${durationMs}ms for ${texts.length} docs: ${errorMessage}`
      );
      throw error;
    }
  }

  /**
   * Create a new embedding job trace for standalone embedding operations.
   * Use this when generating embeddings outside of an extraction job context.
   *
   * @param jobId - Unique identifier for the embedding job
   * @param metadata - Additional metadata for the trace
   * @returns Trace ID or null if Langfuse is not enabled
   */
  createEmbeddingJobTrace(
    jobId: string,
    metadata?: Record<string, any>
  ): string | null {
    if (!this.langfuseService) {
      return null;
    }

    return this.langfuseService.createJobTrace(
      jobId,
      {
        name: `Embedding Job ${jobId}`,
        ...metadata,
      },
      undefined, // environment (use default)
      'embedding' // traceType for filtering
    );
  }

  /**
   * Finalize an embedding job trace.
   *
   * @param traceId - The trace ID to finalize
   * @param status - Success or error status
   * @param output - Output data to attach to the trace
   */
  async finalizeEmbeddingJobTrace(
    traceId: string,
    status: 'success' | 'error',
    output?: Record<string, any>
  ): Promise<void> {
    if (!this.langfuseService) {
      return;
    }

    await this.langfuseService.finalizeTrace(traceId, status, output);
  }
}
