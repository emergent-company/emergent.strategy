import { Inject, Injectable } from '@nestjs/common';
import { EnvVariables } from './config.schema';

@Injectable()
export class AppConfigService {
    constructor(@Inject(EnvVariables) private readonly env: EnvVariables) {
        if (process.env.E2E_DEBUG_CHAT === '1') {
            // eslint-disable-next-line no-console
            console.log('[config-debug] CHAT_MODEL_ENABLED raw=', process.env.CHAT_MODEL_ENABLED,
                'GOOGLE_API_KEY set=', !!process.env.GOOGLE_API_KEY,
                'computed chatModelEnabled=', !!process.env.GOOGLE_API_KEY && (process.env.CHAT_MODEL_ENABLED === 'true' || process.env.CHAT_MODEL_ENABLED === '1'));
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

    get port() { return this.env.PORT; }
    get dbHost() { return this.env.PGHOST; }
    get dbPort() { return this.env.PGPORT; }
    get dbUser() { return this.env.PGUSER; }
    get dbPassword() { return this.env.PGPASSWORD; }
    get dbName() { return this.env.PGDATABASE; }
    get googleApiKey() { return this.env.GOOGLE_API_KEY; }
    get embeddingsEnabled() { return !!this.env.GOOGLE_API_KEY; }
    get embeddingsNetworkDisabled(): boolean {
        return Boolean(process.env.EMBEDDINGS_NETWORK_DISABLED);
    }

    get embeddingDimension(): number {
        const dim = parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10);
        if (isNaN(dim) || dim <= 0) {
            // eslint-disable-next-line no-console
            console.warn(`[config] Invalid EMBEDDING_DIMENSION: ${process.env.EMBEDDING_DIMENSION}, using default 1536`);
            return 1536;
        }
        // Support common dimensions: 32 (legacy stub), 128, 384, 768, 1536, 3072
        const validDimensions = [32, 128, 384, 768, 1536, 3072];
        if (!validDimensions.includes(dim)) {
            // eslint-disable-next-line no-console
            console.warn(`[config] Non-standard EMBEDDING_DIMENSION: ${dim}. Supported: ${validDimensions.join(', ')}`);
        }
        return dim;
    }
    get chatModelEnabled() { return !!this.env.GOOGLE_API_KEY && !!this.env.CHAT_MODEL_ENABLED; }
    get autoInitDb() { return !!this.env.DB_AUTOINIT; }
    /** Password used when creating / connecting as dedicated non-bypass RLS role (app_rls). Optional so tests can rely on default. */
    get appRlsPassword() { return this.env.APP_RLS_PASSWORD || 'app_rls_pw'; }
    get rlsPolicyStrict() { return !!this.env.RLS_POLICY_STRICT; }

    // --- Extraction Worker (Vertex AI) ---
    get vertexAiProjectId() { return this.env.VERTEX_AI_PROJECT_ID; }
    get vertexAiLocation() { return this.env.VERTEX_AI_LOCATION || 'us-central1'; }
    get vertexAiModel() { return this.env.VERTEX_AI_MODEL || 'gemini-1.5-pro-002'; }

    // --- Extraction Worker Behavior ---
    get extractionWorkerEnabled() {
        // Only enable if Vertex AI project ID is configured
        return !!this.env.VERTEX_AI_PROJECT_ID && !!this.env.EXTRACTION_WORKER_ENABLED;
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
}
