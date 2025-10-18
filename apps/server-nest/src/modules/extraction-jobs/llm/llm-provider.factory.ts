import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../common/config/config.service';
import { ILLMProvider } from './llm-provider.interface';
import { VertexAIProvider } from './vertex-ai.provider';
import { LangChainGeminiProvider } from './langchain-gemini.provider';

/**
 * Factory for creating LLM providers
 * 
 * Priority order:
 * 1. Google Vertex AI (production-grade GCP service, requires VERTEX_AI_PROJECT_ID)
 * 2. LangChain + Google Gemini (fallback, uses public API with GOOGLE_API_KEY)
 * 
 * Future providers can be added here (OpenAI, Anthropic, etc.)
 */
@Injectable()
export class LLMProviderFactory {
    private readonly logger = new Logger(LLMProviderFactory.name);
    private provider: ILLMProvider | null = null;

    constructor(
        private readonly config: AppConfigService,
        private readonly langChainProvider: LangChainGeminiProvider,
        private readonly vertexAIProvider: VertexAIProvider
    ) {
        this.initializeProvider();
    }

    private initializeProvider() {
        // Prefer Vertex AI provider when configured (production-grade GCP service)
        if (this.vertexAIProvider.isConfigured()) {
            this.provider = this.vertexAIProvider;
            this.logger.log(`Using LLM provider: ${this.provider.getName()}`);
        }
        // Fallback to LangChain provider (uses public Generative AI API)
        else if (this.langChainProvider.isConfigured()) {
            this.provider = this.langChainProvider;
            this.logger.log(`Using LLM provider: ${this.provider.getName()} (fallback)`);
        }
        else {
            this.logger.warn('No LLM provider configured. Set VERTEX_AI_PROJECT_ID or GOOGLE_API_KEY');
        }
    }

    /**
     * Get the configured LLM provider
     * @throws Error if no provider is configured
     */
    getProvider(): ILLMProvider {
        if (!this.provider) {
            throw new Error('No LLM provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY or VERTEX_AI_PROJECT_ID to enable extraction.');
        }
        return this.provider;
    }

    /**
     * Check if a provider is available
     */
    isAvailable(): boolean {
        return this.provider !== null;
    }

    /**
     * Get the name of the active provider
     */
    getProviderName(): string {
        return this.provider?.getName() || 'none';
    }
}
