import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Res,
  Headers,
  HttpStatus,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
import { ChatRequestDto } from './dto/chat-request.dto';
import { LangGraphService } from './services/langgraph.service';
import { ConversationService } from './services/conversation.service';
import { AIMessage } from '@langchain/core/messages';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Chat UI')
@Controller('chat-ui')
export class ChatUiController {
  private readonly logger = new Logger(ChatUiController.name);

  constructor(
    private readonly langGraphService: LangGraphService,
    private readonly conversationService: ConversationService
  ) {}

  @Get('conversations')
  @ApiOkResponse({ description: 'List user conversations' })
  async getConversations(
    @CurrentUser() user: AuthenticatedUser | null,
    @Headers('x-project-id') projectId?: string,
    @Query('limit') limit?: unknown
  ) {
    const parsedLimit = limit ? parseInt(String(limit), 10) : 50;
    const safeLimit = isNaN(parsedLimit) ? 50 : parsedLimit;

    return this.conversationService.getUserConversations(
      user?.id || null,
      projectId || null,
      safeLimit
    );
  }

  @Get('conversations/:id')
  @ApiOkResponse({ description: 'Get conversation details' })
  async getConversation(
    @Param('id') id: string,
    @Headers('x-project-id') projectId?: string
  ) {
    return this.conversationService.getConversation(id, projectId);
  }

  @Get('conversations/:id/messages')
  @ApiOkResponse({ description: 'Get paginated conversation messages' })
  async getConversationMessages(
    @Param('id') id: string,
    @Headers('x-project-id') projectId?: string,
    @Query('limit') limit?: string,
    @Query('beforeId') beforeId?: string
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const safeLimit = isNaN(parsedLimit) ? 50 : Math.min(parsedLimit, 100); // Cap at 100

    return this.conversationService.getConversationMessages(
      id,
      {
        limit: safeLimit,
        beforeId: beforeId || undefined,
      },
      projectId
    );
  }

  @Patch('conversations/:id')
  @ApiOkResponse({ description: 'Update conversation title' })
  async updateConversation(
    @Param('id') id: string,
    @Headers('x-project-id') projectId?: string,
    @Body('title') title?: string
  ) {
    return this.conversationService.updateConversationTitle(
      id,
      title || '',
      projectId
    );
  }

  @Patch('conversations/:id/draft')
  @ApiOkResponse({ description: 'Update conversation draft text' })
  async updateConversationDraft(
    @Param('id') id: string,
    @Headers('x-project-id') projectId?: string,
    @Body('draftText') draftText?: string
  ) {
    return this.conversationService.updateConversationDraft(
      id,
      draftText || '',
      projectId
    );
  }

  @Patch('conversations/:id/tools')
  @ApiOkResponse({ description: 'Update conversation enabled tools' })
  async updateConversationTools(
    @Param('id') id: string,
    @Headers('x-project-id') projectId?: string,
    @Body('enabledTools') enabledTools?: string[] | null
  ) {
    return this.conversationService.updateEnabledTools(
      id,
      enabledTools ?? null,
      projectId
    );
  }

  @Delete('conversations/:id')
  @ApiOkResponse({ description: 'Delete conversation' })
  async deleteConversation(
    @Param('id') id: string,
    @Headers('x-project-id') projectId?: string
  ) {
    return this.conversationService.deleteConversation(id, projectId);
  }

