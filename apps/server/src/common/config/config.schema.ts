import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

const FALLBACK_EXTRACTION_TEMPLATE_PACK_ID =
  '1f6f6267-0d2c-4e2f-9fdb-7f0481219775';

export class EnvVariables {
  @IsBoolean()
  @IsOptional()
  CHAT_MODEL_ENABLED?: boolean; // when true and GCP_PROJECT_ID present, stream real model output

  @IsString()
  POSTGRES_HOST!: string;

  @IsNumber()
  POSTGRES_PORT: number = 5432;

  @IsString()
  POSTGRES_USER!: string;

  @IsString()
  POSTGRES_PASSWORD!: string;

  @IsString()
  POSTGRES_DB!: string;

  @IsString()
  @IsOptional()
  APP_RLS_PASSWORD?: string; // password for non-bypass RLS enforcement role (app_rls)

  @IsNumber()
  PORT: number = 3002; // default aligned with admin frontend fallback

  @IsBoolean()
  @IsOptional()
  DB_AUTOINIT?: boolean;

  @IsString()
  @IsOptional()
  SKIP_DB?: string;

  @IsBoolean()
  @IsOptional()
  EMBEDDINGS_NETWORK_DISABLED?: boolean; // when true, force dummy embeddings even if key present

  @IsBoolean()
  @IsOptional()
  RLS_POLICY_STRICT?: boolean; // when true, fail-fast if unexpected RLS policies detected

  // --- Extraction Worker (Vertex AI) ---
  @IsString()
  @IsOptional()
  LLM_EXTRACT_PROVIDER?: string;

  @IsString()
  @IsOptional()
  GCP_PROJECT_ID?: string;

  // --- Google AI Studio (API Key auth) ---
  @IsString()
  @IsOptional()
  GOOGLE_API_KEY?: string;

  @IsString()
  @IsOptional()
  GOOGLE_AI_MODEL?: string; // Model name for Google AI Studio (default: gemini-2.5-flash)

  @IsString()
  @IsOptional()
  VERTEX_AI_LOCATION?: string;

  @IsString()
  @IsOptional()
  VERTEX_AI_MODEL?: string;

  @IsString()
  @IsOptional()
  EXTRACTION_METHOD?: string; // 'responseSchema' (default) or 'function_calling'

  // --- Embeddings Configuration ---
  @IsString()
  @IsOptional()
  EMBEDDING_PROVIDER?: string;

  // --- Chat System Prompts ---
  @IsString()
  @IsOptional()
  CHAT_SYSTEM_PROMPT?: string;

  // --- Chat Title Generation ---
  @IsBoolean()
  @IsOptional()
  CHAT_TITLE_GENERATION_ENABLED?: boolean;

  @IsNumber()
  @IsOptional()
  CHAT_TITLE_MAX_LENGTH?: number;

  @IsNumber()
  @IsOptional()
  CHAT_TITLE_MIN_MESSAGES?: number;

  // --- Extraction Worker Behavior ---
  @IsBoolean()
  @IsOptional()
  EXTRACTION_WORKER_ENABLED?: boolean;

  @IsNumber()
  @IsOptional()
  EXTRACTION_WORKER_POLL_INTERVAL_MS?: number;

  @IsNumber()
  @IsOptional()
  EXTRACTION_WORKER_BATCH_SIZE?: number;

  @IsNumber()
  @IsOptional()
  EXTRACTION_RATE_LIMIT_RPM?: number; // Requests per minute

  @IsNumber()
  @IsOptional()
  EXTRACTION_RATE_LIMIT_TPM?: number; // Tokens per minute

  @IsString()
  @IsOptional()
  EXTRACTION_ENTITY_LINKING_STRATEGY?: string; // always_new | key_match | vector_similarity | user_review

  @IsNumber()
  @IsOptional()
  EXTRACTION_CONFIDENCE_THRESHOLD_MIN?: number; // Reject below this (0.0-1.0)

  @IsNumber()
  @IsOptional()
  EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW?: number; // Flag for review (0.0-1.0)

  @IsNumber()
  @IsOptional()
  EXTRACTION_CONFIDENCE_THRESHOLD_AUTO?: number; // Auto-create above this (0.0-1.0)

  @IsString()
  @IsOptional()
  EXTRACTION_DEFAULT_TEMPLATE_PACK_ID?: string;

  @IsNumber()
  @IsOptional()
  EXTRACTION_CHUNK_SIZE?: number; // Maximum characters per chunk (default: 30000 based on perf testing)

