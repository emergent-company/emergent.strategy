import { Injectable, Logger } from '@nestjs/common';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { ConversationService } from '../chat-ui/services/conversation.service';
import { AIMessage } from '@langchain/core/messages';

export interface ChatSdkStreamOptions {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationId?: string;
  userId?: string | null;
}

export interface ChatSdkStreamResult {
  langGraphStream: AsyncIterable<any>;
  conversationId: string;
  onComplete: (fullResponse: string) => Promise<void>;
}

/**
 * Service for Vercel AI SDK-based chat implementation.
 * Uses LangGraph for orchestration and returns raw stream for conversion by controller.
 */
@Injectable()
export class ChatSdkService {
  private readonly logger = new Logger(ChatSdkService.name);

  constructor(
    private readonly langGraphService: LangGraphService,
    private readonly conversationService: ConversationService
  ) {}

  /**
   * Stream a chat response. Returns the raw LangGraph stream for conversion
   * to Vercel AI SDK format by the controller.
   */
  async streamChat(options: ChatSdkStreamOptions): Promise<ChatSdkStreamResult> {
    const { messages, conversationId, userId } = options;

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== 'user') {
      throw new Error('Last message must be from user');
    }

    // Create or get conversation
    let dbConversationId = conversationId;
    if (!dbConversationId) {
      const title =
        latestMessage.content.substring(0, 100) +
        (latestMessage.content.length > 100 ? '...' : '');
      const conversation = await this.conversationService.createConversation(
        title,
        userId || undefined
      );
      dbConversationId = conversation.id;
      this.logger.log(
        `Created new conversation: ${dbConversationId} for user ${userId || 'anonymous'}`
      );
    }

    // Save user message
    await this.conversationService.addMessage(
      dbConversationId,
      'user',
      latestMessage.content
    );

    // Get LangGraph stream
    const langGraphStream = await this.langGraphService.streamConversation({
      message: latestMessage.content,
      threadId: dbConversationId,
    });

    return {
      langGraphStream,
      conversationId: dbConversationId,
      onComplete: async (fullResponse: string) => {
        if (fullResponse) {
          await this.conversationService.addMessage(
            dbConversationId,
            'assistant',
            fullResponse
          );
        }
      },
    };
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.langGraphService.isReady();
  }
}
