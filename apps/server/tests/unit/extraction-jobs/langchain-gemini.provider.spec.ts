import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LangChainGeminiProvider } from '../../../src/modules/extraction-jobs/llm/langchain-gemini.provider';
import { SemanticChunkerService } from '../../../src/modules/extraction-jobs/semantic-chunker.service';
import { AppConfigService } from '../../../src/common/config/config.service';

// Mock ChatVertexAI
const mockWithStructuredOutput = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@langchain/google-vertexai', () => {
  return {
    ChatVertexAI: vi.fn().mockImplementation(() => ({
      withStructuredOutput: mockWithStructuredOutput.mockReturnValue({
        invoke: mockInvoke,
      }),
    })),
    VertexAIEmbeddings: vi.fn(),
  };
});

describe('LangChainGeminiProvider', () => {
  let provider: LangChainGeminiProvider;
  let mockConfig: any;
  let mockSemanticChunker: any;

  beforeEach(() => {
    mockConfig = {
      vertexAiProjectId: 'test-project',
      vertexAiLocation: 'us-central1',
      vertexAiModel: 'gemini-2.5-flash',
      extractionChunkSize: 1000,
      extractionChunkOverlap: 100,
    };

    mockSemanticChunker = {
      chunkDocument: vi.fn().mockResolvedValue(['chunk1', 'chunk2']),
    };

    provider = new LangChainGeminiProvider(
      mockConfig as AppConfigService,
      mockSemanticChunker as SemanticChunkerService
    );

    mockInvoke.mockReset();
    mockWithStructuredOutput
      .mockReset()
      .mockReturnValue({ invoke: mockInvoke });
  });

  it('should split document and extract entities using map-reduce', async () => {
    // Mock LLM response for chunk 1
    mockInvoke.mockResolvedValueOnce({
      requirements: [{ name: 'Req 1', description: 'Desc 1', confidence: 0.9 }],
    });
    // Mock LLM response for chunk 2
    mockInvoke.mockResolvedValueOnce({
      risks: [{ name: 'Risk 1', description: 'Desc 2', confidence: 0.8 }],
    });

    const result = await provider.extractEntities(
      'some long document content',
      'base prompt',
      { Requirement: {}, Risk: {} },
      ['Requirement', 'Risk']
    );

    expect(mockSemanticChunker.chunkDocument).toHaveBeenCalledWith(
      'some long document content'
    );

    // Should be called once per chunk
    expect(mockInvoke).toHaveBeenCalledTimes(2);

    expect(result.entities).toHaveLength(2);
    expect(result.entities.find((e) => e.name === 'Req 1')).toBeTruthy();
    expect(result.entities.find((e) => e.name === 'Risk 1')).toBeTruthy();
    expect(result.discovered_types).toContain('Requirement');
    expect(result.discovered_types).toContain('Risk');
  });

  it('should handle empty results gracefully', async () => {
    mockInvoke.mockResolvedValue({}); // Empty object

    const result = await provider.extractEntities(
      'content',
      'prompt',
      { Requirement: {} },
      ['Requirement']
    );

    expect(result.entities).toHaveLength(0);
  });
});
