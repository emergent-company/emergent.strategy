import {
  Controller,
  Post,
  Body,
  HttpStatus,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { ChatSdkRequestDto } from './dto/chat-sdk-request.dto';
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
    const { messages, conversationId } = body;

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

    try {
      // Get LangGraph stream and metadata
      const result = await this.chatSdkService.streamChat({
        messages,
        conversationId,
        userId: user?.id,
      });

      this.logger.log(
        `Streaming for conversation ${result.conversationId}`
      );

      // Convert LangGraph stream to readable stream
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            let fullResponse = '';
            for await (const chunk of result.langGraphStream) {
              // Extract message content from LangGraph chunk
              if (chunk?.agent?.messages) {
                const messages = chunk.agent.messages;
                for (const msg of messages) {
                  if (msg.content) {
                    controller.enqueue(msg.content);
                    fullResponse += msg.content;
                  }
                }
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
