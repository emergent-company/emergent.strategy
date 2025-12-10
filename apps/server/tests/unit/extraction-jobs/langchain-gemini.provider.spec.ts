import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LangChainGeminiProvider } from '../../../src/modules/extraction-jobs/llm/langchain-gemini.provider';
import { AppConfigService } from '../../../src/common/config/config.service';
import { LangfuseService } from '../../../src/modules/langfuse/langfuse.service';
import { LlmCallDumpService } from '../../../src/modules/extraction-jobs/llm/llm-call-dump.service';

// Mock ChatVertexAI - including tool model support
const mockWithStructuredOutput = vi.fn();
const mockInvoke = vi.fn();
const mockBindTools = vi.fn();
const mockToolModelInvoke = vi.fn();

vi.mock('@langchain/google-vertexai', () => {
  return {
    ChatVertexAI: vi.fn().mockImplementation((config: any) => {
      // Return different mock based on whether responseMimeType is set
      if (config.responseMimeType === 'application/json') {
        // JSON model (legacy)
        return {
          invoke: mockInvoke,
          withStructuredOutput: mockWithStructuredOutput.mockReturnValue({
            invoke: mockInvoke,
          }),
        };
      } else {
        // Tool model (for tool-based extraction)
        return {
          invoke: mockToolModelInvoke,
          bindTools: mockBindTools.mockReturnValue({
            invoke: mockToolModelInvoke,
          }),
        };
      }
    }),
    VertexAIEmbeddings: vi.fn(),
  };
});