  @Post()
  @ApiOkResponse({
    description: 'Streaming chat response',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          description: 'Server-sent events stream',
        },
      },
    },
  })
  async chat(
    @Body() body: ChatRequestDto,
    @CurrentUser() user: AuthenticatedUser | null,
    @Headers('x-project-id') projectId: string | undefined,
    @Res() res: ExpressResponse
  ): Promise<void> {
    const { messages, conversationId } = body;

    this.logger.log(
      `Chat request from user ${user?.id}: ${
        messages.length
      } messages, conversationId: ${conversationId || 'new'}, projectId: ${
        projectId || 'none'
      }`
    );

    // Check if LangGraph service is ready
    if (!this.langGraphService.isReady()) {
      throw new InternalServerErrorException(
        'Chat service not initialized. Check Vertex AI configuration.'
      );
    }

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== 'user') {
      throw new BadRequestException('Last message must be from user');
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(HttpStatus.OK);

    let dbConversationId: string | undefined = conversationId;
    let fullAssistantResponse = '';
    let isFirstExchange = false; // Track if this is the first exchange for title generation

    try {
      // Create or get conversation
      if (!dbConversationId) {
        // Use placeholder title - will be updated after first exchange
        const title = 'New Conversation';

        const conversation = await this.conversationService.createConversation(
          title,
          user?.id, // Save owner user ID
          projectId // Save project ID for filtering
        );
        dbConversationId = conversation.id;
        isFirstExchange = true; // Mark as first exchange

        this.logger.log(
          `Created new conversation: ${dbConversationId} for user ${user?.id} in project ${projectId}`
        );
      } else {
        // Check if this conversation has any messages yet
        // If not, this is the first exchange
        const conversation = await this.conversationService.getConversation(
          dbConversationId,
          projectId
        );
        isFirstExchange = conversation.messages.length === 0;
      }

      // Save user message to database
      await this.conversationService.addMessage(
        dbConversationId,
        'user',
        latestMessage.content,
        undefined,
        projectId
      );

      // Use conversationId as threadId for LangGraph conversation memory
      const threadId = dbConversationId;

      // Stream response from LangGraph
      const stream = await this.langGraphService.streamConversation({
        message: latestMessage.content,
        threadId,
      });

      // Process the LangGraph stream
      // LangGraph with streamMode: 'values' returns state snapshots
      for await (const chunk of stream) {
        // Extract the latest AI message from the state
        const stateMessages = chunk.messages || [];
        const lastMessage = stateMessages[stateMessages.length - 1];

        if (lastMessage && lastMessage._getType() === 'ai') {
          const aiMessage = lastMessage as AIMessage;
          const content =
            typeof aiMessage.content === 'string'
              ? aiMessage.content
              : JSON.stringify(aiMessage.content);

          // Keep track of full response for database
          fullAssistantResponse = content;

          // Stream the content character by character to match POC format
          for (let i = 0; i < content.length; i++) {
            const char = content[i];
            const delta = JSON.stringify({
              type: 'text-delta',
              textDelta: char,
            });
            res.write(`${delta}\n`);
          }
        }
      }

      // Save assistant message to database
      if (fullAssistantResponse) {
        await this.conversationService.addMessage(
          dbConversationId,
          'assistant',
          fullAssistantResponse,
          undefined,
          projectId
        );
      }

      // Send finish event with conversationId
      const finishChunk = JSON.stringify({
        type: 'finish',
        finishReason: 'stop',
        conversationId: dbConversationId,
      });
      res.write(`${finishChunk}\n`);
      res.end();

      // Generate title asynchronously after first exchange (don't await - run in background)
      if (isFirstExchange && fullAssistantResponse) {
        this.logger.log(
          `Triggering background title generation for conversation ${dbConversationId}`
        );
        // Don't await - let this run in background
        this.generateConversationTitle(
          dbConversationId,
          latestMessage.content,
          fullAssistantResponse,
          projectId
        ).catch((error: Error) => {
          this.logger.error(
            `Background title generation failed for conversation ${dbConversationId}`,
            error
          );
        });
      }
    } catch (error) {
      this.logger.error('Error streaming chat response', error);

      // If headers not sent yet, send error response
      if (!res.headersSent) {
        throw new InternalServerErrorException(
          'Failed to generate chat response'
        );
      }

      // Otherwise just end the stream
      res.end();
    }
  }

  /**
   * Generate a title for a conversation based on first user and assistant messages.
   * This runs asynchronously in the background after the first exchange.
   */
  private async generateConversationTitle(
    conversationId: string,
    userMessage: string,
    assistantMessage: string,
    projectId?: string
  ): Promise<void> {
    this.logger.log(`Generating title for conversation ${conversationId}`);

    await this.conversationService.generateAndUpdateTitle(
      conversationId,
      async (userMsg: string, assistantMsg: string) => {
        // Build prompt for title generation
        const prompt = `Generate a concise, descriptive title (max 50 characters) for a chat conversation based on these messages:

User: ${userMsg.substring(0, 300)}
Assistant: ${assistantMsg.substring(0, 300)}

Requirements:
- Maximum 50 characters
- Descriptive and specific
- No quotes or special formatting
- Capture the main topic or question

Title:`;

        // Use LangGraph service to generate title
        const generatedTitle =
          await this.langGraphService.generateSimpleResponse(prompt);

        // Clean up the response (remove quotes, trim, limit length)
        return generatedTitle
          .trim()
          .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
          .substring(0, 50);
      },
      projectId
    );
  }
}
