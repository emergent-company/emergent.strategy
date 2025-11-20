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
    @Query('limit') limit?: unknown
  ) {
    const parsedLimit = limit ? parseInt(String(limit), 10) : 50;
    const safeLimit = isNaN(parsedLimit) ? 50 : parsedLimit;

    return this.conversationService.getUserConversations(
      user?.id || null,
      safeLimit
    );
  }

  @Get('conversations/:id')
  @ApiOkResponse({ description: 'Get conversation details' })
  async getConversation(@Param('id') id: string) {
    // TODO: Check ownership if auth is required
    return this.conversationService.getConversation(id);
  }

  @Patch('conversations/:id')
  @ApiOkResponse({ description: 'Update conversation title' })
  async updateConversation(
    @Param('id') id: string,
    @Body('title') title: string
  ) {
    return this.conversationService.updateConversationTitle(id, title);
  }

  @Delete('conversations/:id')
  @ApiOkResponse({ description: 'Delete conversation' })
  async deleteConversation(@Param('id') id: string) {
    return this.conversationService.deleteConversation(id);
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
    @Res() res: ExpressResponse
  ): Promise<void> {
    const { messages, conversationId } = body;

    this.logger.log(
      `Chat request from user ${user?.id}: ${
        messages.length
      } messages, conversationId: ${conversationId || 'new'}`
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

    try {
      // Create or get conversation
      if (!dbConversationId) {
        // Generate a title from the first message (truncate to 100 chars)
        const title =
          latestMessage.content.substring(0, 100) +
          (latestMessage.content.length > 100 ? '...' : '');

        const conversation = await this.conversationService.createConversation(
          title,
          user?.id // Save owner user ID
        );
        dbConversationId = conversation.id;

        this.logger.log(
          `Created new conversation: ${dbConversationId} for user ${user?.id}`
        );
      }

      // Save user message to database
      await this.conversationService.addMessage(
        dbConversationId,
        'user',
        latestMessage.content
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
          fullAssistantResponse
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
}
