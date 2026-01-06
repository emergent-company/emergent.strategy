import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatConversation } from '../../../entities/chat-conversation.entity';
import { ChatMessage } from '../../../entities/chat-message.entity';
import { DatabaseService } from '../../../common/database/database.service';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>,
    private readonly db: DatabaseService
  ) {}

  /**
   * Create a new conversation within tenant context for RLS enforcement.
   */
  async createConversation(
    title: string,
    ownerUserId?: string,
    projectId?: string
  ): Promise<ChatConversation> {
    const createFn = async () => {
      const conversation = this.conversationRepository.create({
        title,
        ownerUserId: ownerUserId || null,
        projectId: projectId || null,
        isPrivate: true,
      });

      return this.conversationRepository.save(conversation);
    };

    // Run within tenant context for RLS
    if (projectId) {
      return this.db.runWithTenantContext(projectId, createFn);
    }
    return createFn();
  }

  /**
   * Get conversation by ID with messages within tenant context.
   */
  async getConversation(
    conversationId: string,
    projectId?: string | null
  ): Promise<ChatConversation> {
    const findFn = async () => {
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
        relations: ['messages'],
        order: {
          messages: {
            createdAt: 'ASC',
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${conversationId} not found`
        );
      }

      return conversation;
    };

    // Run within tenant context for RLS if projectId provided
    if (projectId) {
      return this.db.runWithTenantContext(projectId, findFn);
    }
    return findFn();
  }

  /**
   * Get all conversations for a user (or anonymous if userId is null)
   * filtered by project within tenant context for RLS enforcement.
   */
  async getUserConversations(
    userId: string | null,
    projectId: string | null,
    limit = 50
  ): Promise<ChatConversation[]> {
    const findFn = async () => {
      const whereCondition: Record<string, any> = userId
        ? { ownerUserId: userId }
        : { ownerUserId: null };

      // Filter by project - conversations without projectId will only show when no project filter is applied
      if (projectId) {
        whereCondition.projectId = projectId;
      }

      return this.conversationRepository.find({
        where: whereCondition,
        order: { updatedAt: 'DESC' },
        take: limit,
        relations: ['messages'],
      });
    };

    // Run within tenant context for RLS
    if (projectId) {
      return this.db.runWithTenantContext(projectId, findFn);
    }
    return findFn();
  }

  /**
   * Add a message to a conversation within tenant context.
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    citations?: Record<string, any>,
    projectId?: string | null
  ): Promise<ChatMessage> {
    const addFn = async () => {
      // Verify conversation exists
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });

      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${conversationId} not found`
        );
      }

      const message = this.messageRepository.create({
        conversationId,
        role,
        content,
        citations: citations || null,
      });

      const savedMessage = await this.messageRepository.save(message);

      // Update conversation's updatedAt timestamp
      await this.conversationRepository.update(conversationId, {
        updatedAt: new Date(),
      });

      return savedMessage;
    };

    // Run within tenant context for RLS
    if (projectId) {
      return this.db.runWithTenantContext(projectId, addFn);
    }
    return addFn();
  }

  /**
   * Get paginated messages for a conversation within tenant context.
   * Uses cursor-based pagination (beforeId) for efficient loading of older messages.
   *
   * @param conversationId - The conversation ID
   * @param options - Pagination options
   * @param projectId - Project ID for tenant context
   * @returns Paginated messages with metadata
   */
  async getConversationMessages(
    conversationId: string,
    options: {
      limit?: number;
      beforeId?: string; // Cursor: get messages before this message ID
    } = {},
    projectId?: string | null
  ): Promise<{
    messages: ChatMessage[];
    hasMore: boolean;
    totalCount: number;
  }> {
    const { limit = 50, beforeId } = options;

    const findFn = async () => {
      // Verify conversation exists
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });
      if (!conversation) {
        throw new NotFoundException(
          `Conversation with ID ${conversationId} not found`
        );
      }

      // Build query with cursor-based pagination
      const queryBuilder = this.messageRepository
        .createQueryBuilder('message')
        .where('message.conversationId = :conversationId', { conversationId })
        .orderBy('message.createdAt', 'DESC')
        .take(limit + 1); // Fetch one extra to check if there are more

      if (beforeId) {
        // Get the cursor message to find its createdAt timestamp
        const cursorMessage = await this.messageRepository.findOne({
          where: { id: beforeId },
        });
        if (cursorMessage) {
          queryBuilder.andWhere('message.createdAt < :cursorDate', {
            cursorDate: cursorMessage.createdAt,
          });
        }
      }

      const messages = await queryBuilder.getMany();
      const hasMore = messages.length > limit;
      if (hasMore) {
        messages.pop(); // Remove the extra item used to check hasMore
      }

      // Get total count for UI display
      const totalCount = await this.messageRepository.count({
        where: { conversationId },
      });

      // Reverse to return in chronological order (oldest first)
      return {
        messages: messages.reverse(),
        hasMore,
        totalCount,
      };
    };

    // Run within tenant context for RLS
    if (projectId) {
      return this.db.runWithTenantContext(projectId, findFn);
    }
    return findFn();
  }

  /**
   * Get conversation history as messages array within tenant context.
   */
  async getConversationHistory(
    conversationId: string,
    projectId?: string | null
  ): Promise<Array<{ role: string; content: string; createdAt: Date }>> {
    const conversation = await this.getConversation(conversationId, projectId);
    return conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  }

  /**
   * Update conversation title within tenant context.
   */
  async updateConversationTitle(
    conversationId: string,
    title: string,
    projectId?: string | null
  ): Promise<ChatConversation> {
    const updateFn = async () => {
      const conversation = await this.getConversation(
        conversationId,
        projectId
      );
      conversation.title = title;
      return this.conversationRepository.save(conversation);
    };

    if (projectId) {
      return this.db.runWithTenantContext(projectId, updateFn);
    }
    return updateFn();
  }

  /**
   * Update conversation draft text within tenant context.
   */
  async updateConversationDraft(
    conversationId: string,
    draftText: string,
    projectId?: string | null
  ): Promise<ChatConversation> {
    const updateFn = async () => {
      const conversation = await this.getConversation(
        conversationId,
        projectId
      );
      conversation.draftText = draftText;
      return this.conversationRepository.save(conversation);
    };

    if (projectId) {
      return this.db.runWithTenantContext(projectId, updateFn);
    }
    return updateFn();
  }

  /**
   * Update enabled tools for a conversation within tenant context.
   * @param conversationId - The conversation ID
   * @param enabledTools - Array of tool names to enable, or null for all tools
   * @param projectId - Project ID for tenant context
   */
  async updateEnabledTools(
    conversationId: string,
    enabledTools: string[] | null,
    projectId?: string | null
  ): Promise<ChatConversation> {
    const updateFn = async () => {
      const conversation = await this.getConversation(
        conversationId,
        projectId
      );
      conversation.enabledTools = enabledTools;
      return this.conversationRepository.save(conversation);
    };

    if (projectId) {
      return this.db.runWithTenantContext(projectId, updateFn);
    }
    return updateFn();
  }

  /**
   * Delete conversation within tenant context.
   */
  async deleteConversation(
    conversationId: string,
    projectId?: string | null
  ): Promise<void> {
    const deleteFn = async () => {
      const result = await this.conversationRepository.delete(conversationId);
      if (result.affected === 0) {
        throw new NotFoundException(
          `Conversation with ID ${conversationId} not found`
        );
      }
    };

    if (projectId) {
      return this.db.runWithTenantContext(projectId, deleteFn);
    }
    return deleteFn();
  }

  /**
   * Generate an AI-powered title for a conversation based on its messages.
   * This method should be called asynchronously after the first exchange (user + assistant messages).
   *
   * @param conversationId - The conversation ID
   * @param generateTitleFn - Function that takes userMessage and assistantMessage and returns a title
   * @param projectId - Project ID for tenant context
   * @returns The updated conversation with new title
   */
  async generateAndUpdateTitle(
    conversationId: string,
    generateTitleFn: (
      userMessage: string,
      assistantMessage: string
    ) => Promise<string>,
    projectId?: string | null
  ): Promise<ChatConversation> {
    const updateFn = async () => {
      try {
        // Get conversation with messages
        const conversation = await this.getConversation(
          conversationId,
          projectId
        );

        // Check if we have at least 2 messages (user + assistant)
        if (conversation.messages.length < 2) {
          this.logger.warn(
            `Conversation ${conversationId} has insufficient messages for title generation (${conversation.messages.length})`
          );
          return conversation;
        }

        // Get first user message and first assistant response
        const firstUserMessage = conversation.messages.find(
          (msg) => msg.role === 'user'
        );
        const firstAssistantMessage = conversation.messages.find(
          (msg) => msg.role === 'assistant'
        );

        if (!firstUserMessage || !firstAssistantMessage) {
          this.logger.warn(
            `Conversation ${conversationId} missing user or assistant message`
          );
          return conversation;
        }

        // Generate title using provided function
        this.logger.log(`Generating title for conversation ${conversationId}`);
        const generatedTitle = await generateTitleFn(
          firstUserMessage.content,
          firstAssistantMessage.content
        );

        // Update conversation title (truncate to 100 chars to be safe)
        const finalTitle = generatedTitle.substring(0, 100);
        conversation.title = finalTitle;

        this.logger.log(
          `Generated title for conversation ${conversationId}: "${finalTitle}"`
        );

        return this.conversationRepository.save(conversation);
      } catch (error) {
        this.logger.error(
          `Failed to generate title for conversation ${conversationId}`,
          error
        );
        // Don't throw - title generation failure shouldn't break the chat
        return this.getConversation(conversationId, projectId);
      }
    };

    if (projectId) {
      return this.db.runWithTenantContext(projectId, updateFn);
    }
    return updateFn();
  }
}
