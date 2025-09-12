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

    constructor(private readonly config: AppConfigService) { }

    isEnabled(): boolean { return this.config.embeddingsEnabled; }

    private async ensureClient(): Promise<EmbeddingClient> {
        if (!this.isEnabled()) {
            throw new Error('Embeddings disabled (missing GOOGLE_API_KEY)');
        }
        if (!this.client) {
            // Lazy import to avoid require at startup when key missing
            const { GoogleGenerativeAIEmbeddings } = await import('@langchain/google-genai');
            this.client = new GoogleGenerativeAIEmbeddings({
                apiKey: this.config.googleApiKey,
                model: 'text-embedding-004',
            }) as EmbeddingClient;
            this.logger.log('Embeddings client initialized');
        }
        return this.client;
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
