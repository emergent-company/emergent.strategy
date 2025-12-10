import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../../../common/config/config.service';
import { ILLMProvider } from './llm-provider.interface';
import { LangChainGeminiProvider } from './langchain-gemini.provider';
import { LangGraphExtractionProvider } from './langgraph-extraction.provider';

/**
 * Factory for creating LLM providers
 *
 * Supports two extraction pipeline modes controlled by EXTRACTION_PIPELINE_MODE:
 * - 'single_pass' (default): Uses LangChain + Google Gemini for single-step extraction
 * - 'langgraph': Uses multi-step LangGraph pipeline for improved relationship extraction
 *
 * Both providers implement ILLMProvider interface for seamless switching.
 */
@Injectable()
export class LLMProviderFactory implements OnModuleInit {
  private readonly logger = new Logger(LLMProviderFactory.name);
  private provider: ILLMProvider | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly langChainProvider: LangChainGeminiProvider,
    private readonly langGraphProvider: LangGraphExtractionProvider
  ) {
    // Note: initialization moved to onModuleInit() to ensure all providers
    // have completed their initialization before we check isConfigured()
  }

  /**
   * Initialize the provider selection after all dependencies are ready.
   * This runs after LangGraphExtractionProvider.onModuleInit() has completed.
   */
  onModuleInit() {
    this.initializeProvider();
  }

  private initializeProvider() {
    const pipelineMode = this.config.extractionPipelineMode;
    this.logger.log(`Extraction pipeline mode: ${pipelineMode}`);

    if (pipelineMode === 'langgraph') {
      // Use LangGraph multi-step pipeline
      if (this.langGraphProvider.isConfigured()) {
        this.provider = this.langGraphProvider;
        this.logger.log(`Using LLM provider: ${this.provider.getName()}`);
      } else {
        this.logger.warn(
          'LangGraph provider not configured. Falling back to LangChain provider.'
        );
        this.tryFallbackToLangChain();
      }
    } else {
      // Default: single_pass mode with LangChain provider
      this.tryFallbackToLangChain();
    }
  }

  private tryFallbackToLangChain() {
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

  /**
   * Get the current pipeline mode
   */
  getPipelineMode(): 'single_pass' | 'langgraph' {
    return this.config.extractionPipelineMode;
  }
}
