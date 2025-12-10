import { Test, TestingModule } from '@nestjs/testing';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import {
  ExtractionPromptProvider,
  PromptResult,
} from '../../../src/modules/extraction-jobs/llm/langgraph/prompts/prompt-provider.service';
import { LangfuseService } from '../../../src/modules/langfuse/langfuse.service';
import { EXTRACTION_PROMPT_NAMES } from '../../../src/modules/langfuse/prompts/types';

describe('ExtractionPromptProvider', () => {
  let provider: ExtractionPromptProvider;
  let mockLangfuseService: {
    isPromptManagementAvailable: Mock;
    getTextPrompt: Mock;
    compilePrompt: Mock;
  };

  const mockObjectSchemas = {
    Person: {
      description: 'A person entity',
      properties: {
        name: { type: 'string', description: 'Full name' },
        age: { type: 'number', description: 'Age in years' },
      },
      required: ['name'],
    },
    Location: {
      description: 'A location entity',
      properties: {
        name: { type: 'string', description: 'Location name' },
        type: { type: 'string', enum: ['city', 'country', 'region'] },
      },
      required: ['name', 'type'],
    },
  };

  const mockRelationshipSchemas = {
    LOCATED_IN: {
      description: 'Entity is located within another entity',
      source_types: ['Person'],
      target_types: ['Location'],
    },
    KNOWS: {
      description: 'Person knows another person',
      source_types: ['Person'],
      target_types: ['Person'],
    },
  };

  beforeEach(async () => {
    mockLangfuseService = {
      isPromptManagementAvailable: vi.fn(),
      getTextPrompt: vi.fn(),
      compilePrompt: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionPromptProvider,
        {
          provide: LangfuseService,
          useValue: mockLangfuseService,
        },
      ],
    }).compile();

    provider = module.get<ExtractionPromptProvider>(ExtractionPromptProvider);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(provider).toBeDefined();
    });

    it('should report Langfuse availability correctly when enabled', () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(true);
      expect(provider.isLangfuseAvailable()).toBe(true);
    });

    it('should report Langfuse availability correctly when disabled', () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(false);
      expect(provider.isLangfuseAvailable()).toBe(false);
    });
  });

  describe('getEntityExtractorPrompt', () => {
    const documentText = 'John lives in New York City.';
    const allowedTypes = ['Person', 'Location'];

    it('should return Langfuse prompt when available', async () => {
      const mockPrompt = {
        name: EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR,
        version: 3,
        labels: ['production'],
        prompt: 'Langfuse template with {{documentText}}',
        compile: vi.fn(),
      };

      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(true);
      mockLangfuseService.getTextPrompt.mockResolvedValue(mockPrompt);
      mockLangfuseService.compilePrompt.mockReturnValue(
        'Compiled prompt with document text'
      );

      const result = await provider.getEntityExtractorPrompt(
        documentText,
        mockObjectSchemas,
        allowedTypes
      );

      expect(result.fromLangfuse).toBe(true);
      expect(result.version).toBe(3);
      expect(result.labels).toEqual(['production']);
      expect(result.langfusePrompt).toBe(mockPrompt);
      expect(mockLangfuseService.getTextPrompt).toHaveBeenCalledWith(
        EXTRACTION_PROMPT_NAMES.ENTITY_EXTRACTOR,
        undefined
      );
    });

    it('should fall back to local prompt when Langfuse is disabled', async () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(false);

      const result = await provider.getEntityExtractorPrompt(
        documentText,
        mockObjectSchemas,
        allowedTypes
      );

      expect(result.fromLangfuse).toBe(false);
      expect(result.version).toBeUndefined();
      expect(result.langfusePrompt).toBeUndefined();
      // Should contain the local prompt content
      expect(result.prompt).toContain('expert knowledge graph builder');
      expect(result.prompt).toContain('Person, Location');
    });

    it('should fall back to local prompt when Langfuse returns null', async () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(true);
      mockLangfuseService.getTextPrompt.mockResolvedValue(null);

      const result = await provider.getEntityExtractorPrompt(
        documentText,
        mockObjectSchemas,
        allowedTypes
      );

      expect(result.fromLangfuse).toBe(false);
      expect(result.prompt).toContain('expert knowledge graph builder');
    });

    it('should fall back to local prompt on Langfuse API error', async () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(true);
      mockLangfuseService.getTextPrompt.mockRejectedValue(
        new Error('Network error')
      );

      const result = await provider.getEntityExtractorPrompt(
        documentText,
        mockObjectSchemas,
        allowedTypes
      );

      expect(result.fromLangfuse).toBe(false);
      expect(result.prompt).toContain('expert knowledge graph builder');
    });

    it('should use all schema keys when allowedTypes is not provided', async () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(false);

      const result = await provider.getEntityExtractorPrompt(
        documentText,
        mockObjectSchemas
        // no allowedTypes
      );

      expect(result.prompt).toContain('Person');
      expect(result.prompt).toContain('Location');
    });
  });

  describe('getRelationshipBuilderPrompt', () => {
    const documentText = 'John lives in New York City.';
    const entities = [
      {
        temp_id: 'person_john',
        name: 'John',
        type: 'Person',
        description: 'A person named John',
        properties: {},
      },
      {
        temp_id: 'location_nyc',
        name: 'New York City',
        type: 'Location',
        description: 'A city in the United States',
        properties: {},
      },
    ];

    it('should return Langfuse prompt when available', async () => {
      const mockPrompt = {
        name: EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER,
        version: 2,
        labels: ['production', 'v2'],
        prompt: 'Relationship template with {{entities}}',
        compile: vi.fn(),
      };

      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(true);
      mockLangfuseService.getTextPrompt.mockResolvedValue(mockPrompt);
      mockLangfuseService.compilePrompt.mockReturnValue(
        'Compiled relationship prompt'
      );

      const result = await provider.getRelationshipBuilderPrompt(
        documentText,
        entities,
        mockRelationshipSchemas
      );

      expect(result.fromLangfuse).toBe(true);
      expect(result.version).toBe(2);
      expect(result.labels).toEqual(['production', 'v2']);
      expect(mockLangfuseService.getTextPrompt).toHaveBeenCalledWith(
        EXTRACTION_PROMPT_NAMES.RELATIONSHIP_BUILDER,
        undefined
      );
    });

    it('should fall back to local prompt when Langfuse is disabled', async () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(false);

      const result = await provider.getRelationshipBuilderPrompt(
        documentText,
        entities,
        mockRelationshipSchemas
      );

      expect(result.fromLangfuse).toBe(false);
      // Should contain local prompt content
      expect(result.prompt).toContain('expert at finding connections');
      expect(result.prompt).toContain('person_john');
      expect(result.prompt).toContain('location_nyc');
    });

    it('should handle orphan temp_ids in prompt', async () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(false);

      const result = await provider.getRelationshipBuilderPrompt(
        documentText,
        entities,
        mockRelationshipSchemas,
        undefined,
        ['person_john'] // orphan
      );

      expect(result.prompt).toContain('PRIORITY');
      expect(result.prompt).toContain('person_john');
    });
  });

  describe('getEntityExtractorRetryPrompt', () => {
    it('should always return local prompt (retry prompts are too dynamic)', async () => {
      mockLangfuseService.isPromptManagementAvailable.mockReturnValue(true);

      const result = await provider.getEntityExtractorRetryPrompt(
        'Document text',
        [
          {
            temp_id: 'entity_1',
            name: 'Entity',
            type: 'Thing',
            description: '',
            properties: {},
          },
        ],
        ['entity_1'],
        'Please fix orphans'
      );

      // Retry prompts should always be local
      expect(result.fromLangfuse).toBe(false);
      expect(result.prompt).toContain('Retry');
      expect(result.prompt).toContain('entity_1');
    });
  });

  describe('system prompts', () => {
    it('should return local entity extractor system prompt', async () => {
      const result = await provider.getEntityExtractorSystemPrompt();

      expect(result.fromLangfuse).toBe(false);
      expect(result.prompt).toContain('expert knowledge graph builder');
    });

    it('should return local relationship builder system prompt', async () => {
      const result = await provider.getRelationshipBuilderSystemPrompt();

      expect(result.fromLangfuse).toBe(false);
      expect(result.prompt).toContain('expert at finding connections');
    });
  });

  describe('without LangfuseService', () => {
    it('should work without LangfuseService (optional dependency)', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [ExtractionPromptProvider],
      }).compile();

      const providerWithoutLangfuse = module.get<ExtractionPromptProvider>(
        ExtractionPromptProvider
      );

      expect(providerWithoutLangfuse.isLangfuseAvailable()).toBe(false);

      const result = await providerWithoutLangfuse.getEntityExtractorPrompt(
        'Test document',
        mockObjectSchemas,
        ['Person']
      );

      expect(result.fromLangfuse).toBe(false);
      expect(result.prompt).toContain('expert knowledge graph builder');
    });
  });
});
