import { Injectable, Logger } from '@nestjs/common';
import { VertexAI } from '@google-cloud/vertexai';
import { EmbeddingProvider, EmbeddingResult } from './embedding.provider';
import { AppConfigService } from '../../common/config/config.service';

/**
 * GoogleVertexEmbeddingProvider
 *
 * Production implementation using Google Vertex AI Text Embeddings API.
 * Uses the official @google-cloud/vertexai SDK with Application Default Credentials (ADC).
 * No API key needed - authentication via gcloud CLI or service account JSON.
 *
 * Configuration (environment variables):
 *  - EMBEDDING_PROVIDER: Must be 'vertex' or 'google' to enable
 *  - GCP_PROJECT_ID: GCP project ID (e.g., 'spec-server-dev')
 *  - VERTEX_AI_LOCATION: Region (e.g., 'us-central1') - shared with LLM
 *  - EMBEDDINGS_NETWORK_DISABLED: If set, uses deterministic hash (offline mode)
 *
 * Behavior:
 *  - If embeddings disabled (EMBEDDING_PROVIDER not vertex/google) -> throws 'embeddings_disabled'
 *  - If EMBEDDINGS_NETWORK_DISABLED set -> returns deterministic local hash (no network)
 *  - Otherwise calls Vertex AI API; on errors falls back to deterministic hash with warning
 *
 * Model: text-embedding-004 (hardcoded)
 *  - Vector dimension: 768
 *  - Task type: RETRIEVAL_DOCUMENT (for indexing) or RETRIEVAL_QUERY (for search)
 *  - Max input tokens: ~2048 tokens (~8192 characters)
 *
 * Authentication:
 *  - Uses Application Default Credentials (ADC)
 *  - Run: gcloud auth application-default login
 *  - Or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 */
@Injectable()
export class GoogleVertexEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(GoogleVertexEmbeddingProvider.name);
  private vertexAI: VertexAI | null = null;
  private loggedFallback = false;

  constructor(private readonly config: AppConfigService) {
    this.initialize();
  }

  private initialize() {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION;

    if (!projectId || !location) {
      this.logger.warn(
        'Vertex AI Embeddings not configured. Required: ' +
          'GCP_PROJECT_ID, VERTEX_AI_LOCATION. ' +
          'Check your .env file.'
      );
      return;
    }

    if (!this.config.embeddingsEnabled) {
      this.logger.log(
        'Embeddings disabled (EMBEDDING_PROVIDER not set to vertex/google)'
      );
      return;
    }

    try {
      this.vertexAI = new VertexAI({
        project: projectId,
        location: location,
      });
      this.logger.log(
        `Vertex AI Embeddings initialized: project=${projectId}, location=${location}, model=text-embedding-004`
      );
    } catch (error) {
      this.logger.error('Failed to initialize Vertex AI for embeddings', error);
      this.vertexAI = null;
    }
  }

  async generate(text: string): Promise<EmbeddingResult> {
    const model = 'text-embedding-004';

    if (!this.config.embeddingsEnabled) {
      throw new Error('embeddings_disabled');
    }

    if (this.config.embeddingsNetworkDisabled) {
      return this.deterministicStub(text, 'vertex:offline:');
    }

    if (!this.vertexAI) {
      this.logger.warn(
        'Vertex AI not initialized, using deterministic fallback'
      );
      return this.deterministicStub(text, 'vertex:uninitialized:');
    }

    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION;

    if (!projectId || !location) {
      this.logger.error(
        'Vertex AI configuration missing at runtime. Required: GCP_PROJECT_ID, VERTEX_AI_LOCATION'
      );
      return this.deterministicStub(text, 'vertex:config-missing:');
    }

    try {
      // Use the REST API approach directly with ADC
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

      // Get auth token from Application Default Credentials
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
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
          instances: [{ content: text }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Vertex AI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      const prediction = data.predictions?.[0];
      const values = prediction?.embeddings?.values || prediction?.values;

      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('No embedding values returned from Vertex AI');
      }

      // Extract token count from response if available
      // Vertex AI embedding response includes statistics
      const statistics =
        prediction?.embeddings?.statistics || prediction?.statistics;
      const tokenCount = statistics?.token_count || statistics?.tokenCount;

      // Return as EmbeddingResult with usage info
      return {
        embedding: values as number[],
        model,
        usage: tokenCount
          ? {
              promptTokens: tokenCount,
              totalTokens: tokenCount,
            }
          : undefined,
      };
    } catch (err) {
      // Fallback path: log once per process to reduce noise
      if (!this.loggedFallback) {
        this.logger.warn(
          `Vertex embedding fallback to deterministic hash: ${
            (err as Error).message
          }`
        );
        this.loggedFallback = true;
      }
      return this.deterministicStub(text, 'vertex:fallback:');
    }
  }

  private async deterministicStub(
    text: string,
    prefix: string
  ): Promise<EmbeddingResult> {
    const crypto = await import('crypto');
    const hash = crypto
      .createHash('sha256')
      .update(prefix + text)
      .digest();
    const target = 768; // Match embedding_v2 dimension
    const out: number[] = [];
    for (let i = 0; i < target; i++) {
      // Normalize to [-1, 1] range like real embeddings
      out.push((hash[i % hash.length] / 255) * 2 - 1);
    }
    return {
      embedding: out,
      model: 'deterministic-stub',
      // No usage info for fallback
    };
  }
}
