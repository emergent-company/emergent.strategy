import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';

// Embedding vector dimension (Gemini text-embedding-004)
export const EMBEDDING_DIMENSION = 768;

type EmbeddingClient = {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
};

@Injectable()
export class EmbeddingsService {
  private client: EmbeddingClient | null = null;
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(private readonly config: AppConfigService) {}

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
        process.env.VERTEX_EMBEDDING_PROJECT &&
        process.env.VERTEX_EMBEDDING_LOCATION;

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
    const projectId = process.env.VERTEX_EMBEDDING_PROJECT;
    const location = process.env.VERTEX_EMBEDDING_LOCATION;
    const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004';

    if (!projectId || !location) {
      throw new Error(
        'Vertex AI configuration missing: VERTEX_EMBEDDING_PROJECT and VERTEX_EMBEDDING_LOCATION required'
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

      return data.predictions.map((prediction: any) => {
        const values = prediction.embeddings?.values || prediction.values || [];
        if (!Array.isArray(values) || values.length === 0) {
          throw new Error('Invalid embedding values in prediction');
        }
        return values as number[];
      });
    };

    return { embedQuery, embedDocuments };
  }

  private async createGenerativeAIClient(): Promise<EmbeddingClient> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY not set - required for Generative AI embeddings. ' +
          'For production, configure Vertex AI with VERTEX_EMBEDDING_PROJECT and VERTEX_EMBEDDING_LOCATION instead.'
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

  async embedQuery(text: string): Promise<number[]> {
    const client = await this.ensureClient();
    return client.embedQuery(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const client = await this.ensureClient();
    return client.embedDocuments(texts);
  }
}