  @IsNumber()
  @IsOptional()
  EXTRACTION_CHUNK_OVERLAP?: number; // Overlap between chunks in characters (default: 2000)

  @IsBoolean()
  @IsOptional()
  EXTRACTION_VERIFICATION_ENABLED?: boolean; // 3-tier verification cascade (default: true, set false to disable)

  @IsString()
  @IsOptional()
  EXTRACTION_NLI_ENDPOINT?: string; // NLI service endpoint (default: http://localhost:8090/predict)

  @IsString()
  @IsOptional()
  EXTRACTION_PIPELINE_MODE?: string; // 'single_pass' (default) | 'langgraph'

  @IsNumber()
  @IsOptional()
  LANGGRAPH_MAX_RETRIES?: number; // Max retry attempts for orphan recovery (default: 3)

  @IsNumber()
  @IsOptional()
  LANGGRAPH_ORPHAN_THRESHOLD?: number; // Max % orphan entities before retry (default: 0.10)

  @IsNumber()
  @IsOptional()
  LLM_CALL_TIMEOUT_MS?: number; // Timeout for LLM API calls in milliseconds (default: 120000 = 2 minutes)

  @IsBoolean()
  @IsOptional()
  LLM_DUMP_ENABLED?: boolean; // Enable file-based LLM call dumping for debugging

  @IsString()
  @IsOptional()
  LLM_DUMP_DIR?: string; // Directory for LLM call dump files (default: logs/llm-dumps)

  @IsString()
  @IsOptional()
  EXTRACTION_BASE_PROMPT?: string; // Base instruction prompt for LLM entity extraction (schema-agnostic)

  // --- LangSmith Tracing (Optional) ---
  @IsString()
  @IsOptional()
  LANGSMITH_TRACING?: string; // Enable/disable tracing (true/false)

  @IsString()
  @IsOptional()
  LANGSMITH_ENDPOINT?: string; // LangSmith API endpoint (EU or US region)

  @IsString()
  @IsOptional()
  LANGSMITH_API_KEY?: string; // Authentication token

  @IsString()
  @IsOptional()
  LANGSMITH_PROJECT?: string; // Project name for organizing traces

  // --- LangFuse Observability (Optional) ---
  @IsBoolean()
  @IsOptional()
  LANGFUSE_ENABLED?: boolean;

  @IsString()
  @IsOptional()
  LANGFUSE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  LANGFUSE_PUBLIC_KEY?: string;

  @IsString()
  @IsOptional()
  LANGFUSE_HOST?: string;

  @IsNumber()
  @IsOptional()
  LANGFUSE_FLUSH_AT?: number;

  @IsNumber()
  @IsOptional()
  LANGFUSE_FLUSH_INTERVAL?: number;

  // --- LangFuse Prompt Management ---
  @IsNumber()
  @IsOptional()
  LANGFUSE_PROMPT_CACHE_TTL?: number; // Cache TTL in seconds (default: 60)

  @IsString()
  @IsOptional()
  LANGFUSE_PROMPT_LABEL?: string; // Default label for prompts (default: 'production')

  // --- Storage Configuration (MinIO / S3-compatible) ---
  @IsString()
  @IsOptional()
  STORAGE_PROVIDER?: string; // 'minio' | 's3' | 'gcs' (default: 'minio')

  @IsString()
  @IsOptional()
  STORAGE_ENDPOINT?: string; // Storage endpoint URL (e.g., http://localhost:9010)

  @IsString()
  @IsOptional()
  STORAGE_ACCESS_KEY?: string; // Storage access key

  @IsString()
  @IsOptional()
  STORAGE_SECRET_KEY?: string; // Storage secret key

  @IsString()
  @IsOptional()
  STORAGE_BUCKET_DOCUMENTS?: string; // Documents bucket (default: 'documents')

  @IsString()
  @IsOptional()
  STORAGE_BUCKET_TEMP?: string; // Temporary files bucket (default: 'document-temp')

  @IsString()
  @IsOptional()
  STORAGE_REGION?: string; // Storage region (default: 'us-east-1')

  // --- Kreuzberg Document Parsing Service ---
  @IsString()
  @IsOptional()
  KREUZBERG_SERVICE_URL?: string; // Kreuzberg service URL (default: http://localhost:8000)

  @IsNumber()
  @IsOptional()
  KREUZBERG_SERVICE_TIMEOUT?: number; // Timeout in ms (default: 300000 = 5 minutes)

