import { Inject, Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { EnvVariables } from './config.schema';

/**
 * Attempt to read the GCP project ID from gcloud's default configuration.
 * This allows Vertex AI to work without explicitly setting GCP_PROJECT_ID
 * when the user has authenticated via `gcloud auth application-default login`.
 */
function getGcpProjectFromGcloudConfig(): string | undefined {
  try {
    const configPath = join(
      homedir(),
      '.config',
      'gcloud',
      'configurations',
      'config_default'
    );
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/^project\s*=\s*(.+)$/m);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

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
        'GCP_PROJECT_ID (env)=',
        this.env.GCP_PROJECT_ID || 'unset',
        'GCP_PROJECT_ID (resolved)=',
        this.gcpProjectId || 'unset',
        'chatModelEnabled=',
        this.chatModelEnabled
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
   * Chat model is enabled by default when we have a GCP project configured.
   * The project can come from GCP_PROJECT_ID env var or gcloud's default config.
   * Set CHAT_MODEL_ENABLED=false to explicitly disable.
   */
  get chatModelEnabled() {
    // Allow explicit disable
    if (process.env.CHAT_MODEL_ENABLED === 'false') {
      return false;
    }
    // Enable if we have a GCP project (from env or gcloud config)
    return !!this.gcpProjectId;
  }

  /**
   * Get the GCP project ID, first from env var, then from gcloud config.
   * This is cached after first access for performance.
   */
  private _gcpProjectId: string | undefined | null = null;
  get gcpProjectId(): string | undefined {
    if (this._gcpProjectId === null) {
      this._gcpProjectId =
        this.env.GCP_PROJECT_ID || getGcpProjectFromGcloudConfig();
    }
    return this._gcpProjectId || undefined;
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
    return this.gcpProjectId;
  }
  get vertexAiLocation() {
    return this.env.VERTEX_AI_LOCATION;
  }
  get vertexAiModel() {
    return this.env.VERTEX_AI_MODEL;
  }

  // --- Google AI Studio (API Key auth) ---
  get googleApiKey(): string | undefined {
    return this.env.GOOGLE_API_KEY;
  }
  get googleAiModel(): string {
    return this.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash';
  }
  get googleAiStudioEnabled(): boolean {
    return !!this.env.GOOGLE_API_KEY;
  }

  get extractionMethod(): 'responseSchema' | 'function_calling' {
    const method = this.env.EXTRACTION_METHOD;
    if (method === 'responseSchema') {
      return 'responseSchema';
    }
    // Default to function_calling - better performance with Vertex AI based on testing
    // See docs/testing/LLM_PROVIDER_COMPARISON.md for benchmarks
    return 'function_calling';
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
    return this.env.EXTRACTION_CONFIDENCE_THRESHOLD_AUTO || 0.9;
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
    // Default 30K chars - based on performance testing showing high variability at larger sizes
    // See docs/testing/LLM_PROVIDER_COMPARISON.md for benchmarks
    return this.env.EXTRACTION_CHUNK_SIZE || 30000;
  }

  get extractionChunkOverlap() {
    return this.env.EXTRACTION_CHUNK_OVERLAP || 2000;
  }

  /**
   * Enable 3-tier verification cascade for extracted entities.
   * Enabled by default. Set EXTRACTION_VERIFICATION_ENABLED=false to disable.
   * When enabled, entities are verified against source text using:
   * - Tier 1: Exact/Fuzzy Match (Levenshtein)
   * - Tier 2: NLI Entailment (DeBERTa) - requires NLI service at EXTRACTION_NLI_ENDPOINT
   * - Tier 3: LLM Judge (Gemini) - fallback for uncertain cases
   */
  get extractionVerificationEnabled(): boolean {
    return this.env.EXTRACTION_VERIFICATION_ENABLED !== false;
  }

  /**
   * NLI service endpoint for Tier 2 verification
   * Default: http://localhost:8090/predict
   */
  get extractionNliEndpoint(): string {
    return this.env.EXTRACTION_NLI_ENDPOINT || 'http://localhost:8090/predict';
  }

  /**
   * Extraction pipeline mode:
   * - 'single_pass' (default): Use existing LangChainGeminiProvider
   * - 'langgraph': Use new LangGraph multi-node pipeline
   */
  get extractionPipelineMode(): 'single_pass' | 'langgraph' {
    const mode = this.env.EXTRACTION_PIPELINE_MODE || 'single_pass';
    return mode === 'langgraph' ? 'langgraph' : 'single_pass';
  }

  /**
   * Maximum retry attempts for LangGraph orphan recovery loop
   */
  get langgraphMaxRetries(): number {
    return this.env.LANGGRAPH_MAX_RETRIES || 3;
  }

  /**
   * Maximum percentage of orphan entities before triggering retry (0.0-1.0)
   */
  get langgraphOrphanThreshold(): number {
    return this.env.LANGGRAPH_ORPHAN_THRESHOLD || 0.1;
  }

  get llmCallTimeoutMs() {
    return this.env.LLM_CALL_TIMEOUT_MS || 300000; // 5 minutes default
  }

  /**
   * Whether LLM call dumping is enabled for debugging extraction jobs.
   * When enabled, each LLM call is written to files for analysis.
   */
  get llmDumpEnabled(): boolean {
    return !!this.env.LLM_DUMP_ENABLED;
  }

  /**
   * Directory for LLM call dump files.
   * Defaults to 'logs/llm-dumps' relative to cwd.
   */
  get llmDumpDir(): string {
    return this.env.LLM_DUMP_DIR || 'logs/llm-dumps';
  }

  get extractionBasePrompt(): string {
    // Note: This is a minimal base prompt. The tool-specific instructions are
    // added by buildToolExtractionPrompt() in langchain-gemini.provider.ts.
    // Keep this minimal to avoid duplication with tool-specific prompts.
    return this.env.EXTRACTION_BASE_PROMPT || '';
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

  // --- LangFuse Prompt Management ---

  /**
   * Cache TTL for Langfuse prompts in seconds.
   * Defaults to 60 seconds. Set to 0 to disable caching.
   */
  get langfusePromptCacheTtl(): number {
    return this.env.LANGFUSE_PROMPT_CACHE_TTL ?? 60;
  }

  /**
   * Default label to use when fetching prompts from Langfuse.
   * Typically 'production' for prod environments, 'staging' or 'latest' for dev.
   */
  get langfusePromptLabel(): string {
    return this.env.LANGFUSE_PROMPT_LABEL ?? 'production';
  }

  // --- Storage Configuration (MinIO / S3-compatible) ---

  /**
   * Storage provider type: 'minio', 's3', or 'gcs'
   */
  get storageProvider(): string {
    return this.env.STORAGE_PROVIDER || 'minio';
  }

  /**
   * Storage endpoint URL (e.g., http://localhost:9010 for MinIO)
   */
  get storageEndpoint(): string | undefined {
    return this.env.STORAGE_ENDPOINT;
  }

  /**
   * Storage access key
   */
  get storageAccessKey(): string | undefined {
    return this.env.STORAGE_ACCESS_KEY;
  }

  /**
   * Storage secret key
   */
  get storageSecretKey(): string | undefined {
    return this.env.STORAGE_SECRET_KEY;
  }

  /**
   * Bucket name for document storage
   */
  get storageBucketDocuments(): string {
    return this.env.STORAGE_BUCKET_DOCUMENTS || 'documents';
  }

  /**
   * Bucket name for temporary files
   */
  get storageBucketTemp(): string {
    return this.env.STORAGE_BUCKET_TEMP || 'document-temp';
  }

  /**
   * Storage region (default: us-east-1)
   */
  get storageRegion(): string {
    return this.env.STORAGE_REGION || 'us-east-1';
  }

  /**
   * Whether storage is configured and ready to use
   */
  get storageEnabled(): boolean {
    return !!(
      this.storageEndpoint &&
      this.storageAccessKey &&
      this.storageSecretKey
    );
  }

  // --- Kreuzberg Document Parsing Service ---

  /**
   * Kreuzberg service URL
   */
  get kreuzbergServiceUrl(): string {
    return this.env.KREUZBERG_SERVICE_URL || 'http://localhost:8000';
  }

  /**
   * Kreuzberg service timeout in milliseconds
   */
  get kreuzbergServiceTimeout(): number {
    return this.env.KREUZBERG_SERVICE_TIMEOUT || 300000;
  }

  /**
   * Whether Kreuzberg document parsing is enabled
   */
  get kreuzbergEnabled(): boolean {
    return !!this.env.KREUZBERG_ENABLED;
  }

  // --- Document Parsing Worker ---

  /**
   * Whether the document parsing worker is enabled
   */
  get documentParsingWorkerEnabled(): boolean {
    return !!this.env.DOCUMENT_PARSING_WORKER_ENABLED;
  }

  /**
   * Document parsing worker poll interval in milliseconds
   */
  get documentParsingWorkerPollIntervalMs(): number {
    return this.env.DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS || 5000;
  }

  /**
   * Document parsing worker batch size
   */
  get documentParsingWorkerBatchSize(): number {
    return this.env.DOCUMENT_PARSING_WORKER_BATCH_SIZE || 5;
  }

  // --- Google OAuth (Gmail, Google Drive integrations) ---

  /**
   * Google OAuth 2.0 client ID from Google Cloud Console
   */
  get googleOAuthClientId(): string | undefined {
    return this.env.GOOGLE_OAUTH_CLIENT_ID;
  }

  /**
   * Google OAuth 2.0 client secret
   */
  get googleOAuthClientSecret(): string | undefined {
    return this.env.GOOGLE_OAUTH_CLIENT_SECRET;
  }

  /**
   * Base URL for OAuth callbacks (e.g., http://localhost:3002)
   */
  get apiBaseUrl(): string {
    return this.env.API_BASE_URL || 'http://localhost:3002';
  }

  /**
   * Whether Google OAuth is configured and ready to use
   */
  get googleOAuthEnabled(): boolean {
    return !!(this.googleOAuthClientId && this.googleOAuthClientSecret);
  }
}
