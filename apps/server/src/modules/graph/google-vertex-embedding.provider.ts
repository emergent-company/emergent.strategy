import { Injectable, Logger } from '@nestjs/common';
import { VertexAI } from '@google-cloud/vertexai';
import { EmbeddingProvider } from './embedding.provider';
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
 *  - VERTEX_EMBEDDING_PROJECT: GCP project ID (e.g., 'spec-server-dev')
 *  - VERTEX_EMBEDDING_LOCATION: Region (e.g., 'us-central1')
 *  - VERTEX_EMBEDDING_MODEL: Model name (default: 'text-embedding-004')
 *  - EMBEDDINGS_NETWORK_DISABLED: If set, uses deterministic hash (offline mode)
 *
 * Behavior:
 *  - If embeddings disabled (EMBEDDING_PROVIDER not vertex/google) -> throws 'embeddings_disabled'
 *  - If EMBEDDINGS_NETWORK_DISABLED set -> returns deterministic local hash (no network)
 *  - Otherwise calls Vertex AI API; on errors falls back to deterministic hash with warning
 *
 * Model: text-embedding-004
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
    const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
    const location = process.env.VERTEX_EMBEDDING_LOCATION;

    if (!projectId || !location) {
      this.logger.warn(
        'Vertex AI Embeddings not configured. Required: ' +
          'VERTEX_EMBEDDING_PROJECT, VERTEX_EMBEDDING_LOCATION. ' +
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
      const model = process.env.VERTEX_EMBEDDING_MODEL;
      if (!model) {
        this.logger.warn(
          'VERTEX_EMBEDDING_MODEL not set, defaulting to text-embedding-004'
        );
      }
      this.logger.log(
        `Vertex AI Embeddings initialized: project=${projectId}, location=${location}, model=${
          model || 'text-embedding-004'
        }`
      );
    } catch (error) {
      this.logger.error('Failed to initialize Vertex AI for embeddings', error);
      this.vertexAI = null;
    }
  }

  async generate(text: string): Promise<Buffer> {
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

    const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';
    const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
    const location = process.env.VERTEX_EMBEDDING_LOCATION;

    if (!projectId || !location) {
      this.logger.error(
        'Vertex AI configuration missing at runtime. Required: VERTEX_EMBEDDING_PROJECT, VERTEX_EMBEDDING_LOCATION'
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
      const values =
        data.predictions?.[0]?.embeddings?.values ||
        data.predictions?.[0]?.values;

      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('No embedding values returned from Vertex AI');
      }

      // Convert to Float32Array buffer (standard format for vector storage)
      const floatArray = new Float32Array(values);
      return Buffer.from(floatArray.buffer);
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
  ): Promise<Buffer> {
    const crypto = await import('crypto');
    const hash = crypto
      .createHash('sha256')
      .update(prefix + text)
      .digest();
    const target = 128;
    const out = Buffer.alloc(target);
    for (let i = 0; i < target; i++) out[i] = hash[i % hash.length];
    return out;
  }
}
