import { Injectable, Logger } from '@nestjs/common';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { ConversationService } from '../chat-ui/services/conversation.service';
import { UnifiedSearchService } from '../unified-search/unified-search.service';
import { DatabaseService } from '../../common/database/database.service';
import { AIMessage } from '@langchain/core/messages';
import { MessageDto } from './dto/chat-sdk-request.dto';
import { createChatSearchTool } from './tools/chat-search.tool';
import { TypeRegistryService } from '../type-registry/type-registry.service';
import { GraphService } from '../graph/graph.service';
import { createGetDatabaseSchemaTool } from './tools/schema.tool';
import { createObjectQueryTool } from './tools/object-query.tool';

export interface ChatSdkStreamOptions {
  messages: MessageDto[];
  conversationId?: string;
  userId?: string | null;
  projectId?: string;
}

export interface ChatSdkStreamResult {
  langGraphStream: AsyncIterable<any>;
  conversationId: string;
  onComplete: (fullResponse: string) => Promise<void>;
}

export interface CreateConversationOptions {
  title: string;
  userId?: string | null;
  projectId?: string;
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
    private readonly conversationService: ConversationService,
    private readonly unifiedSearchService: UnifiedSearchService,
    private readonly db: DatabaseService,
    private readonly typeRegistryService: TypeRegistryService,
    private readonly graphService: GraphService
  ) {}

  /**
   * Create a new conversation without sending any messages.
   * Returns the conversation with a backend-generated UUID.
   */
  async createConversation(options: CreateConversationOptions) {
    const { title, userId, projectId } = options;

    this.logger.log(
      `Creating new conversation: "${title}" for user ${userId || 'anonymous'}${
        projectId ? ` in project ${projectId}` : ''
      }`
    );

    return this.conversationService.createConversation(
      title,
      userId || undefined,
      projectId
    );
  }

  /**
   * Stream a chat response. Returns the raw LangGraph stream for conversion
   * to Vercel AI SDK format by the controller.
   */
  async streamChat(
    options: ChatSdkStreamOptions
  ): Promise<ChatSdkStreamResult> {
    const { messages, conversationId, userId, projectId } = options;

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== 'user') {
      throw new Error('Last message must be from user');
    }

    // Extract text content (supports both simple content and AI SDK parts[] format)
    const messageContent = latestMessage.getText();
    if (!messageContent) {
      throw new Error('Message content is empty');
    }

    // Create or get conversation
    let dbConversationId = conversationId;
    if (!dbConversationId) {
      const title =
        messageContent.substring(0, 100) +
        (messageContent.length > 100 ? '...' : '');
      const conversation = await this.conversationService.createConversation(
        title,
        userId || undefined,
        projectId // Pass projectId to conversation
      );
      dbConversationId = conversation.id;
      this.logger.log(
        `Created new conversation: ${dbConversationId} for user ${
          userId || 'anonymous'
        }${projectId ? ` in project ${projectId}` : ''}`
      );
    }

    // Save user message
    await this.conversationService.addMessage(
      dbConversationId,
      'user',
      messageContent
    );

    // Create tools and system prompt if projectId is provided
    let tools: any[] | undefined;
    let systemMessage: string | undefined;

    if (projectId) {
      const orgId = await this.getOrganizationIdFromProject(projectId);
      if (orgId) {
        this.logger.log(
          `Creating tools for project ${projectId} in org ${orgId}`
        );
        tools = [];

        // Search Tool
        const searchTool = createChatSearchTool(this.unifiedSearchService, {
          orgId,
          projectId,
          scopes: ['search:read', 'graph:search:read'],
        });
        tools.push(searchTool);

        // Schema Tool
        const schemaTool = createGetDatabaseSchemaTool(
          this.typeRegistryService,
          {
            projectId,
          }
        );
        tools.push(schemaTool);

        // Object Query Tool
        const queryTool = createObjectQueryTool(this.graphService, {
          projectId,
          orgId,
        });
        tools.push(queryTool);

        // Fetch schema summary for system prompt
        try {
          const types = await this.typeRegistryService.getProjectTypes(
            projectId,
            {
              enabled_only: true,
            }
          );

          if (types.length > 0) {
            const schemaSummary = types
              .map((t) => `- ${t.type}: ${t.description || 'No description'}`)
              .join('\n');

            systemMessage = `You are a helpful AI assistant with access to a knowledge graph database.
The database contains the following object types:
${schemaSummary}

You have tools to:
1. Search broadly (search_knowledge_base)
2. Query specific objects with filters (query_graph_objects)
3. Inspect detailed schema definitions (get_database_schema)

When asked to find objects, prefer 'query_graph_objects' for specific criteria (status, type, etc.) and 'search_knowledge_base' for general information.`;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch schema for system prompt: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      } else {
        this.logger.warn(
          `Could not find organization for project ${projectId} - tools disabled`
        );
      }
    }

    // Get LangGraph stream with optional tools
    const langGraphStream = await this.langGraphService.streamConversation({
      message: messageContent,
      threadId: dbConversationId,
      tools,
      systemMessage,
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

  /**
   * Get organization ID from project ID
   * Used for tenant context in search tool
   */
  private async getOrganizationIdFromProject(
    projectId: string
  ): Promise<string | null> {
    const result = await this.db.query<{ organization_id: string }>(
      'SELECT organization_id FROM kb.projects WHERE id = $1',
      [projectId]
    );

    if (!result.rows[0]) {
      this.logger.warn(`Project ${projectId} not found`);
      return null;
    }

    return result.rows[0].organization_id ?? null;
  }
}
