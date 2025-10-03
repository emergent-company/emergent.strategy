import { plainToInstance } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

export class EnvVariables {
    @IsString()
    @IsOptional()
    GOOGLE_API_KEY?: string;

    @IsBoolean()
    @IsOptional()
    CHAT_MODEL_ENABLED?: boolean; // when true and GOOGLE_API_KEY present, stream real model output

    @IsString()
    PGHOST!: string;

    @IsNumber()
    PGPORT: number = 5432;

    @IsString()
    PGUSER!: string;

    @IsString()
    PGPASSWORD!: string;

    @IsString()
    PGDATABASE!: string;

    @IsString()
    @IsOptional()
    APP_RLS_PASSWORD?: string; // password for non-bypass RLS enforcement role (app_rls)

    @IsNumber()
    PORT: number = 3001; // default aligned with admin frontend fallback

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
    VERTEX_AI_PROJECT_ID?: string;

    @IsString()
    @IsOptional()
    VERTEX_AI_LOCATION?: string;

    @IsString()
    @IsOptional()
    VERTEX_AI_MODEL?: string;

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

}

export function validate(config: Record<string, unknown>): EnvVariables {
    // Provide safe defaults for OpenAPI generation or test contexts without full env
    const withDefaults: Record<string, unknown> = {
        PGHOST: 'localhost',
        PGPORT: 5432,
        PGUSER: 'spec',
        PGPASSWORD: 'spec',
        PGDATABASE: 'spec',
        APP_RLS_PASSWORD: process.env.APP_RLS_PASSWORD,
        DB_AUTOINIT: false,
        SKIP_DB: process.env.SKIP_DB,
        CHAT_MODEL_ENABLED: process.env.CHAT_MODEL_ENABLED,
        EMBEDDINGS_NETWORK_DISABLED: process.env.EMBEDDINGS_NETWORK_DISABLED,
        RLS_POLICY_STRICT: process.env.RLS_POLICY_STRICT,
        // Extraction Worker defaults
        VERTEX_AI_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID,
        VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION || 'us-central1',
        VERTEX_AI_MODEL: process.env.VERTEX_AI_MODEL || 'gemini-1.5-pro-002',
        EXTRACTION_WORKER_ENABLED: process.env.EXTRACTION_WORKER_ENABLED,
        EXTRACTION_WORKER_POLL_INTERVAL_MS: process.env.EXTRACTION_WORKER_POLL_INTERVAL_MS || '5000',
        EXTRACTION_WORKER_BATCH_SIZE: process.env.EXTRACTION_WORKER_BATCH_SIZE || '5',
        EXTRACTION_RATE_LIMIT_RPM: process.env.EXTRACTION_RATE_LIMIT_RPM || '60',
        EXTRACTION_RATE_LIMIT_TPM: process.env.EXTRACTION_RATE_LIMIT_TPM || '30000',
        EXTRACTION_ENTITY_LINKING_STRATEGY: process.env.EXTRACTION_ENTITY_LINKING_STRATEGY || 'always_new',
        EXTRACTION_CONFIDENCE_THRESHOLD_MIN: process.env.EXTRACTION_CONFIDENCE_THRESHOLD_MIN || '0.0',
        EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW: process.env.EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW || '0.7',
        EXTRACTION_CONFIDENCE_THRESHOLD_AUTO: process.env.EXTRACTION_CONFIDENCE_THRESHOLD_AUTO || '0.85',
        ...config,
    };
    const transformed = plainToInstance(EnvVariables, {
        ...withDefaults,
        PGPORT: withDefaults.PGPORT ? Number(withDefaults.PGPORT) : 5432,
        PORT: withDefaults.PORT ? Number(withDefaults.PORT) : 3001,
        DB_AUTOINIT: withDefaults.DB_AUTOINIT === 'true' || withDefaults.DB_AUTOINIT === true,
        CHAT_MODEL_ENABLED: withDefaults.CHAT_MODEL_ENABLED === 'true' || withDefaults.CHAT_MODEL_ENABLED === true,
        EMBEDDINGS_NETWORK_DISABLED: withDefaults.EMBEDDINGS_NETWORK_DISABLED === 'true' || withDefaults.EMBEDDINGS_NETWORK_DISABLED === true,
        RLS_POLICY_STRICT: withDefaults.RLS_POLICY_STRICT === 'true' || withDefaults.RLS_POLICY_STRICT === true,
        // Extraction Worker conversions
        EXTRACTION_WORKER_ENABLED: withDefaults.EXTRACTION_WORKER_ENABLED === 'true' || withDefaults.EXTRACTION_WORKER_ENABLED === true,
        EXTRACTION_WORKER_POLL_INTERVAL_MS: Number(withDefaults.EXTRACTION_WORKER_POLL_INTERVAL_MS),
        EXTRACTION_WORKER_BATCH_SIZE: Number(withDefaults.EXTRACTION_WORKER_BATCH_SIZE),
        EXTRACTION_RATE_LIMIT_RPM: Number(withDefaults.EXTRACTION_RATE_LIMIT_RPM),
        EXTRACTION_RATE_LIMIT_TPM: Number(withDefaults.EXTRACTION_RATE_LIMIT_TPM),
        EXTRACTION_CONFIDENCE_THRESHOLD_MIN: Number(withDefaults.EXTRACTION_CONFIDENCE_THRESHOLD_MIN),
        EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW: Number(withDefaults.EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW),
        EXTRACTION_CONFIDENCE_THRESHOLD_AUTO: Number(withDefaults.EXTRACTION_CONFIDENCE_THRESHOLD_AUTO),
    });
    const errors = validateSync(transformed, { skipMissingProperties: false });
    if (errors.length) {
        throw new Error(`Config validation error: ${errors.map(e => Object.values(e.constraints || {}).join(', ')).join('; ')}`);
    }
    return transformed;
}
