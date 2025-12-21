import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response as ExpressResponse } from 'express';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { Task } from '../../entities/task.entity';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { DatabaseService } from '../../common/database/database.service';
import { AIMessage } from '@langchain/core/messages';
import {
  MergeChatConversationDto,
  MergeChatMessageDto,
  MergeChatSuggestionDto,
  MergePreviewDto,
  MergeChatLoadResponseDto,
  ApplyMergeSuggestionResultDto,
  MergeSuggestionType,
} from './dto/merge-chat.dto';
import { MergeObjectContext } from './merge-suggestion.types';

interface ParsedSuggestion {
  type: MergeSuggestionType;
  propertyKey: string;
  explanation: string;
  sourceValue: unknown;
  targetValue: unknown;
  suggestedValue: unknown;
}

/**
 * Service for managing merge chat conversations.
 *
 * Provides streaming chat functionality for AI-assisted merging of objects,
 * including suggestion generation, application, and rejection.
 */
@Injectable()
export class MergeChatService {
  private readonly logger = new Logger(MergeChatService.name);

  // In-memory storage for applied suggestions per task
  // In production, this could be stored in the database
  private appliedSuggestions: Map<string, Map<string, MergeChatSuggestionDto>> =
    new Map();

  constructor(
    @InjectRepository(ChatConversation)
    private readonly conversationRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    private readonly langGraphService: LangGraphService,
    private readonly db: DatabaseService
  ) {}