describe('LangChainGeminiProvider', () => {
  let provider: LangChainGeminiProvider;
  let mockConfig: any;
  let mockLangfuseService: any;
  let mockLlmCallDumpService: any;

  beforeEach(() => {
    mockConfig = {
      vertexAiProjectId: 'test-project',
      vertexAiLocation: 'us-central1',
      vertexAiModel: 'gemini-2.5-flash',
      extractionChunkSize: 1000,
      extractionChunkOverlap: 100,
    };

    mockLangfuseService = {
      createObservation: vi.fn(),
      updateObservation: vi.fn(),
    };

    mockLlmCallDumpService = {
      isEnabled: vi.fn().mockReturnValue(false),
      startJob: vi.fn(),
      recordLlmCall: vi.fn(),
      completeJob: vi.fn(),
    };

    provider = new LangChainGeminiProvider(
      mockConfig as AppConfigService,
      mockLangfuseService as LangfuseService,
      mockLlmCallDumpService as LlmCallDumpService
    );

    mockInvoke.mockReset();
    mockWithStructuredOutput
      .mockReset()
      .mockReturnValue({ invoke: mockInvoke });
    mockBindTools.mockReset().mockReturnValue({ invoke: mockToolModelInvoke });
    mockToolModelInvoke.mockReset();
  });

  it('should split document and extract entities using map-reduce', async () => {
    // Mock LLM response for chunk 1
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        entities: [{ name: 'Req 1', description: 'Desc 1', confidence: 0.9 }],
      }),
    });
    // Mock LLM response for chunk 2
    mockInvoke.mockResolvedValueOnce({
      content: JSON.stringify({
        entities: [{ name: 'Risk 1', description: 'Desc 2', confidence: 0.8 }],
      }),
    });

    const result = await provider.extractEntities(
      'some long document content',
      'base prompt',
      {
        objectSchemas: { Requirement: {}, Risk: {} },
        allowedTypes: ['Requirement', 'Risk'],
      }
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
    mockInvoke.mockResolvedValue({ content: JSON.stringify({}) }); // Empty object

    const result = await provider.extractEntities('content', 'prompt', {
      objectSchemas: { Requirement: {} },
      allowedTypes: ['Requirement'],
    });

    expect(result.entities).toHaveLength(0);
  });

  describe('Tool-based extraction (with relationshipSchemas)', () => {
    it('should use tool binding when relationshipSchemas are provided', async () => {
      // Mock tool call response with entities and relationships
      mockToolModelInvoke.mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            name: 'extract_entity',
            args: {
              name: 'User Service',
              type_name: 'Component',
              description: 'Handles user authentication',
              properties: { category: 'backend' },
              confidence: 0.95,
            },
          },
          {
            name: 'extract_entity',
            args: {
              name: 'Auth Database',
              type_name: 'Component',
              description: 'Stores user credentials',
              properties: { category: 'storage' },
              confidence: 0.9,
            },
          },
          {
            name: 'extract_relationship',
            args: {
              source_name: 'User Service',
              target_name: 'Auth Database',
              relationship_type: 'DEPENDS_ON',
              description: 'Uses for credential storage',
              confidence: 0.85,
            },
          },
        ],
      });

      const result = await provider.extractEntities(
        'Document about system architecture',
        'Extract components and their relationships',
        {
          objectSchemas: {
            Component: {
              description: 'System component',
              properties: { category: { type: 'string' } },
            },
          },
          relationshipSchemas: {
            DEPENDS_ON: {
              description: 'Dependency relationship',
              source_types: ['Component'],
              target_types: ['Component'],
            },
          },
          allowedTypes: ['Component'],
        }
      );

      // Verify bindTools was called
      expect(mockBindTools).toHaveBeenCalled();

      // Verify entities extracted correctly
      expect(result.entities).toHaveLength(2);
      expect(result.entities[0].name).toBe('User Service');
      expect(result.entities[0].type_name).toBe('Component');
      expect(result.entities[0].confidence).toBe(0.95);
      expect(result.entities[1].name).toBe('Auth Database');

      // Verify relationships extracted correctly
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].source.name).toBe('User Service');
      expect(result.relationships[0].target.name).toBe('Auth Database');
      expect(result.relationships[0].relationship_type).toBe('DEPENDS_ON');
      expect(result.relationships[0].confidence).toBe(0.85);

      // Verify extraction mode in raw_response
      expect(result.raw_response.extraction_mode).toBe('tool-binding');
    });

    it('should handle relationships referencing existing entities by UUID', async () => {
      mockToolModelInvoke.mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            name: 'extract_entity',
            args: {
              name: 'New Feature',
              type_name: 'Feature',
              description: 'A new feature to add',
              confidence: 0.9,
            },
          },
          {
            name: 'extract_relationship',
            args: {
              source_name: 'New Feature',
              target_id: 'existing-component-uuid-123',
              relationship_type: 'REQUIRES',
              confidence: 0.8,
            },
          },
        ],
      });

      const result = await provider.extractEntities(
        'Document about new feature',
        'Extract features',
        {
          objectSchemas: { Feature: {} },
          relationshipSchemas: {
            REQUIRES: {
              source_types: ['Feature'],
              target_types: ['Component'],
            },
          },
          existingEntities: [
            {
              id: 'existing-component-uuid-123',
              name: 'Existing Component',
              type_name: 'Component',
            },
          ],
        }
      );

      expect(result.entities).toHaveLength(1);
      expect(result.relationships).toHaveLength(1);

      // Verify hybrid reference - source by name, target by id
      expect(result.relationships[0].source.name).toBe('New Feature');
      expect(result.relationships[0].source.id).toBeUndefined();
      expect(result.relationships[0].target.id).toBe(
        'existing-component-uuid-123'
      );
      expect(result.relationships[0].target.name).toBeUndefined();
    });

    it('should deduplicate entities across chunks', async () => {
      // Simulate 2-chunk processing with overlapping entities
      // First chunk returns 2 entities
      mockToolModelInvoke.mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            name: 'extract_entity',
            args: {
              name: 'User Service',
              type_name: 'Component',
              description: 'From chunk 1',
              confidence: 0.8,
            },
          },
          {
            name: 'extract_entity',
            args: {
              name: 'Database',
              type_name: 'Component',
              description: 'From chunk 1',
              confidence: 0.85,
            },
          },
        ],
      });

      // Second chunk returns same entity with higher confidence + new entity
      mockToolModelInvoke.mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            name: 'extract_entity',
            args: {
              name: 'user service', // Same entity, different case
              type_name: 'Component',
              description: 'From chunk 2 - more detail',
              confidence: 0.95, // Higher confidence
            },
          },
          {
            name: 'extract_entity',
            args: {
              name: 'API Gateway',
              type_name: 'Component',
              description: 'From chunk 2 only',
              confidence: 0.9,
            },
          },
        ],
      });

      // Need to create long enough content to trigger chunking
      const longContent = 'a'.repeat(1500); // Exceeds extractionChunkSize of 1000

      const result = await provider.extractEntities(
        longContent,
        'Extract components',
        {
          objectSchemas: { Component: {} },
          relationshipSchemas: { DEPENDS_ON: {} },
        }
      );

      // Should deduplicate by name (case-insensitive), keeping highest confidence
      expect(result.entities).toHaveLength(3);

      // Find the User Service entity - should have higher confidence from chunk 2
      const userService = result.entities.find(
        (e) => e.name.toLowerCase() === 'user service'
      );
      expect(userService).toBeDefined();
      expect(userService?.confidence).toBe(0.95);
    });

    it('should deduplicate relationships across chunks', async () => {
      // First chunk
      mockToolModelInvoke.mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            name: 'extract_relationship',
            args: {
              source_name: 'A',
              target_name: 'B',
              relationship_type: 'DEPENDS_ON',
              confidence: 0.7,
            },
          },
        ],
      });

      // Second chunk - same relationship with higher confidence
      mockToolModelInvoke.mockResolvedValueOnce({
        content: '',
        tool_calls: [
          {
            name: 'extract_relationship',
            args: {
              source_name: 'a', // Same, different case
              target_name: 'b',
              relationship_type: 'depends_on', // Same, different case
              confidence: 0.9,
            },
          },
        ],
      });

      const longContent = 'x'.repeat(1500);

      const result = await provider.extractEntities(
        longContent,
        'Extract relationships',
        {
          objectSchemas: {},
          relationshipSchemas: { DEPENDS_ON: {} },
        }
      );

      // Should deduplicate, keeping the one with higher confidence
      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0].confidence).toBe(0.9);
    });

    it('should handle tool call errors gracefully', async () => {
      // Simulate an empty generations error (recognized by the provider)
      mockToolModelInvoke.mockRejectedValueOnce(
        new Error("Cannot read properties of undefined (reading 'message')")
      );

      const result = await provider.extractEntities(
        'Some content',
        'Extract entities',
        {
          objectSchemas: { Component: {} },
          relationshipSchemas: { DEPENDS_ON: {} },
        }
      );

      // Should return empty result, not throw
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      expect(result.raw_response.llm_calls[0].status).toBe('error');
    });

    it('should handle empty tool_calls response', async () => {
      mockToolModelInvoke.mockResolvedValueOnce({
        content: 'No entities found in document',
        tool_calls: [],
      });

      const result = await provider.extractEntities(
        'Empty document',
        'Extract entities',
        {
          objectSchemas: { Feature: {} },
          relationshipSchemas: { REQUIRES: {} },
        }
      );

      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it('should handle undefined tool_calls in response', async () => {
      mockToolModelInvoke.mockResolvedValueOnce({
        content: 'No entities found',
        // tool_calls is undefined
      });

      const result = await provider.extractEntities(
        'Empty document',
        'Extract entities',
        {
          objectSchemas: { Feature: {} },
          relationshipSchemas: { REQUIRES: {} },
        }
      );

      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it('should include entity type schemas in prompt', async () => {
      let capturedPrompt = '';
      mockToolModelInvoke.mockImplementation((prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve({ content: '', tool_calls: [] });
      });

      await provider.extractEntities(
        'Document content',
        'Base extraction prompt',
        {
          objectSchemas: {
            Requirement: {
              description: 'A system requirement',
              properties: {
                priority: { type: 'string' },
                status: { type: 'string' },
              },
              required: ['priority'],
            },
          },
          relationshipSchemas: {
            PARENT_OF: { source_types: ['Requirement'] },
          },
        }
      );

      // Verify prompt includes entity type info
      expect(capturedPrompt).toContain('Requirement');
      expect(capturedPrompt).toContain('A system requirement');
      expect(capturedPrompt).toContain('priority*'); // Required field marked
      expect(capturedPrompt).toContain('status');
    });

    it('should include relationship type schemas in prompt', async () => {
      let capturedPrompt = '';
      mockToolModelInvoke.mockImplementation((prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve({ content: '', tool_calls: [] });
      });

      await provider.extractEntities(
        'Document content',
        'Base extraction prompt',
        {
          objectSchemas: { Feature: {} },
          relationshipSchemas: {
            DEPENDS_ON: {
              description: 'Indicates a dependency between entities',
              source_types: ['Feature', 'Component'],
              target_types: ['Component', 'Service'],
            },
          },
        }
      );

      // Verify prompt includes relationship type info
      expect(capturedPrompt).toContain('DEPENDS_ON');
      expect(capturedPrompt).toContain(
        'Indicates a dependency between entities'
      );
      expect(capturedPrompt).toContain('Feature, Component');
    });

    it('should include existing entities in prompt for UUID reference', async () => {
      let capturedPrompt = '';
      mockToolModelInvoke.mockImplementation((prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve({ content: '', tool_calls: [] });
      });

      await provider.extractEntities(
        'Document content',
        'Base extraction prompt',
        {
          objectSchemas: { Feature: {} },
          relationshipSchemas: { REQUIRES: {} },
          existingEntities: [
            { id: 'uuid-123', name: 'Auth System', type_name: 'Component' },
            { id: 'uuid-456', name: 'User Database', type_name: 'Component' },
          ],
        }
      );

      // Verify existing entities are listed for reference
      expect(capturedPrompt).toContain('Existing Objects in Knowledge Graph');
      expect(capturedPrompt).toContain('Auth System');
      expect(capturedPrompt).toContain('uuid-123');
      expect(capturedPrompt).toContain('User Database');
      expect(capturedPrompt).toContain('uuid-456');
    });
  });
});
