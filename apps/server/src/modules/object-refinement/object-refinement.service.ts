import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { GraphObject } from '../../entities/graph-object.entity';
import { DatabaseService } from '../../common/database/database.service';
import { RefinementContextAssembler } from './refinement-context-assembler.service';
import { RefinementPromptBuilder } from './refinement-prompt-builder.service';
import {
  RefinementContext,
  RefinementSuggestion,
  SuggestionStatus,
  ApplySuggestionResult,
  ObjectConversation,
} from './object-refinement.types';
import { GraphService } from '../graph/graph.service';

/**
 * Metadata stored in chat message's citations field for refinement suggestions
 */
interface RefinementMessageMetadata {
  isRefinement?: boolean;
  suggestions?: RefinementSuggestion[];
  suggestionStatuses?: {
    index: number;
    status: SuggestionStatus;
    reviewedBy?: string;
    reviewedAt?: string;
    appliedVersion?: number;
    error?: string;
  }[];
  objectVersion?: number;
  userId?: string;
}

/**
 * Service for object refinement chat functionality
 *
 * Manages conversations about specific graph objects, allowing users
 * to have AI-assisted discussions to improve object data quality.
 */
@Injectable()
export class ObjectRefinementService {
  private readonly logger = new Logger(ObjectRefinementService.name);

  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    @InjectRepository(GraphObject)
    private readonly graphObjectRepository: Repository<GraphObject>,
    private readonly db: DatabaseService,
    private readonly contextAssembler: RefinementContextAssembler,
    private readonly promptBuilder: RefinementPromptBuilder,
    private readonly graphService: GraphService
  ) {}

  /**
   * Get or create a refinement conversation for an object
   *
   * Each object has at most one active refinement conversation.
   * Conversations are tied to the canonical ID (not version ID) so they
   * persist across object patches/updates.
   * If none exists, creates a new one using upsert to handle race conditions.
   */
  async getOrCreateConversation(
    objectId: string,
    projectId: string,
    userId: string
  ): Promise<ObjectConversation> {
    // Get the HEAD object with proper tenant context
    // We use resolveHead: true to handle cases where objectId is a stale version ID
    const object = await this.graphService.getObject(
      objectId,
      { projectId },
      { resolveHead: true }
    );

    if (!object) {
      throw new NotFoundException(`Object ${objectId} not found`);
    }

    const canonicalId = object.canonical_id;

    // Try to find existing conversation for this canonical object
    let conversation = await this.conversationRepository.findOne({
      where: {
        canonicalId,
        projectId,
      },
    });

    if (!conversation) {
      // Create new conversation using upsert to handle race conditions
      const objectName =
        (object.properties?.name as string) ||
        (object.properties?.key as string) ||
        object.id.substring(0, 8);
      const title = `Refinement: ${objectName} (${object.type})`;

      try {
        // Use INSERT ... ON CONFLICT DO NOTHING to handle race conditions
        // The unique constraint is on (object_id) or (canonical_id, project_id)
        await this.conversationRepository
          .createQueryBuilder()
          .insert()
          .into(ChatConversation)
          .values({
            title,
            canonicalId,
            objectId: object.id, // Store current version for reference (deprecated)
            projectId,
            ownerUserId: userId,
            isPrivate: false, // Refinement chats are shared by default
          })
          .orIgnore() // ON CONFLICT DO NOTHING
          .execute();

        // Fetch the conversation (either just created or existing from race condition)
        conversation = await this.conversationRepository.findOne({
          where: {
            canonicalId,
            projectId,
          },
        });

        if (!conversation) {
          // This shouldn't happen, but handle it gracefully
          throw new Error(
            `Failed to create or retrieve conversation for canonical object ${canonicalId}`
          );
        }

        this.logger.log(
          `Ensured refinement conversation ${conversation.id} exists for canonical object ${canonicalId}`
        );
      } catch (error) {
        // If upsert failed, try to fetch existing conversation (may have been created by another request)
        conversation = await this.conversationRepository.findOne({
          where: {
            canonicalId,
            projectId,
          },
        });

        if (!conversation) {
          throw error;
        }
      }
    }

    // Get message count
    const messageCount = await this.messageRepository.count({
      where: { conversationId: conversation.id },
    });

    return {
      id: conversation.id,
      objectId: object.id, // Return current HEAD version ID
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount,
    };
  }

  /**
   * Get conversation by ID with authorization check
   */
  async getConversation(
    conversationId: string,
    userId: string
  ): Promise<ObjectConversation | null> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation || !conversation.objectId) {
      return null;
    }

    // Refinement conversations are not private by default,
    // but we still check if it's a private conversation owned by someone else
    if (
      conversation.isPrivate &&
      conversation.ownerUserId &&
      conversation.ownerUserId !== userId
    ) {
      return null;
    }

    const messageCount = await this.messageRepository.count({
      where: { conversationId },
    });

    return {
      id: conversation.id,
      objectId: conversation.objectId,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount,
    };
  }

  /**
   * Assemble context for an object
   * Delegates to RefinementContextAssembler
   */
  async assembleContext(objectId: string): Promise<RefinementContext> {
    return this.contextAssembler.assembleContext(objectId);
  }

  /**
   * Build system prompt for refinement chat
   */
  buildSystemPrompt(context: RefinementContext): string {
    return this.promptBuilder.buildSystemPrompt(context);
  }

  /**
   * Get messages for a conversation with suggestion statuses
   */
  async getMessages(conversationId: string): Promise<
    {
      id: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      userId?: string;
      metadata?: RefinementMessageMetadata;
      createdAt: Date;
    }[]
  > {
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    return messages.map((m) => {
      const metadata = m.citations as RefinementMessageMetadata | null;
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        userId: metadata?.userId,
        metadata: metadata || undefined,
        createdAt: m.createdAt,
      };
    });
  }

  /**
   * Save a user message
   */
  async saveUserMessage(
    conversationId: string,
    content: string,
    userId: string
  ): Promise<ChatMessage> {
    const metadata: RefinementMessageMetadata = {
      isRefinement: true,
      userId,
    };

    const message = this.messageRepository.create({
      conversationId,
      role: 'user',
      content,
      citations: metadata as any,
    });

    const saved = await this.messageRepository.save(message);

    // Update conversation timestamp
    await this.conversationRepository.update(conversationId, {
      updatedAt: new Date(),
    });

    return saved;
  }

  /**
   * Save an assistant message with optional suggestions
   */
  async saveAssistantMessage(
    conversationId: string,
    content: string,
    suggestions?: RefinementSuggestion[],
    objectVersion?: number
  ): Promise<ChatMessage> {
    const metadata: RefinementMessageMetadata = {
      isRefinement: true,
    };

    if (suggestions && suggestions.length > 0) {
      metadata.suggestions = suggestions;
      metadata.suggestionStatuses = suggestions.map((_, index) => ({
        index,
        status: 'pending' as SuggestionStatus,
      }));
    }

    if (objectVersion !== undefined) {
      metadata.objectVersion = objectVersion;
    }

    const message = this.messageRepository.create({
      conversationId,
      role: 'assistant',
      content,
      citations: metadata as any,
    });

    const saved = await this.messageRepository.save(message);

    // Update conversation timestamp
    await this.conversationRepository.update(conversationId, {
      updatedAt: new Date(),
    });

    return saved;
  }

  /**
   * Apply a suggestion to the object
   */
  async applySuggestion(
    objectId: string,
    messageId: string,
    suggestionIndex: number,
    expectedVersion: number,
    userId: string,
    projectId: string
  ): Promise<ApplySuggestionResult> {
    // Get the message and suggestion
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    const metadata = message.citations as RefinementMessageMetadata | null;
    if (!metadata?.suggestions || !metadata.suggestions[suggestionIndex]) {
      return { success: false, error: 'Suggestion not found' };
    }

    const suggestion = metadata.suggestions[suggestionIndex];

    // Check if already applied
    const existingStatus = metadata.suggestionStatuses?.find(
      (s) => s.index === suggestionIndex
    );
    if (existingStatus?.status === 'accepted') {
      return { success: false, error: 'Suggestion already applied' };
    }

    // Get current HEAD object version using graphService with proper tenant context.
    // We use resolveHead: true because the objectId might be a stale version ID from
    // when the conversation was created, but we need the current HEAD version to:
    // 1. Compare expectedVersion against the actual current version
    // 2. Apply patches to the correct version
    const currentObject = await this.graphService.getObject(
      objectId,
      { projectId },
      { resolveHead: true }
    );

    if (!currentObject) {
      return { success: false, error: 'Object not found' };
    }

    // Check version for optimistic locking against HEAD version
    if (currentObject.version !== expectedVersion) {
      return {
        success: false,
        error: `Object has been modified. Expected version ${expectedVersion}, current is ${currentObject.version}`,
      };
    }

    try {
      // Apply the suggestion based on type
      let result: ApplySuggestionResult;

      switch (suggestion.type) {
        case 'property_change':
          result = await this.applyPropertyChange(
            objectId,
            suggestion,
            userId,
            projectId
          );
          break;
        case 'rename':
          result = await this.applyRename(
            objectId,
            suggestion,
            userId,
            projectId
          );
          break;
        case 'relationship_add':
          result = await this.applyRelationshipAdd(
            objectId,
            suggestion,
            userId,
            projectId
          );
          break;
        case 'relationship_remove':
          result = await this.applyRelationshipRemove(suggestion, projectId);
          break;
        default:
          return { success: false, error: 'Unknown suggestion type' };
      }

      if (result.success) {
        // Update suggestion status in message metadata
        await this.updateSuggestionStatus(
          messageId,
          suggestionIndex,
          'accepted',
          userId,
          result.newVersion
        );
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to apply suggestion: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(
    messageId: string,
    suggestionIndex: number,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    const metadata = message.citations as RefinementMessageMetadata | null;
    if (!metadata?.suggestions || !metadata.suggestions[suggestionIndex]) {
      return { success: false, error: 'Suggestion not found' };
    }

    // Check if already processed
    const existingStatus = metadata.suggestionStatuses?.find(
      (s) => s.index === suggestionIndex
    );
    if (existingStatus?.status !== 'pending') {
      return { success: false, error: 'Suggestion already processed' };
    }

    await this.updateSuggestionStatus(
      messageId,
      suggestionIndex,
      'rejected',
      userId,
      undefined,
      reason
    );

    return { success: true };
  }

  /**
   * Update suggestion status in message metadata
   */
  private async updateSuggestionStatus(
    messageId: string,
    suggestionIndex: number,
    status: SuggestionStatus,
    userId: string,
    appliedVersion?: number,
    error?: string
  ): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) return;

    const metadata =
      (message.citations as RefinementMessageMetadata) || ({} as any);
    const statuses = metadata.suggestionStatuses || [];

    // Find or create status entry
    let statusEntry = statuses.find((s) => s.index === suggestionIndex);
    if (!statusEntry) {
      statusEntry = { index: suggestionIndex, status: 'pending' };
      statuses.push(statusEntry);
    }

    // Update status
    statusEntry.status = status;
    statusEntry.reviewedBy = userId;
    statusEntry.reviewedAt = new Date().toISOString();
    if (appliedVersion !== undefined) {
      statusEntry.appliedVersion = appliedVersion;
    }
    if (error) {
      statusEntry.error = error;
    }

    // Save updated metadata
    metadata.suggestionStatuses = statuses;
    await this.messageRepository.update(messageId, {
      citations: metadata as any,
    });
  }

  /**
   * Apply a property change suggestion
   */
  private async applyPropertyChange(
    objectId: string,
    suggestion: RefinementSuggestion & { type: 'property_change' },
    userId: string,
    projectId: string
  ): Promise<ApplySuggestionResult> {
    // Resolve to HEAD version to handle stale object IDs from conversations
    const headObjectId = await this.resolveHeadObjectId(objectId, projectId);

    const patchData = {
      properties: {
        [suggestion.propertyKey]: suggestion.newValue,
        _refinement_user_id: userId,
        _refinement_timestamp: new Date().toISOString(),
      },
    };

    const result = await this.graphService.patchObject(
      headObjectId,
      patchData,
      {
        projectId,
      }
    );

    return {
      success: true,
      newVersion: result.version,
      affectedId: result.id,
    };
  }

  /**
   * Apply a rename suggestion
   */
  private async applyRename(
    objectId: string,
    suggestion: RefinementSuggestion & { type: 'rename' },
    userId: string,
    projectId: string
  ): Promise<ApplySuggestionResult> {
    // Resolve to HEAD version to handle stale object IDs from conversations
    const headObjectId = await this.resolveHeadObjectId(objectId, projectId);

    const patchData = {
      properties: {
        name: suggestion.newName,
        _refinement_user_id: userId,
        _refinement_timestamp: new Date().toISOString(),
      },
    };

    const result = await this.graphService.patchObject(
      headObjectId,
      patchData,
      {
        projectId,
      }
    );

    return {
      success: true,
      newVersion: result.version,
      affectedId: result.id,
    };
  }

  /**
   * Apply a relationship add suggestion
   */
  private async applyRelationshipAdd(
    objectId: string,
    suggestion: RefinementSuggestion & { type: 'relationship_add' },
    userId: string,
    projectId: string
  ): Promise<ApplySuggestionResult> {
    // Resolve to HEAD version to handle stale object IDs from conversations
    const headObjectId = await this.resolveHeadObjectId(objectId, projectId);

    // Get org_id from project (required for relationship creation)
    const projectResult = await this.db.query<{ organization_id: string }>(
      `SELECT organization_id FROM kb.projects WHERE id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return { success: false, error: 'Project not found' };
    }

    const orgId = projectResult.rows[0].organization_id;

    const result = await this.graphService.createRelationship(
      {
        type: suggestion.relationshipType,
        src_id: headObjectId,
        dst_id: suggestion.targetObjectId,
        properties: {
          ...suggestion.properties,
          _refinement_user_id: userId,
          _refinement_timestamp: new Date().toISOString(),
        },
      },
      orgId,
      projectId
    );

    return {
      success: true,
      affectedId: result.id,
    };
  }

  /**
   * Apply a relationship remove suggestion
   */
  private async applyRelationshipRemove(
    suggestion: RefinementSuggestion & { type: 'relationship_remove' },
    projectId: string
  ): Promise<ApplySuggestionResult> {
    await this.graphService.deleteRelationship(suggestion.relationshipId, {
      projectId,
    });

    return {
      success: true,
      affectedId: suggestion.relationshipId,
    };
  }

  /**
   * Parse suggestions from assistant response content
   *
   * Looks for ```suggestions code blocks with JSON arrays
   */
  parseSuggestionsFromContent(content: string): RefinementSuggestion[] {
    const regex = /```suggestions\s*([\s\S]*?)```/g;
    const suggestions: RefinementSuggestion[] = [];

    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const jsonContent = match[1].trim();
        const parsed = JSON.parse(jsonContent);
        if (Array.isArray(parsed)) {
          suggestions.push(...parsed);
        }
      } catch (e) {
        this.logger.warn(`Failed to parse suggestions block: ${e}`);
      }
    }

    return suggestions;
  }

  /**
   * Get the current object version
   */
  async getObjectVersion(
    objectId: string,
    projectId?: string
  ): Promise<number | null> {
    if (projectId) {
      // Use graphService with proper tenant context when projectId is available
      // Use resolveHead to always get the HEAD version
      const object = await this.graphService.getObject(
        objectId,
        { projectId },
        { resolveHead: true }
      );
      return object?.version ?? null;
    }

    // Fallback to raw repository query (may fail with RLS if not in tenant context)
    const object = await this.graphObjectRepository.findOne({
      where: {
        id: objectId,
        deletedAt: IsNull(),
        supersedesId: IsNull(),
      },
      select: ['version'],
    });

    return object?.version ?? null;
  }

  /**
   * Resolve an object ID to its HEAD version ID.
   * This is necessary because conversations may store a stale object ID
   * if suggestions have been applied since the conversation was created.
   *
   * @param objectId Any version ID for the object
   * @param projectId Project context for RLS
   * @returns The HEAD version's ID
   */
  private async resolveHeadObjectId(
    objectId: string,
    projectId: string
  ): Promise<string> {
    const headObject = await this.graphService.getObject(
      objectId,
      { projectId },
      { resolveHead: true }
    );
    return headObject.id;
  }
}
