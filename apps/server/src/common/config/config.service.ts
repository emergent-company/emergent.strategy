import { Inject, Injectable } from '@nestjs/common';
import { EnvVariables } from './config.schema';

/**
 * Configuration service that provides access to environment variables and database settings.
 *
 * For extraction base prompt:
 * 1. First checks database setting: kb.settings WHERE key = 'extraction.basePrompt'
 * 2. Then checks environment variable: EXTRACTION_BASE_PROMPT
 * 3. Finally falls back to default prompt
 *
 * Note: Database settings are loaded asynchronously at runtime by the extraction worker.
 */
@Injectable()
export class AppConfigService {
  constructor(@Inject(EnvVariables) private readonly env: EnvVariables) {
    if (process.env.E2E_DEBUG_CHAT === '1') {
      // eslint-disable-next-line no-console
      console.log(
        'Config initialized:',
        'PORT=',
        this.env.PORT,
        'POSTGRES_HOST=',
        this.env.POSTGRES_HOST,
        'EMBEDDING_PROVIDER=',
        process.env.EMBEDDING_PROVIDER || 'unset',
        'GCP_PROJECT_ID=',
        this.env.GCP_PROJECT_ID || 'unset',
        'computed chatModelEnabled=',
        !!this.env.GCP_PROJECT_ID &&
          (process.env.CHAT_MODEL_ENABLED === 'true' ||
            process.env.CHAT_MODEL_ENABLED === '1')
      );
    }
  }
  /**
   * Only treat SKIP_DB as enabled when explicitly set to 'true' or '1'. This
   * prevents accidental activation when the variable is defined but blank or
   * set to another placeholder value by tooling.
   */
  get skipDb(): boolean {
    const v = (this.env.SKIP_DB || '').trim().toLowerCase();
    return v === 'true' || v === '1';
  }

  get port() {
    return this.env.PORT;
  }
  get dbHost() {
    return this.env.POSTGRES_HOST;
  }
  get dbPort() {
    return this.env.POSTGRES_PORT;
  }
  get dbUser() {
    return this.env.POSTGRES_USER;
  }
  get dbPassword() {
    return this.env.POSTGRES_PASSWORD;
  }
  get dbName() {
    return this.env.POSTGRES_DB;
  }

  /**
   * Embeddings are enabled if EMBEDDING_PROVIDER is set to 'vertex' or 'google'
   * No API key needed - Vertex AI uses Application Default Credentials
   */
  get embeddingsEnabled() {
    const provider = process.env.EMBEDDING_PROVIDER?.toLowerCase();
    return provider === 'vertex' || provider === 'google';
  }

  get embeddingsNetworkDisabled(): boolean {
    return Boolean(process.env.EMBEDDINGS_NETWORK_DISABLED);
  }