  /**
   * Load or create a merge chat conversation for a task
   */
  async loadOrCreateConversation(
    taskId: string,
    userId: string | null,
    projectId: string
  ): Promise<MergeChatLoadResponseDto> {
    this.logger.log(`Loading merge chat for task ${taskId}`);

    // Get the task to verify it exists and is a merge_suggestion task
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task not found: ${taskId}`);
    }

    if (task.type !== 'merge_suggestion') {
      throw new Error(
        'Merge chat is only available for merge_suggestion tasks'
      );
    }

    const metadata = task.metadata as {
      sourceId?: string;
      targetId?: string;
      similarityPercent?: number;
    };

    if (!metadata?.sourceId || !metadata?.targetId) {
      throw new Error('Task metadata is missing sourceId or targetId');
    }

    // Try to find existing conversation for this task
    // We use a naming convention: title starts with "Merge Chat: task-{taskId}"
    let conversation = await this.conversationRepo.findOne({
      where: { title: `Merge Chat: ${taskId}` },
      relations: ['messages'],
      order: { messages: { createdAt: 'ASC' } },
    });

    if (!conversation) {
      // Create new conversation
      conversation = this.conversationRepo.create({
        title: `Merge Chat: ${taskId}`,
        ownerUserId: userId,
        projectId,
        isPrivate: false, // Merge chats are shared
      });
      conversation = await this.conversationRepo.save(conversation);
      conversation.messages = [];
      this.logger.log(
        `Created new merge chat conversation: ${conversation.id} for task ${taskId}`
      );
    }

    // Build the response
    const conversationDto: MergeChatConversationDto = {
      id: conversation.id,
      taskId,
      sourceObjectId: metadata.sourceId,
      targetObjectId: metadata.targetId,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount: conversation.messages.length,
    };

    const messages = await this.getMessagesWithSuggestions(
      conversation.id,
      taskId
    );

    // Build merge preview from applied suggestions
    const mergePreview = this.buildMergePreview(taskId);

    return {
      conversation: conversationDto,
      messages,
      mergePreview,
    };
  }

  /**
   * Get messages for a conversation with suggestion status
   */
  async getMessagesWithSuggestions(
    conversationId: string,
    taskId: string
  ): Promise<MergeChatMessageDto[]> {
    const messages = await this.messageRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    const appliedForTask = this.appliedSuggestions.get(taskId) || new Map();

    return messages.map((msg) => {
      const dto: MergeChatMessageDto = {
        id: msg.id,
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      };

      // Parse suggestions from citations if this is an assistant message
      if (msg.role === 'assistant' && msg.citations) {
        const storedSuggestions = msg.citations as {
          suggestions?: ParsedSuggestion[];
        };
        if (storedSuggestions.suggestions) {
          dto.suggestions = storedSuggestions.suggestions.map((s, idx) => {
            const key = `${msg.id}:${idx}`;
            const applied = appliedForTask.get(key);
            return {
              index: idx,
              type: s.type,
              propertyKey: s.propertyKey,
              explanation: s.explanation,
              sourceValue: s.sourceValue,
              targetValue: s.targetValue,
              suggestedValue: s.suggestedValue,
              status: applied?.status || 'pending',
            };
          });
        }
      }

      return dto;
    });
  }

  /**
   * Stream a chat response for merge assistance
   */
  async streamChatResponse(
    taskId: string,
    conversationId: string,
    userContent: string,
    sourceObjectId: string,
    targetObjectId: string,
    res: ExpressResponse
  ): Promise<void> {
    this.logger.log(
      `Streaming merge chat response for task ${taskId}, conversation ${conversationId}`
    );

    // Fetch both objects
    const [sourceObject, targetObject] = await Promise.all([
      this.fetchObject(sourceObjectId),
      this.fetchObject(targetObjectId),
    ]);

    if (!sourceObject || !targetObject) {
      this.sendSSE(res, 'error', {
        error: 'Source or target object not found',
      });
      this.sendSSE(res, 'done', {});
      res.end();
      return;
    }

    // Get the task for similarity info
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    const similarity =
      (task?.metadata as { similarityPercent?: number })?.similarityPercent ||
      0;

    // Save user message
    await this.messageRepo.save(
      this.messageRepo.create({
        conversationId,
        role: 'user',
        content: userContent,
      })
    );

    // Build system prompt with merge context
    const systemPrompt = this.buildMergeChatSystemPrompt(
      sourceObject,
      targetObject,
      similarity
    );

    // Send meta event
    this.sendSSE(res, 'meta', {
      conversationId,
      taskId,
    });

    let fullResponse = '';
    let parsedSuggestions: ParsedSuggestion[] = [];

    try {
      // Check if LangGraph is ready
      if (!this.langGraphService.isReady()) {
        this.sendSSE(res, 'error', {
          error: 'AI service not available',
        });
        this.sendSSE(res, 'done', {});
        res.end();
        return;
      }

      // Stream the response
      const stream = await this.langGraphService.streamConversation({
        message: userContent,
        threadId: `merge-chat:${conversationId}`,
        systemMessage: systemPrompt,
      });

      for await (const chunk of stream) {
        const stateMessages = chunk.messages || [];
        const lastMessage = stateMessages[stateMessages.length - 1];

        if (lastMessage && lastMessage._getType() === 'ai') {
          const aiMessage = lastMessage as AIMessage;
          const content =
            typeof aiMessage.content === 'string'
              ? aiMessage.content
              : JSON.stringify(aiMessage.content);

          // Calculate delta (new content since last chunk)
          const newContent = content.slice(fullResponse.length);
          fullResponse = content;

          // Stream tokens
          if (newContent) {
            this.sendSSE(res, 'token', { token: newContent });
          }
        }
      }

      // Try to parse suggestions from the response
      parsedSuggestions = this.parseResponseForSuggestions(
        fullResponse,
        sourceObject,
        targetObject
      );

      // Send suggestions if found
      if (parsedSuggestions.length > 0) {
        this.sendSSE(res, 'suggestions', { suggestions: parsedSuggestions });
      }

      // Save assistant message with suggestions in citations
      await this.messageRepo.save(
        this.messageRepo.create({
          conversationId,
          role: 'assistant',
          content: fullResponse,
          citations:
            parsedSuggestions.length > 0
              ? { suggestions: parsedSuggestions }
              : null,
        })
      );
    } catch (error) {
      this.logger.error('Error streaming merge chat response', error);
      this.sendSSE(res, 'error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    this.sendSSE(res, 'done', {});
    res.end();
  }

  /**
   * Apply a merge suggestion
   */
  async applySuggestion(
    taskId: string,
    messageId: string,
    suggestionIndex: number
  ): Promise<ApplyMergeSuggestionResultDto> {
    this.logger.log(
      `Applying suggestion ${suggestionIndex} from message ${messageId} for task ${taskId}`
    );

    // Get the message
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });
    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    // Get suggestions from message
    const citations = message.citations as { suggestions?: ParsedSuggestion[] };
    if (!citations?.suggestions || !citations.suggestions[suggestionIndex]) {
      return { success: false, error: 'Suggestion not found' };
    }

    const suggestion = citations.suggestions[suggestionIndex];

    // Store the applied suggestion
    if (!this.appliedSuggestions.has(taskId)) {
      this.appliedSuggestions.set(taskId, new Map());
    }

    const key = `${messageId}:${suggestionIndex}`;
    this.appliedSuggestions.get(taskId)!.set(key, {
      index: suggestionIndex,
      type: suggestion.type,
      propertyKey: suggestion.propertyKey,
      explanation: suggestion.explanation,
      sourceValue: suggestion.sourceValue,
      targetValue: suggestion.targetValue,
      suggestedValue: suggestion.suggestedValue,
      status: 'accepted',
    });

    // Build updated properties
    const preview = this.buildMergePreview(taskId);

    return {
      success: true,
      updatedProperties: preview?.suggestedProperties,
    };
  }

  /**
   * Reject a merge suggestion
   */
  async rejectSuggestion(
    taskId: string,
    messageId: string,
    suggestionIndex: number,
    _reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.log(
      `Rejecting suggestion ${suggestionIndex} from message ${messageId} for task ${taskId}`
    );

    // Get the message
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });
    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    // Get suggestions from message
    const citations = message.citations as { suggestions?: ParsedSuggestion[] };
    if (!citations?.suggestions || !citations.suggestions[suggestionIndex]) {
      return { success: false, error: 'Suggestion not found' };
    }

    const suggestion = citations.suggestions[suggestionIndex];

    // Store the rejected suggestion
    if (!this.appliedSuggestions.has(taskId)) {
      this.appliedSuggestions.set(taskId, new Map());
    }

    const key = `${messageId}:${suggestionIndex}`;
    this.appliedSuggestions.get(taskId)!.set(key, {
      index: suggestionIndex,
      type: suggestion.type,
      propertyKey: suggestion.propertyKey,
      explanation: suggestion.explanation,
      sourceValue: suggestion.sourceValue,
      targetValue: suggestion.targetValue,
      suggestedValue: suggestion.suggestedValue,
      status: 'rejected',
    });

    return { success: true };
  }

  /**
   * Build merge preview from applied suggestions
   */
  private buildMergePreview(taskId: string): MergePreviewDto | undefined {
    const applied = this.appliedSuggestions.get(taskId);
    if (!applied || applied.size === 0) {
      return undefined;
    }

    const suggestedProperties: Record<string, unknown> = {};
    const propertyDecisions: Record<string, MergeChatSuggestionDto> = {};

    for (const [, suggestion] of applied) {
      if (suggestion.status === 'accepted') {
        suggestedProperties[suggestion.propertyKey] = suggestion.suggestedValue;
        propertyDecisions[suggestion.propertyKey] = suggestion;
      }
    }

    return {
      suggestedProperties,
      propertyDecisions,
    };
  }

  /**
   * Build system prompt for merge chat
   */
  private buildMergeChatSystemPrompt(
    sourceObject: MergeObjectContext,
    targetObject: MergeObjectContext,
    similarityPercent: number
  ): string {
    return `You are an AI assistant helping to merge two similar objects in a knowledge graph.

## Context
You are analyzing two objects that are ${similarityPercent}% similar and may represent the same entity.

### Source Object (will be merged INTO target)
Type: ${sourceObject.type}
Key: ${sourceObject.key || 'none'}
Labels: ${sourceObject.labels.join(', ') || 'none'}
Properties:
${JSON.stringify(sourceObject.properties, null, 2)}

### Target Object (will RECEIVE merged properties)
Type: ${targetObject.type}
Key: ${targetObject.key || 'none'}
Labels: ${targetObject.labels.join(', ') || 'none'}
Properties:
${JSON.stringify(targetObject.properties, null, 2)}

## Your Role
Help the user decide how to merge these objects. When providing suggestions:

1. Identify which properties differ between the objects
2. Suggest whether to keep the source value, target value, combine them, or create a new value
3. Explain your reasoning clearly in natural language

## Response Format
IMPORTANT: Write your suggestions in a conversational, natural language format. Do NOT show JSON code blocks to the user.

For each property suggestion, explain in plain language:
- Which property you're addressing
- What you recommend (keep source value, keep target value, combine them, or use a new value)
- Why you're making that recommendation

After your natural language explanation, include a HIDDEN data block for the system to parse.
The hidden block MUST be placed at the very end of your response and formatted exactly like this:

<!--MERGE_DATA
{"suggestions":[{"type":"keep_source"|"keep_target"|"combine"|"new_value"|"drop_property","propertyKey":"property_name","explanation":"Brief reason","sourceValue":<value>,"targetValue":<value>,"suggestedValue":<recommended value>}]}
MERGE_DATA-->

The hidden data block will be automatically parsed to create interactive suggestion cards. Users will NOT see this block - they only see your natural language explanation.

Be conversational and helpful. Focus on clear explanations that help users understand your recommendations.`;
  }

  /**
   * Parse LLM response for merge suggestions
   */
  private parseResponseForSuggestions(
    response: string,
    sourceObject: MergeObjectContext,
    targetObject: MergeObjectContext
  ): ParsedSuggestion[] {
    // Try to find hidden MERGE_DATA block first (new format)
    const hiddenMatch = response.match(
      /<!--MERGE_DATA\s*([\s\S]*?)\s*MERGE_DATA-->/
    );
    // Fall back to JSON code block (legacy format)
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);

    const matchContent = hiddenMatch?.[1] || jsonMatch?.[1];
    if (!matchContent) {
      return [];
    }

    try {
      const parsed = JSON.parse(matchContent.trim());
      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        return [];
      }

      return parsed.suggestions.map((s: any) => ({
        type: this.normalizeSuggestionType(s.type),
        propertyKey: s.propertyKey || '',
        explanation: s.explanation || '',
        sourceValue:
          s.sourceValue !== undefined
            ? s.sourceValue
            : sourceObject.properties[s.propertyKey],
        targetValue:
          s.targetValue !== undefined
            ? s.targetValue
            : targetObject.properties[s.propertyKey],
        suggestedValue: s.suggestedValue,
      }));
    } catch (error) {
      this.logger.warn('Failed to parse suggestions from response', error);
      return [];
    }
  }

  /**
   * Normalize suggestion type string to valid type
   */
  private normalizeSuggestionType(type: string): MergeSuggestionType {
    const normalized = type?.toLowerCase()?.replace(/\s+/g, '_');
    const validTypes: MergeSuggestionType[] = [
      'property_merge',
      'keep_source',
      'keep_target',
      'combine',
      'new_value',
      'drop_property',
    ];
    return validTypes.includes(normalized as MergeSuggestionType)
      ? (normalized as MergeSuggestionType)
      : 'property_merge';
  }

  /**
   * Send an SSE event
   */
  private sendSSE(
    res: ExpressResponse,
    type: string,
    data: Record<string, unknown>
  ): void {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  /**
   * Fetch object details from database
   */
  private async fetchObject(
    objectId: string
  ): Promise<MergeObjectContext | null> {
    const sql = `
      SELECT 
        id, type, key, properties, labels, version
      FROM kb.graph_objects
      WHERE id = $1
        AND deleted_at IS NULL
    `;

    const result = await this.db.query<{
      id: string;
      type: string;
      key: string | null;
      properties: Record<string, unknown>;
      labels: string[];
      version: number;
    }>(sql, [objectId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      key: row.key,
      properties: row.properties || {},
      labels: row.labels || [],
      version: row.version,
    };
  }
}
