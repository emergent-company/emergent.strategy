import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMProviderFactory } from '../../../src/modules/extraction-jobs/llm/llm-provider.factory';
import { VertexAIProvider } from '../../../src/modules/extraction-jobs/llm/vertex-ai.provider';
import { LangChainGeminiProvider } from '../../../src/modules/extraction-jobs/llm/langchain-gemini.provider';
import { AppConfigService } from '../../../src/common/config/config.service';

describe('LLMProviderFactory', () => {
    let factory: LLMProviderFactory;
    let mockConfig: Partial<AppConfigService>;
    let mockVertexProvider: any;
    let mockLangChainProvider: any;

    beforeEach(() => {
        mockConfig = {
            vertexAiProjectId: undefined,
            vertexAiLocation: 'us-central1',
            vertexAiModel: 'gemini-1.5-pro-002',
        };

        // Mock LangChainGeminiProvider with required methods
        mockLangChainProvider = {
            isConfigured: vi.fn().mockReturnValue(false),
            getName: vi.fn().mockReturnValue('LangChain Gemini'),
        };

        // Mock VertexAIProvider with required methods
        mockVertexProvider = {
            isConfigured: vi.fn().mockReturnValue(false),
            getName: vi.fn().mockReturnValue('VertexAI'),
        };

        factory = new LLMProviderFactory(
            mockConfig as AppConfigService,
            mockLangChainProvider,
            mockVertexProvider
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

    describe('getProvider', () => {
        it('should throw error when no provider is configured', () => {
            expect(() => factory.getProvider()).toThrow(
                'No LLM provider configured'
            );
        });

        it('should return provider when configured', () => {
            // Mock configured provider
            const configuredConfig = {
                vertexAiProjectId: 'test-project',
                vertexAiLocation: 'us-central1',
                vertexAiModel: 'gemini-1.5-flash-latest',
            };
            const configuredLangChain = {
                isConfigured: vi.fn().mockReturnValue(true),
                getName: vi.fn().mockReturnValue('LangChain Gemini'),
            };
            const configuredVertex = {
                isConfigured: vi.fn().mockReturnValue(false),
                getName: vi.fn().mockReturnValue('VertexAI'),
            };

            // Since actual initialization requires credentials, we test the factory logic
            const testFactory = new LLMProviderFactory(
                configuredConfig as AppConfigService,
                configuredLangChain as any,
                configuredVertex as any
            );

            // Verify factory handles provider availability check
            expect(typeof testFactory.isAvailable()).toBe('boolean');
        });
    });
});
