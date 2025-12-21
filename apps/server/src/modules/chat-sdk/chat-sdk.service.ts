import { Injectable, Logger } from '@nestjs/common';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { ConversationService } from '../chat-ui/services/conversation.service';
import { UnifiedSearchService } from '../unified-search/unified-search.service';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { MessageDto } from './dto/chat-sdk-request.dto';
import { createChatSearchTool } from './tools/chat-search.tool';
import { createWebSearchTool } from './tools/web-search.tool';
import { createBrowseUrlTool } from './tools/browse-url.tool';
import { createImportDocumentTool } from './tools/import-document.tool';
import { TypeRegistryService } from '../type-registry/type-registry.service';
import { GraphService } from '../graph/graph.service';
import { ExternalSourcesService } from '../external-sources/external-sources.service';
import { ExternalSourceProviderRegistry } from '../external-sources/external-source-provider-registry.service';
import { createGetDatabaseSchemaTool } from './tools/schema.tool';
import { createObjectQueryTool } from './tools/object-query.tool';
import { ALL_TOOL_NAMES } from './tool-definitions';

export interface ChatSdkStreamOptions {
  messages: MessageDto[];
  conversationId?: string;
  userId?: string | null;
  projectId?: string;
  /**
   * Array of enabled tool names. If null/undefined, all tools are enabled.
   * If empty array, no tools are enabled.
   */
  enabledTools?: string[] | null;
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
    private readonly graphService: GraphService,
    private readonly config: AppConfigService,
    private readonly externalSourcesService: ExternalSourcesService,
    private readonly providerRegistry: ExternalSourceProviderRegistry
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
    const { messages, conversationId, userId, projectId, enabledTools } =
      options;

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
      const title = this.createTemporaryTitle(messageContent);
      const conversation = await this.conversationService.createConversation(
        title,
        userId || undefined,
        projectId // Pass projectId to conversation
      );
      dbConversationId = conversation.id;
      this.logger.log(
        `Created new conversation: ${dbConversationId} for user ${
          userId || 'anonymous'
        }${projectId ? ` in project ${projectId}` : ''} with title: "${title}"`
      );
    }

    // Save user message
    await this.conversationService.addMessage(
      dbConversationId,
      'user',
      messageContent
    );

    // Determine which tools are enabled
    // null/undefined = all tools enabled, empty array = no tools
    const effectiveEnabledTools =
      enabledTools === null || enabledTools === undefined
        ? ALL_TOOL_NAMES
        : enabledTools;

    const isToolEnabled = (toolName: string) =>
      effectiveEnabledTools.includes(toolName);

    this.logger.log(
      `Enabled tools: ${
        effectiveEnabledTools.length === 0
          ? 'none'
          : effectiveEnabledTools.join(', ')
      }`
    );

    // Create tools and system prompt if projectId is provided
    let tools: any[] | undefined;
    let systemMessage: string | undefined;

    if (projectId && effectiveEnabledTools.length > 0) {
      const orgId = await this.getOrganizationIdFromProject(projectId);
      if (orgId) {
        this.logger.log(
          `Creating tools for project ${projectId} in org ${orgId}`
        );
        tools = [];

        // Search Tool
        if (isToolEnabled('search_knowledge_base')) {
          const searchTool = createChatSearchTool(this.unifiedSearchService, {
            orgId,
            projectId,
            scopes: ['search:read', 'graph:search:read'],
          });
          tools.push(searchTool);
        }

        // Schema Tool
        if (isToolEnabled('get_database_schema')) {
          const schemaTool = createGetDatabaseSchemaTool(
            this.typeRegistryService,
            {
              projectId,
            }
          );
          tools.push(schemaTool);
        }

        // Object Query Tool
        if (isToolEnabled('query_graph_objects')) {
          const queryTool = createObjectQueryTool(this.graphService, {
            projectId,
            orgId,
          });
          tools.push(queryTool);
        }

        // Web Search Tool (DuckDuckGo - no API key required)
        if (isToolEnabled('search_web')) {
          const webSearchTool = createWebSearchTool();
          tools.push(webSearchTool);
        }

        // Browse URL Tool (fetch and read web pages)
        if (isToolEnabled('browse_url')) {
          const browseUrlTool = createBrowseUrlTool();
          tools.push(browseUrlTool);
        }

        // Import Document Tool (import from Google Drive, web URLs into knowledge base)
        if (isToolEnabled('import_document')) {
          const importDocumentTool = createImportDocumentTool(
            this.externalSourcesService,
            this.providerRegistry,
            { projectId }
          );
          tools.push(importDocumentTool);
        }

        // If no tools were created (all disabled), set tools to undefined
        if (tools.length === 0) {
          tools = undefined;
        }

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
              .map((t) => {
                const props =
                  t.json_schema &&
                  typeof t.json_schema === 'object' &&
                  'properties' in t.json_schema
                    ? Object.keys((t.json_schema as any).properties).join(', ')
                    : 'No specific attributes';
                return `- ${t.type}: ${
                  t.description || 'No description'
                }. Attributes: ${props}.`;
              })
              .join('\n');

            systemMessage = `You are a helpful AI assistant with access to a knowledge graph database and the internet.

IMPORTANT - URL ACCESS CAPABILITIES:
You DO have the ability to access external URLs through your tools. When a user shares ANY URL (Google Drive, web pages, documents), you MUST use your tools to access them. NEVER say you cannot access external links or URLs - that is incorrect. You have full URL access capabilities through:
- 'import_document': Import and store documents from Google Drive or web URLs
- 'browse_url': Read web page content without storing

When a user shares a URL, ALWAYS attempt to use the appropriate tool. Do not refuse or claim you lack access.

The database contains the following object types:
${schemaSummary}

You have tools to:
1. Search the knowledge base broadly (search_knowledge_base)
2. Query specific objects with filters (query_graph_objects)
3. Inspect detailed schema definitions (get_database_schema)
4. Search the web for external information (search_web)
5. Read specific web pages (browse_url)
6. Import documents from external URLs into the knowledge base (import_document)

When asked to find objects, prefer 'query_graph_objects' for specific criteria (status, type, etc.) and 'search_knowledge_base' for general information.

Use 'search_web' when:
- The user asks about current events, news, or recent developments
- The knowledge base doesn't have the information
- The user asks about external documentation, APIs, or third-party tools
- The user explicitly asks to search the internet

Use 'browse_url' when:
- The user provides a specific URL they want you to quickly read (without importing)
- You need to verify or get full content from a search result
- Reading documentation, articles, or blog posts at specific URLs

Use 'import_document' when:
- The user shares a Google Drive link (docs.google.com, drive.google.com)
- The user pastes a URL and asks to "import", "add", or "save" it to the knowledge base
- The user wants to reference a document in future conversations
- The user says "check this out" or "look at this" with a link they want to keep
- Default choice for Google Drive links unless user explicitly asks for quick read only

IMPORTANT - After importing a document:
When import_document succeeds, you MUST immediately use search_knowledge_base to search for the document's content and provide a summary to the user. The user expects to see what's in the document they just shared. Follow the "nextAction" hint in the tool response.

Choose between 'browse_url' and 'import_document':
- browse_url: Quick read without storing (ephemeral)
- import_document: Stores content in knowledge base for future queries and analysis

# Instructions: Finding Related Objects (No SQL)

**Core Directive:** Do NOT use SQL. Use your graph tools.

1. **Find Object & Connections:** Use \`search_knowledge_base(query="Entity Name")\`. This tool returns objects AND their immediate relationships (e.g., "parent of", "depends on") in the \`relationships\` field.
2. **Traverse Deeper:** If you need more specific connections:
   - Get the \`id\` (UUID) from the search result.
   - Use \`query_graph_objects(related_to_id="UUID", ...)\` to find connected items (e.g., "Find all Tasks related to Project X").

CRITICAL: When referencing ANY graph object in your response (whether from search, query, or schema tools), you MUST use one of these exact formats to render a UI card:
- [[key|name]] (for named references like [[TASK-123|Fix Login Bug]])
- @[key] (for ID-only references like @[TASK-123])

Do NOT use @[key|name].
Do NOT use standard markdown links [name](url) for graph objects.
NEVER use the UUID (e.g., @400c0654...) in your text response. UUIDs are INTERNAL ONLY for tool arguments.`;
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

          // Generate title asynchronously (non-blocking)
          this.generateConversationTitle(dbConversationId).catch((error) => {
            this.logger.error('Title generation failed:', error);
          });
        }
      },
    };
  }

  /**
   * Generate a descriptive title for a conversation based on its first exchange.
   * Called asynchronously after the first AI response.
   */
  async generateConversationTitle(conversationId: string): Promise<void> {
    // Check if title generation is enabled
    if (!this.config.chatTitleGenerationEnabled) {
      this.logger.debug('Title generation is disabled');
      return;
    }

    try {
      const messages = await this.conversationService.getConversationHistory(
        conversationId
      );

      // Only generate title for new conversations (after first exchange)
      const minMessages = this.config.chatTitleMinMessages;
      if (messages.length < minMessages) {
        this.logger.debug(
          `Skipping title generation for conversation ${conversationId} - not enough messages (${messages.length} < ${minMessages})`
        );
        return;
      }

      // Skip if title was already customized (not a temporary title)
      const conversation = await this.conversationService.getConversation(
        conversationId
      );
      const isTempTitle =
        conversation.title.includes('...') || conversation.title.length < 20;
      if (!isTempTitle && conversation.title !== 'New conversation') {
        this.logger.debug(
          `Skipping title generation - conversation already has custom title`
        );
        return;
      }

      // Build context from first user message and AI response
      const userMessage = messages[0].content;
      const assistantMessage = messages[1].content;

      const maxLength = this.config.chatTitleMaxLength;
      const titlePrompt = `Generate a concise, descriptive title (maximum ${maxLength} characters) for this conversation. The title should capture the main topic or question. Return only the title text, with no quotes, prefixes, or suffixes.

User's question: ${userMessage.substring(0, 500)}
Assistant's response: ${assistantMessage.substring(0, 500)}

Title:`;

      // Use a fast, simple LLM call for title generation
      const response = await this.langGraphService.generateSimpleResponse(
        titlePrompt
      );

      // Clean up the response
      let title = response
        .trim()
        .replace(/^["']|["']$/g, '') // Remove quotes
        .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
        .substring(0, maxLength); // Ensure max length

      // Update conversation title
      await this.conversationService.updateConversationTitle(
        conversationId,
        title
      );

      this.logger.log(
        `Generated title for conversation ${conversationId}: "${title}"`
      );
    } catch (error) {
      this.logger.error(
        `Failed to generate title for conversation ${conversationId}:`,
        error
      );
      // Non-blocking - don't throw, just log
    }
  }

  /**
   * Create a smart temporary title from a message.
   * Removes common prefixes and truncates intelligently.
   */
  private createTemporaryTitle(messageContent: string): string {
    // Remove common question prefixes
    let title = messageContent
      .replace(
        /^(how do i|can you|what is|how to|please|could you|i need|help me|show me)\s+/i,
        ''
      )
      .trim();

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Smart truncation at word boundary
    if (title.length > 60) {
      title = title.substring(0, 57).trim();
      const lastSpace = title.lastIndexOf(' ');
      if (lastSpace > 40) {
        title = title.substring(0, lastSpace);
      }
      title += '...';
    }

    return title;
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
