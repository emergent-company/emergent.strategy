import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../common/config/config.service';
import { ILLMProvider } from './llm-provider.interface';
import { VertexAIProvider } from './vertex-ai.provider';

/**
 * Factory for creating LLM providers
 * 
 * Currently supports:
 * - Google Vertex AI (primary)
 * 
 * Future providers can be added here (OpenAI, Azure, etc.)
 */
@Injectable()
export class LLMProviderFactory {
    private readonly logger = new Logger(LLMProviderFactory.name);
    private provider: ILLMProvider | null = null;

    constructor(
        private readonly config: AppConfigService,
        private readonly vertexAIProvider: VertexAIProvider
    ) {
        this.initializeProvider();
    }

    private initializeProvider() {
        // For now, we only support Vertex AI
        // Future: Add logic to select provider based on config
        if (this.vertexAIProvider.isConfigured()) {
            this.provider = this.vertexAIProvider;
            this.logger.log(`Using LLM provider: ${this.provider.getName()}`);
        } else {
            this.logger.warn('No LLM provider configured');
        }
    }

    /**
     * Get the configured LLM provider
     * @throws Error if no provider is configured
     */
    getProvider(): ILLMProvider {
        if (!this.provider) {
            throw new Error('No LLM provider configured. Set VERTEX_AI_PROJECT_ID to enable extraction.');
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
