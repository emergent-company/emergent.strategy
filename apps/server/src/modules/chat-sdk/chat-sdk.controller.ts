import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiBody,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ChatSdkRequestDto } from './dto/chat-sdk-request.dto';
import {
  CreateConversationDto,
  CreateConversationResponseDto,
} from './dto/create-conversation.dto';
import { ToolDefinitionsResponseDto } from './dto/tool-definitions.dto';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { ChatSdkService } from './chat-sdk.service';
import { toUIMessageStream } from '@ai-sdk/langchain';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Chat SDK')
@Controller('chat-sdk')
export class ChatSdkController {
  private readonly logger = new Logger(ChatSdkController.name);

  constructor(private readonly chatSdkService: ChatSdkService) {}

  @Post('conversations')
  @ApiCreatedResponse({
    description: 'Create a new conversation',
    type: CreateConversationResponseDto,
  })
  @ApiBody({ type: CreateConversationDto })
  async createConversation(
    @Body() body: CreateConversationDto,
    @CurrentUser() user: AuthenticatedUser | null
  ): Promise<CreateConversationResponseDto> {
    this.logger.log(
      `Creating new conversation for user ${user?.id || 'anonymous'}`
    );

    const title = body.title || 'New conversation';
    const conversation = await this.chatSdkService.createConversation({
      title,
      userId: user?.id,
      projectId: body.projectId,
    });

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
    };
  }

  /**
   * Get available tool definitions for the chat UI.
   * Returns tool metadata including name, description, icon, and grouping.
   */
  @Get('tools')
  @ApiOkResponse({
    description: 'List available chat tools with metadata',
    type: ToolDefinitionsResponseDto,
  })
  getTools(): ToolDefinitionsResponseDto {
    return { tools: TOOL_DEFINITIONS };
  }

  @Post()
  @ApiOkResponse({
    description: 'Vercel AI SDK streaming chat response',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
          description: 'Vercel AI SDK UI Message protocol stream',
        },
      },
    },
  })
  @ApiBody({ type: ChatSdkRequestDto })
  async chat(
    @Body() body: ChatSdkRequestDto,
    @CurrentUser() user: AuthenticatedUser | null,
    @Res() res: Response
  ) {
    const { messages, conversationId, projectId } = body;

    this.logger.log(
      `Chat SDK request from user ${user?.id}: ${
        messages.length
      } messages, conversationId: ${conversationId || 'new'}`
    );

    // Check if service is ready
    if (!this.chatSdkService.isReady()) {
      throw new InternalServerErrorException(
        'Chat service not initialized. Check Vertex AI configuration.'
      );
    }

    // Validate messages
    if (!messages || messages.length === 0) {
      throw new BadRequestException('Messages array cannot be empty');
    }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== 'user') {
      throw new BadRequestException('Last message must be from user');
    }

    // Validate message has content (either content or parts[])
    const messageContent = latestMessage.getText();
    if (!messageContent) {
      throw new BadRequestException('Message content is empty');
    }

    try {
      // Get LangGraph stream and metadata
      const result = await this.chatSdkService.streamChat({
        messages,
        conversationId,
        userId: user?.id,
        projectId,
      });

      this.logger.log(`Streaming for conversation ${result.conversationId}`);

      // Convert LangGraph stream to readable stream of text chunks
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let fullResponse = '';
            for await (const chunk of result.langGraphStream) {
              // Extract the latest AI message from the LangGraph state
              const stateMessages = chunk.messages || [];
              const lastMessage = stateMessages[stateMessages.length - 1];

              if (
                lastMessage &&
                lastMessage._getType &&
                lastMessage._getType() === 'ai'
              ) {
                const content =
                  typeof lastMessage.content === 'string'
                    ? lastMessage.content
                    : JSON.stringify(lastMessage.content);

                // Enqueue the full content
                controller.enqueue(content);
                fullResponse = content;
              }
            }

            // Save assistant message
            await result.onComplete(fullResponse);
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      // Convert to Vercel AI SDK UIMessage stream format
      const uiMessageStream = toUIMessageStream(readableStream);

      // Set headers for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Set conversation ID header so frontend can update state before streaming
      res.setHeader('X-Conversation-Id', result.conversationId);

      // Stream to response
      const reader = uiMessageStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Write UIMessageChunk as JSON
          res.write(`data: ${JSON.stringify(value)}\n\n`);
        }
        res.end();
      } catch (error) {
        this.logger.error('Error streaming response', error);
        res.end();
      }
    } catch (error) {
      this.logger.error('Error streaming chat SDK response', error);
      throw new InternalServerErrorException(
        'Failed to generate chat response'
      );
    }
  }
}