  @IsBoolean()
  @IsOptional()
  KREUZBERG_ENABLED?: boolean; // Enable Kreuzberg document parsing

  // --- Document Parsing Worker ---
  @IsBoolean()
  @IsOptional()
  DOCUMENT_PARSING_WORKER_ENABLED?: boolean; // Enable document parsing worker

  @IsNumber()
  @IsOptional()
  DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS?: number; // Poll interval (default: 5000)

  @IsNumber()
  @IsOptional()
  DOCUMENT_PARSING_WORKER_BATCH_SIZE?: number; // Batch size (default: 5)

  // --- Google OAuth (Gmail Integration) ---
  @IsString()
  @IsOptional()
  GOOGLE_OAUTH_CLIENT_ID?: string; // OAuth 2.0 client ID from Google Cloud Console

  @IsString()
  @IsOptional()
  GOOGLE_OAUTH_CLIENT_SECRET?: string; // OAuth 2.0 client secret

  @IsString()
  @IsOptional()
  API_BASE_URL?: string; // Base URL for OAuth callback (e.g., http://localhost:3002)
}

export function validate(config: Record<string, unknown>): EnvVariables {
  // Provide safe defaults for OpenAPI generation or test contexts without full env
  const withDefaults: Record<string, unknown> = {
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: 5432,
    POSTGRES_USER: 'spec',
    POSTGRES_PASSWORD: 'spec',
    POSTGRES_DB: 'spec',
    APP_RLS_PASSWORD: process.env.APP_RLS_PASSWORD,
    DB_AUTOINIT: false,
    SKIP_DB: process.env.SKIP_DB,
    CHAT_MODEL_ENABLED: process.env.CHAT_MODEL_ENABLED,
    EMBEDDINGS_NETWORK_DISABLED: process.env.EMBEDDINGS_NETWORK_DISABLED,
    RLS_POLICY_STRICT: process.env.RLS_POLICY_STRICT,
    // Extraction Worker defaults
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_AI_MODEL: process.env.GOOGLE_AI_MODEL,
    VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION,
    VERTEX_AI_MODEL: process.env.VERTEX_AI_MODEL,
    // Embeddings config
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    CHAT_SYSTEM_PROMPT: process.env.CHAT_SYSTEM_PROMPT,
    // Chat title generation config
    CHAT_TITLE_GENERATION_ENABLED: process.env.CHAT_TITLE_GENERATION_ENABLED,
    CHAT_TITLE_MAX_LENGTH: process.env.CHAT_TITLE_MAX_LENGTH || '60',
    CHAT_TITLE_MIN_MESSAGES: process.env.CHAT_TITLE_MIN_MESSAGES || '2',
    EXTRACTION_WORKER_ENABLED: process.env.EXTRACTION_WORKER_ENABLED,
    EXTRACTION_WORKER_POLL_INTERVAL_MS:
      process.env.EXTRACTION_WORKER_POLL_INTERVAL_MS || '5000',
    EXTRACTION_WORKER_BATCH_SIZE:
      process.env.EXTRACTION_WORKER_BATCH_SIZE || '5',
    EXTRACTION_RATE_LIMIT_RPM: process.env.EXTRACTION_RATE_LIMIT_RPM || '60',
    EXTRACTION_RATE_LIMIT_TPM: process.env.EXTRACTION_RATE_LIMIT_TPM || '30000',
    EXTRACTION_ENTITY_LINKING_STRATEGY:
      process.env.EXTRACTION_ENTITY_LINKING_STRATEGY || 'always_new',
    EXTRACTION_CONFIDENCE_THRESHOLD_MIN:
      process.env.EXTRACTION_CONFIDENCE_THRESHOLD_MIN || '0.0',
    EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW:
      process.env.EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW || '0.7',
    EXTRACTION_CONFIDENCE_THRESHOLD_AUTO:
      process.env.EXTRACTION_CONFIDENCE_THRESHOLD_AUTO || '0.9',
    EXTRACTION_DEFAULT_TEMPLATE_PACK_ID: (() => {
      const raw = process.env.EXTRACTION_DEFAULT_TEMPLATE_PACK_ID;
      if (raw && raw.trim().length > 0) {
        return raw.trim();
      }
      return FALLBACK_EXTRACTION_TEMPLATE_PACK_ID;
    })(),
    EXTRACTION_CHUNK_SIZE: process.env.EXTRACTION_CHUNK_SIZE || '30000', // 30K chars based on perf testing
    EXTRACTION_CHUNK_OVERLAP: process.env.EXTRACTION_CHUNK_OVERLAP || '2000',
    EXTRACTION_PIPELINE_MODE:
      process.env.EXTRACTION_PIPELINE_MODE || 'single_pass',
    LANGGRAPH_MAX_RETRIES: process.env.LANGGRAPH_MAX_RETRIES || '3',
    LANGGRAPH_ORPHAN_THRESHOLD:
      process.env.LANGGRAPH_ORPHAN_THRESHOLD || '0.10',
    LLM_CALL_TIMEOUT_MS: process.env.LLM_CALL_TIMEOUT_MS || '300000', // 5 minutes default
    LLM_DUMP_ENABLED: process.env.LLM_DUMP_ENABLED,
    LLM_DUMP_DIR: process.env.LLM_DUMP_DIR,
    EXTRACTION_BASE_PROMPT: process.env.EXTRACTION_BASE_PROMPT,
    // LangSmith Tracing
    LANGSMITH_TRACING: process.env.LANGSMITH_TRACING,
    LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT,
    LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY,
    LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT,
    // LangFuse Observability
    LANGFUSE_ENABLED: process.env.LANGFUSE_ENABLED,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_HOST: process.env.LANGFUSE_HOST,
    LANGFUSE_FLUSH_AT: process.env.LANGFUSE_FLUSH_AT,
    LANGFUSE_FLUSH_INTERVAL: process.env.LANGFUSE_FLUSH_INTERVAL,
    // LangFuse Prompt Management
    LANGFUSE_PROMPT_CACHE_TTL: process.env.LANGFUSE_PROMPT_CACHE_TTL || '60',
    LANGFUSE_PROMPT_LABEL: process.env.LANGFUSE_PROMPT_LABEL || 'production',
    // Storage Configuration
    STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'minio',
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
    STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY,
    STORAGE_BUCKET_DOCUMENTS:
      process.env.STORAGE_BUCKET_DOCUMENTS || 'documents',
    STORAGE_BUCKET_TEMP: process.env.STORAGE_BUCKET_TEMP || 'document-temp',
    STORAGE_REGION: process.env.STORAGE_REGION || 'us-east-1',
    // Kreuzberg Document Parsing
    KREUZBERG_SERVICE_URL:
      process.env.KREUZBERG_SERVICE_URL || 'http://localhost:8000',
    KREUZBERG_SERVICE_TIMEOUT:
      process.env.KREUZBERG_SERVICE_TIMEOUT || '300000',
    KREUZBERG_ENABLED: process.env.KREUZBERG_ENABLED,
    // Document Parsing Worker
    DOCUMENT_PARSING_WORKER_ENABLED:
      process.env.DOCUMENT_PARSING_WORKER_ENABLED,
    DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS:
      process.env.DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS || '5000',
    DOCUMENT_PARSING_WORKER_BATCH_SIZE:
      process.env.DOCUMENT_PARSING_WORKER_BATCH_SIZE || '5',
    // Google OAuth (Gmail, Google Drive integrations)
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3002',
    ...config,
  };
  const transformed = plainToInstance(EnvVariables, {
    ...withDefaults,
    POSTGRES_PORT: withDefaults.POSTGRES_PORT
      ? Number(withDefaults.POSTGRES_PORT)
      : 5432,
    PORT: withDefaults.PORT ? Number(withDefaults.PORT) : 3002,
    DB_AUTOINIT:
      withDefaults.DB_AUTOINIT === 'true' || withDefaults.DB_AUTOINIT === true,
    CHAT_MODEL_ENABLED:
      withDefaults.CHAT_MODEL_ENABLED === 'true' ||
      withDefaults.CHAT_MODEL_ENABLED === true,
    EMBEDDINGS_NETWORK_DISABLED:
      withDefaults.EMBEDDINGS_NETWORK_DISABLED === 'true' ||
      withDefaults.EMBEDDINGS_NETWORK_DISABLED === true,
    RLS_POLICY_STRICT:
      withDefaults.RLS_POLICY_STRICT === 'true' ||
      withDefaults.RLS_POLICY_STRICT === true,
    // Chat title generation conversions
    CHAT_TITLE_GENERATION_ENABLED:
      withDefaults.CHAT_TITLE_GENERATION_ENABLED === 'true' ||
      withDefaults.CHAT_TITLE_GENERATION_ENABLED === true,
    CHAT_TITLE_MAX_LENGTH: Number(withDefaults.CHAT_TITLE_MAX_LENGTH),
    CHAT_TITLE_MIN_MESSAGES: Number(withDefaults.CHAT_TITLE_MIN_MESSAGES),
    // Extraction Worker conversions
    EXTRACTION_WORKER_ENABLED:
      withDefaults.EXTRACTION_WORKER_ENABLED === 'true' ||
      withDefaults.EXTRACTION_WORKER_ENABLED === true,
    EXTRACTION_WORKER_POLL_INTERVAL_MS: Number(
      withDefaults.EXTRACTION_WORKER_POLL_INTERVAL_MS
    ),
    EXTRACTION_WORKER_BATCH_SIZE: Number(
      withDefaults.EXTRACTION_WORKER_BATCH_SIZE
    ),
    EXTRACTION_RATE_LIMIT_RPM: Number(withDefaults.EXTRACTION_RATE_LIMIT_RPM),
    EXTRACTION_RATE_LIMIT_TPM: Number(withDefaults.EXTRACTION_RATE_LIMIT_TPM),
    EXTRACTION_CONFIDENCE_THRESHOLD_MIN: Number(
      withDefaults.EXTRACTION_CONFIDENCE_THRESHOLD_MIN
    ),
    EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW: Number(
      withDefaults.EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW
    ),
    EXTRACTION_CONFIDENCE_THRESHOLD_AUTO: Number(
      withDefaults.EXTRACTION_CONFIDENCE_THRESHOLD_AUTO
    ),
    EXTRACTION_CHUNK_SIZE: Number(withDefaults.EXTRACTION_CHUNK_SIZE),
    EXTRACTION_CHUNK_OVERLAP: Number(withDefaults.EXTRACTION_CHUNK_OVERLAP),
    LANGGRAPH_MAX_RETRIES: Number(withDefaults.LANGGRAPH_MAX_RETRIES),
    LANGGRAPH_ORPHAN_THRESHOLD: Number(withDefaults.LANGGRAPH_ORPHAN_THRESHOLD),
    LLM_CALL_TIMEOUT_MS: Number(withDefaults.LLM_CALL_TIMEOUT_MS),
    LLM_DUMP_ENABLED:
      withDefaults.LLM_DUMP_ENABLED === 'true' ||
      withDefaults.LLM_DUMP_ENABLED === true,
    // LangFuse conversions
    LANGFUSE_ENABLED:
      withDefaults.LANGFUSE_ENABLED === 'true' ||
      withDefaults.LANGFUSE_ENABLED === true,
    LANGFUSE_FLUSH_AT: withDefaults.LANGFUSE_FLUSH_AT
      ? Number(withDefaults.LANGFUSE_FLUSH_AT)
      : undefined,
    LANGFUSE_FLUSH_INTERVAL: withDefaults.LANGFUSE_FLUSH_INTERVAL
      ? Number(withDefaults.LANGFUSE_FLUSH_INTERVAL)
      : undefined,
    // LangFuse Prompt Management conversions
    LANGFUSE_PROMPT_CACHE_TTL: withDefaults.LANGFUSE_PROMPT_CACHE_TTL
      ? Number(withDefaults.LANGFUSE_PROMPT_CACHE_TTL)
      : 60,
    LANGFUSE_PROMPT_LABEL: withDefaults.LANGFUSE_PROMPT_LABEL || 'production',
    // Storage conversions (strings stay as-is, no numeric conversions needed)
    // Kreuzberg conversions
    KREUZBERG_SERVICE_TIMEOUT: Number(withDefaults.KREUZBERG_SERVICE_TIMEOUT),
    KREUZBERG_ENABLED:
      withDefaults.KREUZBERG_ENABLED === 'true' ||
      withDefaults.KREUZBERG_ENABLED === true,
    // Document Parsing Worker conversions
    DOCUMENT_PARSING_WORKER_ENABLED:
      withDefaults.DOCUMENT_PARSING_WORKER_ENABLED === 'true' ||
      withDefaults.DOCUMENT_PARSING_WORKER_ENABLED === true,
    DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS: Number(
      withDefaults.DOCUMENT_PARSING_WORKER_POLL_INTERVAL_MS
    ),
    DOCUMENT_PARSING_WORKER_BATCH_SIZE: Number(
      withDefaults.DOCUMENT_PARSING_WORKER_BATCH_SIZE
    ),
  });
  const errors = validateSync(transformed, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(
      `Config validation error: ${errors
        .map((e) => Object.values(e.constraints || {}).join(', '))
        .join('; ')}`
    );
  }
  return transformed;
}
