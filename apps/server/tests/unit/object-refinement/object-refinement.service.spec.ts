import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObjectRefinementService } from '../../../src/modules/object-refinement/object-refinement.service';
import { NotFoundException } from '@nestjs/common';
import {
  RefinementContext,
  RefinementSuggestion,
  PropertyChangeSuggestion,
  RenameSuggestion,
  RelationshipAddSuggestion,
  RelationshipRemoveSuggestion,
} from '../../../src/modules/object-refinement/object-refinement.types';

// --- Test Doubles ---------------------------------------------------------

function createMockConversationRepo() {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    save: vi.fn().mockImplementation(async (entity: any) => ({
      ...entity,
      id: entity.id || '123e4567-e89b-12d3-a456-426614174000',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    create: vi.fn().mockImplementation((data: any) => ({
      ...data,
      id: '123e4567-e89b-12d3-a456-426614174000',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
  };
}

function createMockMessageRepo() {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    save: vi.fn().mockImplementation(async (entity: any) => ({
      ...entity,
      id: entity.id || '223e4567-e89b-12d3-a456-426614174000',
      createdAt: new Date(),
    })),
    create: vi.fn().mockImplementation((data: any) => ({
      ...data,
      id: '223e4567-e89b-12d3-a456-426614174000',
      createdAt: new Date(),
    })),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
}

function createMockGraphObjectRepo() {
  return {
    findOne: vi.fn(),
  };
}

function createMockDatabaseService() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
}

function createMockContextAssembler() {
  return {
    assembleContext: vi.fn().mockResolvedValue({
      object: {
        id: 'obj-123',
        type: 'Person',
        key: 'person-1',
        properties: { name: 'John Doe' },
        labels: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      relationships: [],
      sourceChunks: [],
    }),
  };
}

function createMockPromptBuilder() {
  return {
    buildSystemPrompt: vi.fn().mockReturnValue('System prompt for refinement'),
  };
}

function createMockGraphService() {
  return {
    patchObject: vi.fn().mockResolvedValue({
      id: 'obj-123',
      version: 2,
    }),
    createRelationship: vi.fn().mockResolvedValue({
      id: 'rel-123',
    }),
    deleteRelationship: vi.fn().mockResolvedValue(undefined),
  };
}

interface BuildOverrides {
  conversationRepo?: ReturnType<typeof createMockConversationRepo>;
  messageRepo?: ReturnType<typeof createMockMessageRepo>;
  graphObjectRepo?: ReturnType<typeof createMockGraphObjectRepo>;
  db?: ReturnType<typeof createMockDatabaseService>;
  contextAssembler?: ReturnType<typeof createMockContextAssembler>;
  promptBuilder?: ReturnType<typeof createMockPromptBuilder>;
  graphService?: ReturnType<typeof createMockGraphService>;
}

function build(overrides?: BuildOverrides) {
  const conversationRepo =
    overrides?.conversationRepo ?? createMockConversationRepo();
  const messageRepo = overrides?.messageRepo ?? createMockMessageRepo();
  const graphObjectRepo =
    overrides?.graphObjectRepo ?? createMockGraphObjectRepo();
  const db = overrides?.db ?? createMockDatabaseService();
  const contextAssembler =
    overrides?.contextAssembler ?? createMockContextAssembler();
  const promptBuilder = overrides?.promptBuilder ?? createMockPromptBuilder();
  const graphService = overrides?.graphService ?? createMockGraphService();

  const service = new ObjectRefinementService(
    conversationRepo as any,
    messageRepo as any,
    graphObjectRepo as any,
    db as any,
    contextAssembler as any,
    promptBuilder as any,
    graphService as any
  );

  return {
    service,
    conversationRepo,
    messageRepo,
    graphObjectRepo,
    db,
    contextAssembler,
    promptBuilder,
    graphService,
  };
}

// --- Tests ----------------------------------------------------------------

describe('ObjectRefinementService (unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------- getOrCreateConversation ----------
  describe('getOrCreateConversation', () => {
    it('throws NotFoundException when object does not exist', async () => {
      const { service, graphObjectRepo } = build();
      graphObjectRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getOrCreateConversation(
          'non-existent-id',
          'project-1',
          'user-1'
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a new conversation when none exists for the object', async () => {
      const { service, graphObjectRepo, conversationRepo, messageRepo } =
        build();

      // Object exists
      graphObjectRepo.findOne.mockResolvedValue({
        id: 'obj-123',
        type: 'Person',
        properties: { name: 'John Doe' },
      });

      // No existing conversation
      conversationRepo.findOne.mockResolvedValue(null);

      // Message count = 0
      messageRepo.count.mockResolvedValue(0);

      const result = await service.getOrCreateConversation(
        'obj-123',
        'project-1',
        'user-1'
      );

      expect(result).toMatchObject({
        objectId: 'obj-123',
        title: 'Refinement: John Doe (Person)',
        messageCount: 0,
      });
      expect(conversationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Refinement: John Doe (Person)',
          objectId: 'obj-123',
          projectId: 'project-1',
          ownerUserId: 'user-1',
          isPrivate: false,
        })
      );
      expect(conversationRepo.save).toHaveBeenCalled();
    });

    it('returns existing conversation when one exists for the object', async () => {
      const { service, graphObjectRepo, conversationRepo, messageRepo } =
        build();

      // Object exists
      graphObjectRepo.findOne.mockResolvedValue({
        id: 'obj-123',
        type: 'Person',
        properties: { name: 'John Doe' },
      });

      // Existing conversation found
      const existingConv = {
        id: 'conv-existing',
        objectId: 'obj-123',
        projectId: 'project-1',
        title: 'Refinement: John Doe (Person)',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };
      conversationRepo.findOne.mockResolvedValue(existingConv);

      // Message count = 5
      messageRepo.count.mockResolvedValue(5);

      const result = await service.getOrCreateConversation(
        'obj-123',
        'project-1',
        'user-1'
      );

      expect(result).toMatchObject({
        id: 'conv-existing',
        objectId: 'obj-123',
        messageCount: 5,
      });
      // Should NOT create a new conversation
      expect(conversationRepo.create).not.toHaveBeenCalled();
    });

    it('uses object key as fallback when name is not set', async () => {
      const { service, graphObjectRepo, conversationRepo, messageRepo } =
        build();

      graphObjectRepo.findOne.mockResolvedValue({
        id: 'obj-456',
        type: 'Document',
        properties: { key: 'doc-key-123' },
      });
      conversationRepo.findOne.mockResolvedValue(null);
      messageRepo.count.mockResolvedValue(0);

      const result = await service.getOrCreateConversation(
        'obj-456',
        'project-1',
        'user-1'
      );

      expect(result.title).toBe('Refinement: doc-key-123 (Document)');
    });

    it('uses truncated object ID as fallback when neither name nor key is set', async () => {
      const { service, graphObjectRepo, conversationRepo, messageRepo } =
        build();

      graphObjectRepo.findOne.mockResolvedValue({
        id: '12345678-abcd-1234-abcd-123456789012',
        type: 'Unknown',
        properties: {},
      });
      conversationRepo.findOne.mockResolvedValue(null);
      messageRepo.count.mockResolvedValue(0);

      const result = await service.getOrCreateConversation(
        '12345678-abcd-1234-abcd-123456789012',
        'project-1',
        'user-1'
      );

      expect(result.title).toBe('Refinement: 12345678 (Unknown)');
    });
  });

  // ---------- getConversation ----------
  describe('getConversation', () => {
    it('returns null when conversation does not exist', async () => {
      const { service, conversationRepo } = build();
      conversationRepo.findOne.mockResolvedValue(null);

      const result = await service.getConversation('conv-missing', 'user-1');
      expect(result).toBeNull();
    });

    it('returns null when conversation has no objectId (not a refinement conversation)', async () => {
      const { service, conversationRepo } = build();
      conversationRepo.findOne.mockResolvedValue({
        id: 'conv-123',
        objectId: null, // Not a refinement conversation
      });

      const result = await service.getConversation('conv-123', 'user-1');
      expect(result).toBeNull();
    });

    it('returns null when private conversation owned by different user', async () => {
      const { service, conversationRepo } = build();
      conversationRepo.findOne.mockResolvedValue({
        id: 'conv-private',
        objectId: 'obj-123',
        isPrivate: true,
        ownerUserId: 'owner-1',
        title: 'Private Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getConversation(
        'conv-private',
        'user-different'
      );
      expect(result).toBeNull();
    });

    it('returns conversation when public', async () => {
      const { service, conversationRepo, messageRepo } = build();
      conversationRepo.findOne.mockResolvedValue({
        id: 'conv-public',
        objectId: 'obj-123',
        isPrivate: false,
        ownerUserId: 'owner-1',
        title: 'Public Chat',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });
      messageRepo.count.mockResolvedValue(3);

      const result = await service.getConversation('conv-public', 'any-user');

      expect(result).toMatchObject({
        id: 'conv-public',
        objectId: 'obj-123',
        title: 'Public Chat',
        messageCount: 3,
      });
    });

    it('returns conversation when private but user is owner', async () => {
      const { service, conversationRepo, messageRepo } = build();
      conversationRepo.findOne.mockResolvedValue({
        id: 'conv-private',
        objectId: 'obj-123',
        isPrivate: true,
        ownerUserId: 'owner-1',
        title: 'My Private Chat',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      messageRepo.count.mockResolvedValue(1);

      const result = await service.getConversation('conv-private', 'owner-1');

      expect(result).toMatchObject({
        id: 'conv-private',
        objectId: 'obj-123',
        title: 'My Private Chat',
      });
    });
  });

  // ---------- assembleContext & buildSystemPrompt (delegation) ----------
  describe('assembleContext', () => {
    it('delegates to RefinementContextAssembler', async () => {
      const { service, contextAssembler } = build();

      const result = await service.assembleContext('obj-123');

      expect(contextAssembler.assembleContext).toHaveBeenCalledWith('obj-123');
      expect(result.object.id).toBe('obj-123');
    });
  });

  describe('buildSystemPrompt', () => {
    it('delegates to RefinementPromptBuilder', () => {
      const { service, promptBuilder } = build();

      const context: RefinementContext = {
        object: {
          id: 'obj-123',
          type: 'Person',
          key: null,
          properties: { name: 'Test' },
          labels: [],
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        relationships: [],
        sourceChunks: [],
      };

      const result = service.buildSystemPrompt(context);

      expect(promptBuilder.buildSystemPrompt).toHaveBeenCalledWith(context);
      expect(result).toBe('System prompt for refinement');
    });
  });

  // ---------- getMessages ----------
  describe('getMessages', () => {
    it('returns empty array when no messages', async () => {
      const { service, messageRepo } = build();
      messageRepo.find.mockResolvedValue([]);

      const result = await service.getMessages('conv-123');

      expect(result).toEqual([]);
      expect(messageRepo.find).toHaveBeenCalledWith({
        where: { conversationId: 'conv-123' },
        order: { createdAt: 'ASC' },
      });
    });

    it('returns messages with metadata mapped correctly', async () => {
      const { service, messageRepo } = build();
      const now = new Date();
      messageRepo.find.mockResolvedValue([
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          citations: { isRefinement: true, userId: 'user-1' },
          createdAt: now,
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi there',
          citations: {
            isRefinement: true,
            suggestions: [
              {
                type: 'rename',
                oldName: 'John',
                newName: 'Jonathan',
                explanation: 'Full name',
              },
            ],
            suggestionStatuses: [{ index: 0, status: 'pending' }],
          },
          createdAt: now,
        },
      ]);

      const result = await service.getMessages('conv-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        userId: 'user-1',
      });
      expect(result[1]).toMatchObject({
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there',
      });
      expect(result[1].metadata?.suggestions).toHaveLength(1);
      expect(result[1].metadata?.suggestionStatuses?.[0].status).toBe(
        'pending'
      );
    });
  });

  // ---------- saveUserMessage ----------
  describe('saveUserMessage', () => {
    it('creates and saves user message with refinement metadata', async () => {
      const { service, messageRepo, conversationRepo } = build();

      const result = await service.saveUserMessage(
        'conv-123',
        'What improvements can be made?',
        'user-1'
      );

      expect(messageRepo.create).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'user',
        content: 'What improvements can be made?',
        citations: { isRefinement: true, userId: 'user-1' },
      });
      expect(messageRepo.save).toHaveBeenCalled();
      expect(conversationRepo.update).toHaveBeenCalledWith('conv-123', {
        updatedAt: expect.any(Date),
      });
      expect(result).toBeDefined();
    });
  });

  // ---------- saveAssistantMessage ----------
  describe('saveAssistantMessage', () => {
    it('creates assistant message without suggestions', async () => {
      const { service, messageRepo, conversationRepo } = build();

      await service.saveAssistantMessage('conv-123', 'Here are my thoughts...');

      expect(messageRepo.create).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'assistant',
        content: 'Here are my thoughts...',
        citations: { isRefinement: true },
      });
      expect(messageRepo.save).toHaveBeenCalled();
      expect(conversationRepo.update).toHaveBeenCalledWith('conv-123', {
        updatedAt: expect.any(Date),
      });
    });

    it('creates assistant message with suggestions and pending statuses', async () => {
      const { service, messageRepo } = build();

      const suggestions: RefinementSuggestion[] = [
        {
          type: 'property_change',
          propertyKey: 'description',
          oldValue: 'Old desc',
          newValue: 'New desc',
          explanation: 'More detailed description',
        },
        {
          type: 'rename',
          oldName: 'John',
          newName: 'Jonathan',
          explanation: 'Use full name',
        },
      ];

      await service.saveAssistantMessage(
        'conv-123',
        'I suggest these changes:',
        suggestions,
        5
      );

      expect(messageRepo.create).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'assistant',
        content: 'I suggest these changes:',
        citations: {
          isRefinement: true,
          suggestions,
          suggestionStatuses: [
            { index: 0, status: 'pending' },
            { index: 1, status: 'pending' },
          ],
          objectVersion: 5,
        },
      });
    });

    it('does not add suggestion metadata when suggestions array is empty', async () => {
      const { service, messageRepo } = build();

      await service.saveAssistantMessage(
        'conv-123',
        'No suggestions needed',
        [],
        3
      );

      expect(messageRepo.create).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        role: 'assistant',
        content: 'No suggestions needed',
        citations: {
          isRefinement: true,
          objectVersion: 3,
        },
      });
    });
  });

  // ---------- applySuggestion ----------
  describe('applySuggestion', () => {
    it('returns error when message not found', async () => {
      const { service, messageRepo } = build();
      messageRepo.findOne.mockResolvedValue(null);

      const result = await service.applySuggestion(
        'obj-123',
        'msg-missing',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({ success: false, error: 'Message not found' });
    });

    it('returns error when suggestion index not found', async () => {
      const { service, messageRepo } = build();
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        citations: { suggestions: [] },
      });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({ success: false, error: 'Suggestion not found' });
    });

    it('returns error when suggestion already applied', async () => {
      const { service, messageRepo } = build();
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        citations: {
          suggestions: [
            { type: 'rename', oldName: 'A', newName: 'B', explanation: 'Test' },
          ],
          suggestionStatuses: [{ index: 0, status: 'accepted' }],
        },
      });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({
        success: false,
        error: 'Suggestion already applied',
      });
    });

    it('returns error when object not found', async () => {
      const { service, messageRepo, graphObjectRepo } = build();
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        citations: {
          suggestions: [
            { type: 'rename', oldName: 'A', newName: 'B', explanation: 'Test' },
          ],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValue(null);

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({ success: false, error: 'Object not found' });
    });

    it('returns error on version mismatch (optimistic locking)', async () => {
      const { service, messageRepo, graphObjectRepo } = build();
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        citations: {
          suggestions: [
            { type: 'rename', oldName: 'A', newName: 'B', explanation: 'Test' },
          ],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValue({
        id: 'obj-123',
        version: 5, // Current version is 5
        properties: {},
        projectId: 'project-1',
      });

      // Expected version is 3, but current is 5
      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        3,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({
        success: false,
        error: 'Object has been modified. Expected version 3, current is 5',
      });
    });

    it('applies property_change suggestion successfully', async () => {
      const { service, messageRepo, graphObjectRepo, graphService } = build();

      const suggestion: PropertyChangeSuggestion = {
        type: 'property_change',
        propertyKey: 'description',
        oldValue: 'Old',
        newValue: 'New description',
        explanation: 'More detail',
      };

      // First call for getting suggestion
      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-123',
        version: 1,
        properties: { description: 'Old' },
        projectId: 'project-1',
      });
      graphService.patchObject.mockResolvedValueOnce({
        id: 'obj-123',
        version: 2,
      });

      // Second call for updateSuggestionStatus
      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({
        success: true,
        newVersion: 2,
        affectedId: 'obj-123',
      });
      expect(graphService.patchObject).toHaveBeenCalledWith(
        'obj-123',
        {
          properties: {
            description: 'New description',
            _refinement_user_id: 'user-1',
            _refinement_timestamp: expect.any(String),
          },
        },
        { projectId: 'project-1' }
      );
    });

    it('applies rename suggestion successfully', async () => {
      const { service, messageRepo, graphObjectRepo, graphService } = build();

      const suggestion: RenameSuggestion = {
        type: 'rename',
        oldName: 'John',
        newName: 'Jonathan',
        explanation: 'Full name',
      };

      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-123',
        version: 1,
        properties: { name: 'John' },
        projectId: 'project-1',
      });
      graphService.patchObject.mockResolvedValueOnce({
        id: 'obj-123',
        version: 2,
      });
      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result.success).toBe(true);
      expect(graphService.patchObject).toHaveBeenCalledWith(
        'obj-123',
        {
          properties: {
            name: 'Jonathan',
            _refinement_user_id: 'user-1',
            _refinement_timestamp: expect.any(String),
          },
        },
        { projectId: 'project-1' }
      );
    });

    it('applies relationship_add suggestion successfully', async () => {
      const { service, messageRepo, graphObjectRepo, graphService, db } =
        build();

      const suggestion: RelationshipAddSuggestion = {
        type: 'relationship_add',
        relationshipType: 'KNOWS',
        targetObjectId: 'obj-456',
        targetObjectName: 'Jane',
        targetObjectType: 'Person',
        explanation: 'They know each other',
      };

      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-123',
        version: 1,
        properties: {},
        projectId: 'project-1',
      });
      // Mock project query to get org_id
      db.query.mockResolvedValueOnce({
        rows: [{ organization_id: 'org-1' }],
        rowCount: 1,
      });
      graphService.createRelationship.mockResolvedValueOnce({ id: 'rel-new' });
      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({
        success: true,
        affectedId: 'rel-new',
      });
      expect(graphService.createRelationship).toHaveBeenCalledWith(
        {
          type: 'KNOWS',
          src_id: 'obj-123',
          dst_id: 'obj-456',
          properties: {
            _refinement_user_id: 'user-1',
            _refinement_timestamp: expect.any(String),
          },
        },
        'org-1',
        'project-1'
      );
    });

    it('returns error when project not found for relationship_add', async () => {
      const { service, messageRepo, graphObjectRepo, db } = build();

      const suggestion: RelationshipAddSuggestion = {
        type: 'relationship_add',
        relationshipType: 'KNOWS',
        targetObjectId: 'obj-456',
        targetObjectName: 'Jane',
        targetObjectType: 'Person',
        explanation: 'Test',
      };

      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-123',
        version: 1,
        properties: {},
        projectId: 'project-1',
      });
      // Project not found
      db.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({ success: false, error: 'Project not found' });
    });

    it('applies relationship_remove suggestion successfully', async () => {
      const { service, messageRepo, graphObjectRepo, graphService } = build();

      const suggestion: RelationshipRemoveSuggestion = {
        type: 'relationship_remove',
        relationshipId: 'rel-to-delete',
        relationshipType: 'KNOWS',
        targetObjectId: 'obj-456',
        targetObjectName: 'Jane',
        explanation: 'No longer relevant',
      };

      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-123',
        version: 1,
        properties: {},
        projectId: 'project-1',
      });
      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [suggestion],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({
        success: true,
        affectedId: 'rel-to-delete',
      });
      expect(graphService.deleteRelationship).toHaveBeenCalledWith(
        'rel-to-delete',
        {
          projectId: 'project-1',
        }
      );
    });

    it('returns error for unknown suggestion type', async () => {
      const { service, messageRepo, graphObjectRepo } = build();

      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [{ type: 'unknown_type', explanation: 'Test' }],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });
      graphObjectRepo.findOne.mockResolvedValueOnce({
        id: 'obj-123',
        version: 1,
        properties: {},
        projectId: 'project-1',
      });

      const result = await service.applySuggestion(
        'obj-123',
        'msg-1',
        0,
        1,
        'user-1',
        'project-1'
      );

      expect(result).toEqual({
        success: false,
        error: 'Unknown suggestion type',
      });
    });
  });

  // ---------- rejectSuggestion ----------
  describe('rejectSuggestion', () => {
    it('returns error when message not found', async () => {
      const { service, messageRepo } = build();
      messageRepo.findOne.mockResolvedValue(null);

      const result = await service.rejectSuggestion('msg-missing', 0, 'user-1');

      expect(result).toEqual({ success: false, error: 'Message not found' });
    });

    it('returns error when suggestion not found', async () => {
      const { service, messageRepo } = build();
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        citations: { suggestions: [] },
      });

      const result = await service.rejectSuggestion('msg-1', 0, 'user-1');

      expect(result).toEqual({ success: false, error: 'Suggestion not found' });
    });

    it('returns error when suggestion already processed (not pending)', async () => {
      const { service, messageRepo } = build();
      messageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        citations: {
          suggestions: [
            { type: 'rename', oldName: 'A', newName: 'B', explanation: 'Test' },
          ],
          suggestionStatuses: [{ index: 0, status: 'accepted' }],
        },
      });

      const result = await service.rejectSuggestion('msg-1', 0, 'user-1');

      expect(result).toEqual({
        success: false,
        error: 'Suggestion already processed',
      });
    });

    it('successfully rejects a pending suggestion', async () => {
      const { service, messageRepo } = build();

      // First call for validation
      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [
            { type: 'rename', oldName: 'A', newName: 'B', explanation: 'Test' },
          ],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });

      // Second call for updateSuggestionStatus
      messageRepo.findOne.mockResolvedValueOnce({
        id: 'msg-1',
        citations: {
          suggestions: [
            { type: 'rename', oldName: 'A', newName: 'B', explanation: 'Test' },
          ],
          suggestionStatuses: [{ index: 0, status: 'pending' }],
        },
      });

      const result = await service.rejectSuggestion(
        'msg-1',
        0,
        'user-1',
        'Not relevant'
      );

      expect(result).toEqual({ success: true });
      expect(messageRepo.update).toHaveBeenCalledWith(
        'msg-1',
        expect.objectContaining({
          citations: expect.objectContaining({
            suggestionStatuses: expect.arrayContaining([
              expect.objectContaining({
                index: 0,
                status: 'rejected',
                reviewedBy: 'user-1',
                reviewedAt: expect.any(String),
              }),
            ]),
          }),
        })
      );
    });
  });

  // ---------- parseSuggestionsFromContent ----------
  describe('parseSuggestionsFromContent', () => {
    it('returns empty array when no suggestions block present', () => {
      const { service } = build();

      const content = 'Here are my thoughts about this object.';
      const result = service.parseSuggestionsFromContent(content);

      expect(result).toEqual([]);
    });

    it('parses single suggestions block', () => {
      const { service } = build();

      const content = `Here are my suggestions:

\`\`\`suggestions
[
  {
    "type": "rename",
    "oldName": "John",
    "newName": "Jonathan",
    "explanation": "Use full name"
  }
]
\`\`\`

Let me know if you'd like to apply these.`;

      const result = service.parseSuggestionsFromContent(content);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'rename',
        oldName: 'John',
        newName: 'Jonathan',
        explanation: 'Use full name',
      });
    });

    it('parses multiple suggestions in one block', () => {
      const { service } = build();

      const content = `\`\`\`suggestions
[
  {
    "type": "property_change",
    "propertyKey": "description",
    "oldValue": "Old",
    "newValue": "New",
    "explanation": "Better description"
  },
  {
    "type": "rename",
    "oldName": "A",
    "newName": "B",
    "explanation": "Clearer name"
  }
]
\`\`\``;

      const result = service.parseSuggestionsFromContent(content);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('property_change');
      expect(result[1].type).toBe('rename');
    });

    it('parses multiple suggestions blocks', () => {
      const { service } = build();

      const content = `First suggestion:

\`\`\`suggestions
[{"type": "rename", "oldName": "A", "newName": "B", "explanation": "First"}]
\`\`\`

Second suggestion:

\`\`\`suggestions
[{"type": "rename", "oldName": "C", "newName": "D", "explanation": "Second"}]
\`\`\``;

      const result = service.parseSuggestionsFromContent(content);

      expect(result).toHaveLength(2);
      expect(result[0].explanation).toBe('First');
      expect(result[1].explanation).toBe('Second');
    });

    it('handles invalid JSON gracefully', () => {
      const { service } = build();

      const content = `\`\`\`suggestions
this is not valid json
\`\`\``;

      const result = service.parseSuggestionsFromContent(content);

      expect(result).toEqual([]);
    });

    it('handles non-array JSON gracefully', () => {
      const { service } = build();

      const content = `\`\`\`suggestions
{"type": "rename", "oldName": "A", "newName": "B", "explanation": "Test"}
\`\`\``;

      const result = service.parseSuggestionsFromContent(content);

      expect(result).toEqual([]);
    });
  });

  // ---------- getObjectVersion ----------
  describe('getObjectVersion', () => {
    it('returns null when object not found', async () => {
      const { service, graphObjectRepo } = build();
      graphObjectRepo.findOne.mockResolvedValue(null);

      const result = await service.getObjectVersion('obj-missing');

      expect(result).toBeNull();
    });

    it('returns object version when found', async () => {
      const { service, graphObjectRepo } = build();
      graphObjectRepo.findOne.mockResolvedValue({
        id: 'obj-123',
        version: 7,
      });

      const result = await service.getObjectVersion('obj-123');

      expect(result).toBe(7);
    });

    it('queries with correct filters (not deleted, not superseded)', async () => {
      const { service, graphObjectRepo } = build();
      graphObjectRepo.findOne.mockResolvedValue({ version: 1 });

      await service.getObjectVersion('obj-123');

      expect(graphObjectRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: 'obj-123',
          deletedAt: expect.anything(), // IsNull()
          supersedesId: expect.anything(), // IsNull()
        },
        select: ['version'],
      });
    });
  });
});
