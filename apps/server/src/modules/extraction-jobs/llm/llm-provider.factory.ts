import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../common/config/config.service';
import { ILLMProvider } from './llm-provider.interface';
import { LangChainGeminiProvider } from './langchain-gemini.provider';

/**
 * Factory for creating LLM providers
 *
 * Uses LangChain + Google Gemini for entity extraction.
 * This provides consistent behavior with the chat service, robust tracing via LangSmith,
 * and structured output support.
 */
@Injectable()
export class LLMProviderFactory {
  private readonly logger = new Logger(LLMProviderFactory.name);
  private provider: ILLMProvider | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly langChainProvider: LangChainGeminiProvider
  ) {
    this.initializeProvider();
  }

  private initializeProvider() {
    // Use LangChain provider (supports both Google Generative AI and Vertex AI via config)
    if (this.langChainProvider.isConfigured()) {
      this.provider = this.langChainProvider;
      this.logger.log(`Using LLM provider: ${this.provider.getName()}`);
    } else {
      this.logger.warn(
        'No LLM provider configured. Set GOOGLE_API_KEY or GCP_PROJECT_ID/GCP_REGION'
      );
    }
  }

  /**
   * Get the configured LLM provider
   * @throws Error if no provider is configured
   */
  getProvider(): ILLMProvider {
    if (!this.provider) {
      throw new Error(
        'No LLM provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY or GCP_PROJECT_ID to enable extraction.'
      );
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