  get embeddingDimension(): number {
    const dim = parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10);
    if (isNaN(dim) || dim <= 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[config] Invalid EMBEDDING_DIMENSION: ${process.env.EMBEDDING_DIMENSION}, using default 1536`
      );
      return 1536;
    }
    // Support common dimensions: 32 (legacy stub), 128, 384, 768, 1536, 3072
    const validDimensions = [32, 128, 384, 768, 1536, 3072];
    if (!validDimensions.includes(dim)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[config] Non-standard EMBEDDING_DIMENSION: ${dim}. Supported: ${validDimensions.join(
          ', '
        )}`
      );
    }
    return dim;
  }

  /**
   * Chat model is enabled if CHAT_MODEL_ENABLED is true AND we have Vertex AI configured
   */
  get chatModelEnabled() {
    return !!this.env.GCP_PROJECT_ID && !!this.env.CHAT_MODEL_ENABLED;
  }

  /**
   * Custom system prompt for chat. If not set, the generation service will use its default.
   * Supports template variables:
   * - {detectedIntent} - The detected query intent (schema-version, entity-query, etc.)
   */
  get chatSystemPrompt(): string | undefined {
    return this.env.CHAT_SYSTEM_PROMPT;
  }

  /**
   * Whether automatic title generation is enabled for new conversations
   */
  get chatTitleGenerationEnabled(): boolean {
    return this.env.CHAT_TITLE_GENERATION_ENABLED !== false;
  }

  /**
   * Maximum length for generated conversation titles
   */
  get chatTitleMaxLength(): number {
    return this.env.CHAT_TITLE_MAX_LENGTH ?? 60;
  }

  /**
   * Minimum messages before generating title
   */
  get chatTitleMinMessages(): number {
    return this.env.CHAT_TITLE_MIN_MESSAGES ?? 2;
  }

  get autoInitDb() {
    return !!this.env.DB_AUTOINIT;
  }
  /** Password used when creating / connecting as dedicated non-bypass RLS role (app_rls). Optional so tests can rely on default. */
  get appRlsPassword() {
    return this.env.APP_RLS_PASSWORD || 'app_rls_pw';
  }
  get rlsPolicyStrict() {
    return !!this.env.RLS_POLICY_STRICT;
  }

  // --- Extraction Worker (Vertex AI) ---
  get vertexAiProjectId() {
    return this.env.GCP_PROJECT_ID;
  }
  get vertexAiLocation() {
    return this.env.VERTEX_AI_LOCATION;
  }
  get vertexAiModel() {
    return this.env.VERTEX_AI_MODEL;
  }

  // --- Extraction Worker Behavior ---
  get extractionWorkerEnabled() {
    // Enable if Vertex AI is configured
    return !!this.env.GCP_PROJECT_ID && !!this.env.EXTRACTION_WORKER_ENABLED;
  }
  get extractionWorkerPollIntervalMs() {
    return this.env.EXTRACTION_WORKER_POLL_INTERVAL_MS || 5000;
  }
  get extractionWorkerBatchSize() {
    return this.env.EXTRACTION_WORKER_BATCH_SIZE || 5;
  }
  get extractionRateLimitRpm() {
    return this.env.EXTRACTION_RATE_LIMIT_RPM || 60;
  }
  get extractionRateLimitTpm() {
    return this.env.EXTRACTION_RATE_LIMIT_TPM || 30000;
  }
  get extractionEntityLinkingStrategy() {
    return this.env.EXTRACTION_ENTITY_LINKING_STRATEGY || 'always_new';
  }
  get extractionConfidenceThresholdMin() {
    return this.env.EXTRACTION_CONFIDENCE_THRESHOLD_MIN || 0.0;
  }
  get extractionConfidenceThresholdReview() {
    return this.env.EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW || 0.7;
  }
  get extractionConfidenceThresholdAuto() {
    return this.env.EXTRACTION_CONFIDENCE_THRESHOLD_AUTO || 0.85;
  }

  get extractionDefaultTemplatePackId(): string | null {
    const id = this.env.EXTRACTION_DEFAULT_TEMPLATE_PACK_ID;
    if (!id) {
      return null;
    }
    const trimmed = id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  get extractionChunkSize() {
    return this.env.EXTRACTION_CHUNK_SIZE || 100000;
  }

  get extractionChunkOverlap() {
    return this.env.EXTRACTION_CHUNK_OVERLAP || 2000;
  }

  get extractionBasePrompt(): string {
    return (
      this.env.EXTRACTION_BASE_PROMPT ||
      `You are an expert entity extraction system. Your task is to analyze the provided document and extract structured entities according to the schema definitions that follow.

Extract entities that match the defined types. For each entity:
- Provide a clear, descriptive name
- Include all relevant properties from the schema
- Assign appropriate confidence scores (0.0-1.0)
- Identify relationships between entities

Return your response as a valid JSON array matching the expected schema format.`
    );
  }

  // --- LangSmith Tracing (Optional) ---
  get langsmithTracingEnabled(): boolean {
    const v = (this.env.LANGSMITH_TRACING || '').trim().toLowerCase();
    return v === 'true' || v === '1';
  }

  get langsmithEndpoint(): string | undefined {
    return this.env.LANGSMITH_ENDPOINT;
  }

  get langsmithApiKey(): string | undefined {
    return this.env.LANGSMITH_API_KEY;
  }

  get langsmithProject(): string | undefined {
    return this.env.LANGSMITH_PROJECT;
  }

  // --- LangFuse Observability ---
  get langfuseEnabled(): boolean {
    return !!this.env.LANGFUSE_ENABLED;
  }

  get langfuseSecretKey(): string | undefined {
    return this.env.LANGFUSE_SECRET_KEY;
  }

  get langfusePublicKey(): string | undefined {
    return this.env.LANGFUSE_PUBLIC_KEY;
  }

  get langfuseHost(): string | undefined {
    return this.env.LANGFUSE_HOST;
  }

  get langfuseFlushAt(): number | undefined {
    return this.env.LANGFUSE_FLUSH_AT;
  }

  get langfuseFlushInterval(): number | undefined {
    return this.env.LANGFUSE_FLUSH_INTERVAL;
  }
}
