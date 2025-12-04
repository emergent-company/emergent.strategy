import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LangChainGeminiProvider } from '../../../src/modules/extraction-jobs/llm/langchain-gemini.provider';
import { AppConfigService } from '../../../src/common/config/config.service';
import { LangfuseService } from '../../../src/modules/langfuse/langfuse.service';

// Mock ChatVertexAI
const mockWithStructuredOutput = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@langchain/google-vertexai', () => {
  return {
    ChatVertexAI: vi.fn().mockImplementation(() => ({
      invoke: mockInvoke,
    })),
  };
});

describe('LangChainGeminiProvider with LangFuse', () => {
  let provider: LangChainGeminiProvider;
  let mockConfig: any;
  let mockLangfuseService: any;

  beforeEach(() => {
    mockConfig = {
      vertexAiProjectId: 'test-project',
      vertexAiLocation: 'us-central1',
      vertexAiModel: 'gemini-2.5-flash',
      extractionChunkSize: 1000,
      extractionChunkOverlap: 100,
    };

    mockLangfuseService = {
      createObservation: vi.fn().mockReturnValue({ id: 'obs-123' }),
      updateObservation: vi.fn(),
    };

    provider = new LangChainGeminiProvider(
      mockConfig as AppConfigService,
      mockLangfuseService as LangfuseService
    );

    mockInvoke.mockReset();
  });

  it('should create observation when traceId is provided', async () => {
    // Mock LLM response
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({
        entities: [
          { name: 'Test Entity', type: 'Requirement', confidence: 0.9 },
        ],
      }),
      response_metadata: {
        usage: {
          prompt_token_count: 100,
          candidates_token_count: 50,
          total_token_count: 150,
        },
      },
    });

    const result = await provider.extractEntities(
      'document content',
      'base prompt',
      { Requirement: {} },
      ['Requirement'],
      undefined,
      { jobId: 'job-1', projectId: 'proj-1', traceId: 'trace-123' }
    );

    // Verify observation creation
    expect(mockLangfuseService.createObservation).toHaveBeenCalledWith(
      'trace-123',
      'extract-Requirement',
      expect.objectContaining({
        typeName: 'Requirement',
        prompt: expect.stringContaining('base prompt'),
      }),
      expect.objectContaining({
        model: 'gemini-2.5-flash',
      })
    );

    // Verify observation update
    expect(mockLangfuseService.updateObservation).toHaveBeenCalledWith(
      { id: 'obs-123' },
      expect.any(Object), // parsed response
      expect.objectContaining({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      }),
      'gemini-2.5-flash'
    );

    expect(result.entities).toHaveLength(1);
  });

  it('should mark observation as error when LLM fails', async () => {
    mockInvoke.mockRejectedValue(new Error('LLM API Error'));

    await expect(
      provider.extractEntities(
        'document content',
        'base prompt',
        { Requirement: {} },
        ['Requirement'],
        undefined,
        { jobId: 'job-1', projectId: 'proj-1', traceId: 'trace-123' }
      )
    ).resolves.not.toThrow(); // Provider catches error and continues (returning empty for that chunk)

    // Verify observation update with error
    expect(mockLangfuseService.updateObservation).toHaveBeenCalledWith(
      { id: 'obs-123' },
      null,
      undefined,
      'gemini-2.5-flash',
      'error',
      'LLM API Error'
    );
  });

  it('should not create observation if traceId is missing', async () => {
    mockInvoke.mockResolvedValue({
      content: JSON.stringify({ entities: [] }),
    });

    await provider.extractEntities(
      'document content',
      'base prompt',
      { Requirement: {} },
      ['Requirement']
      // No context
    );

    expect(mockLangfuseService.createObservation).not.toHaveBeenCalled();
  });
});
