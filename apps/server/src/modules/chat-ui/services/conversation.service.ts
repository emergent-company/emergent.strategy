import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatConversation } from '../../../entities/chat-conversation.entity';
import { ChatMessage } from '../../../entities/chat-message.entity';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepository: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messageRepository: Repository<ChatMessage>
  ) {}

  /**
   * Create a new conversation
   */
  async createConversation(
    title: string,
    ownerUserId?: string,
    projectId?: string
  ): Promise<ChatConversation> {
    const conversation = this.conversationRepository.create({
      title,
      ownerUserId: ownerUserId || null,
      projectId: projectId || null,
      isPrivate: true,
    });

    return this.conversationRepository.save(conversation);
  }

  /**
   * Get conversation by ID with messages
   */
  async getConversation(conversationId: string): Promise<ChatConversation> {
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
  }

  /**
   * Get all conversations for a user (or anonymous if userId is null)
   */
  async getUserConversations(
    userId: string | null,
    limit = 50
  ): Promise<ChatConversation[]> {
    const whereCondition = userId
      ? { ownerUserId: userId }
      : { ownerUserId: null };

    return this.conversationRepository.find({
      where: whereCondition as any, // TypeORM handling for null
      order: { updatedAt: 'DESC' },
      take: limit,
      relations: ['messages'],
    });
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    citations?: Record<string, any>
  ): Promise<ChatMessage> {
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
  }

  /**
   * Get conversation history as messages array
   */
  async getConversationHistory(
    conversationId: string
  ): Promise<Array<{ role: string; content: string }>> {
    const conversation = await this.getConversation(conversationId);
    return conversation.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(
    conversationId: string,
    title: string
  ): Promise<ChatConversation> {
    const conversation = await this.getConversation(conversationId);
    conversation.title = title;
    return this.conversationRepository.save(conversation);
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const result = await this.conversationRepository.delete(conversationId);
    if (result.affected === 0) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`
      );
    }
  }
}
