import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMProviderFactory } from '../../../src/modules/extraction-jobs/llm/llm-provider.factory';
import { LangChainGeminiProvider } from '../../../src/modules/extraction-jobs/llm/langchain-gemini.provider';
import { LangGraphExtractionProvider } from '../../../src/modules/extraction-jobs/llm/langgraph-extraction.provider';
import { AppConfigService } from '../../../src/common/config/config.service';

describe('LLMProviderFactory', () => {
  let factory: LLMProviderFactory;
  let mockConfig: Partial<AppConfigService>;
  let mockLangChainProvider: any;
  let mockLangGraphProvider: any;

  beforeEach(() => {
    mockConfig = {
      vertexAiProjectId: undefined,
      vertexAiLocation: 'us-central1',
      vertexAiModel: 'gemini-1.5-pro-002',
      extractionPipelineMode: 'single_pass',
    };

    // Mock LangChainGeminiProvider with required methods
    mockLangChainProvider = {
      isConfigured: vi.fn().mockReturnValue(false),
      getName: vi.fn().mockReturnValue('LangChain Gemini'),
    };

    // Mock LangGraphExtractionProvider with required methods
    mockLangGraphProvider = {
      isConfigured: vi.fn().mockReturnValue(false),
      getName: vi.fn().mockReturnValue('LangGraph-Extraction'),
    };

    factory = new LLMProviderFactory(
      mockConfig as AppConfigService,
      mockLangChainProvider,
      mockLangGraphProvider
    );
  });

  describe('isAvailable', () => {
    it('should return false when no provider is configured', () => {
      expect(factory.isAvailable()).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return "none" when no provider is configured', () => {
      expect(factory.getProviderName()).toBe('none');
    });
  });

  describe('getPipelineMode', () => {
    it('should return the configured pipeline mode', () => {
      expect(factory.getPipelineMode()).toBe('single_pass');
    });
  });

  describe('getProvider', () => {
    it('should throw error when no provider is configured', () => {
      expect(() => factory.getProvider()).toThrow('No LLM provider configured');
    });

    it('should return LangChain provider when in single_pass mode', () => {
      const configuredConfig = {
        vertexAiProjectId: 'test-project',
        vertexAiLocation: 'us-central1',
        vertexAiModel: 'gemini-1.5-flash-latest',
        extractionPipelineMode: 'single_pass' as const,
      };
      const configuredLangChain = {
        isConfigured: vi.fn().mockReturnValue(true),
        getName: vi.fn().mockReturnValue('LangChain Gemini'),
      };
      const configuredLangGraph = {
        isConfigured: vi.fn().mockReturnValue(true),
        getName: vi.fn().mockReturnValue('LangGraph-Extraction'),
      };

      const testFactory = new LLMProviderFactory(
        configuredConfig as AppConfigService,
        configuredLangChain as any,
        configuredLangGraph as any
      );

      expect(testFactory.isAvailable()).toBe(true);
      expect(testFactory.getProviderName()).toBe('LangChain Gemini');
    });

    it('should return LangGraph provider when in langgraph mode', () => {
      const configuredConfig = {
        vertexAiProjectId: 'test-project',
        vertexAiLocation: 'us-central1',
        vertexAiModel: 'gemini-1.5-flash-latest',
        extractionPipelineMode: 'langgraph' as const,
      };
      const configuredLangChain = {
        isConfigured: vi.fn().mockReturnValue(true),
        getName: vi.fn().mockReturnValue('LangChain Gemini'),
      };
      const configuredLangGraph = {
        isConfigured: vi.fn().mockReturnValue(true),
        getName: vi.fn().mockReturnValue('LangGraph-Extraction'),
      };

      const testFactory = new LLMProviderFactory(
        configuredConfig as AppConfigService,
        configuredLangChain as any,
        configuredLangGraph as any
      );

      expect(testFactory.isAvailable()).toBe(true);
      expect(testFactory.getProviderName()).toBe('LangGraph-Extraction');
    });

    it('should fallback to LangChain when LangGraph is not configured', () => {
      const configuredConfig = {
        vertexAiProjectId: 'test-project',
        vertexAiLocation: 'us-central1',
        vertexAiModel: 'gemini-1.5-flash-latest',
        extractionPipelineMode: 'langgraph' as const,
      };
      const configuredLangChain = {
        isConfigured: vi.fn().mockReturnValue(true),
        getName: vi.fn().mockReturnValue('LangChain Gemini'),
      };
      const notConfiguredLangGraph = {
        isConfigured: vi.fn().mockReturnValue(false),
        getName: vi.fn().mockReturnValue('LangGraph-Extraction'),
      };

      const testFactory = new LLMProviderFactory(
        configuredConfig as AppConfigService,
        configuredLangChain as any,
        notConfiguredLangGraph as any
      );

      expect(testFactory.isAvailable()).toBe(true);
      expect(testFactory.getProviderName()).toBe('LangChain Gemini');
    });
  });
});
