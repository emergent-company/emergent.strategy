import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { Pool } from 'pg';
import { AppConfigService } from '../../../common/config/config.service';
import { HumanMessage } from '@langchain/core/messages';

export interface StreamConversationOptions {
  message: string;
  threadId: string;
  tools?: any[]; // Array of LangChain tools to make available to the agent
  systemMessage?: string;
}

/**
 * LangGraph service for conversation orchestration.
 * Implements a simple chat flow with Google Vertex AI (Gemini).
 */
@Injectable()
export class LangGraphService implements OnModuleInit {
  private readonly logger = new Logger(LangGraphService.name);
  private model: ChatVertexAI | null = null;
  private defaultAgent: any = null;
  private checkpointer: PostgresSaver;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit() {
    const pool = new Pool({
      host: this.config.dbHost,
      port: this.config.dbPort,
      user: this.config.dbUser,
      password: this.config.dbPassword,
      database: this.config.dbName,
    });

    this.checkpointer = new PostgresSaver(pool);
    try {
      await this.checkpointer.setup();
      this.logger.log('PostgresSaver checkpointer initialized');
    } catch (error) {
      this.logger.error(
        'Failed to initialize PostgresSaver checkpointer',
        error
      );
    }

    this.initialize();
  }

  private initialize() {
    const projectId = this.config.vertexAiProjectId;
    const location = this.config.vertexAiLocation;
    const modelName = this.config.vertexAiModel;

    if (!projectId) {
      this.logger.warn(
        'Vertex AI not configured: GCP_PROJECT_ID missing. Chat will not work.'
      );
      return;
    }

    if (!location) {
      this.logger.warn(
        'Vertex AI not configured: VERTEX_AI_LOCATION missing. Chat will not work.'
      );
      return;
    }

    if (!modelName) {
      this.logger.warn(
        'Vertex AI not configured: VERTEX_AI_MODEL missing. Chat will not work.'
      );
      return;
    }

    this.logger.log(
      `Initializing Vertex AI Chat: project=${projectId}, location=${location}, model=${modelName}`
    );

    // Debug: Check LangSmith/LangChain environment variables
    this.logger.log('LangChain tracing configuration:');
    this.logger.log(
      `  LANGCHAIN_TRACING_V2: ${process.env.LANGCHAIN_TRACING_V2}`
    );
    this.logger.log(
      `  LANGCHAIN_API_KEY: ${
        process.env.LANGCHAIN_API_KEY ? '***set***' : 'NOT SET'
      }`
    );
    this.logger.log(
      `  LANGCHAIN_PROJECT: ${
        process.env.LANGCHAIN_PROJECT || 'NOT SET (will use default)'
      }`
    );
    this.logger.log(
      `  LANGCHAIN_ENDPOINT: ${
        process.env.LANGCHAIN_ENDPOINT || 'NOT SET (will use default)'
      }`
    );

    try {
      // Initialize Vertex AI model (uses Application Default Credentials)
      // NOTE: We explicitly set apiKey to undefined to prevent LangChain from
      // using GOOGLE_API_KEY env var. Vertex AI requires OAuth (ADC), not API keys.
      this.model = new ChatVertexAI({
        model: modelName,
        apiKey: '', // Empty string bypasses GOOGLE_API_KEY env var, forces ADC auth
        authOptions: {
          projectId: projectId,
        },
        location: location,
        temperature: 0.3,
        maxOutputTokens: 65535, // Maximum for Vertex AI to support full MJML templates
      });

      this.logger.log(`Vertex AI Chat initialized: model=${modelName}`);

      // Build the default agent (tools can be passed via streamConversation)
      this.defaultAgent = this.createAgent([]);
    } catch (error) {
      this.logger.error('Failed to initialize Vertex AI Chat', error);
      this.model = null;
    }
  }

  /**
   * Create a React agent with the given tools
   */
  private createAgent(tools: any[], systemMessage?: string) {
    if (!this.model) {
      return null;
    }

    return createReactAgent({
      llm: this.model,
      tools,
      checkpointSaver: this.checkpointer,
      stateModifier: systemMessage,
    });
  }

  /**
   * Stream a conversation response using LangGraph.
   * Returns an async iterable that yields message chunks.
   * If tools are provided, builds a tool-enabled agent graph.
   */
  async streamConversation(
    options: StreamConversationOptions
  ): Promise<AsyncIterable<any>> {
    const { message, threadId, tools, systemMessage } = options;

    if (!this.model) {
      throw new Error(
        'LangGraph not initialized. Check GCP_PROJECT_ID, VERTEX_AI_LOCATION, and VERTEX_AI_MODEL.'
      );
    }

    // Merge any provided tools
    const allTools = [...(tools || [])];

    this.logger.log(
      `Streaming conversation for thread: ${threadId} with ${allTools.length} tools`
    );

    // Debug: Log tool names being passed to the agent
    if (allTools.length > 0) {
      const toolNames = allTools.map((t) => t.name).join(', ');
      this.logger.log(`[TOOLS] Available tools: ${toolNames}`);
    }

    // Create user message
    const userMessage = new HumanMessage(message);

    // Use default agent if no custom tools or system message, otherwise create new agent
    let agent = this.defaultAgent;
    if ((tools && tools.length > 0) || systemMessage) {
      agent = this.createAgent(allTools, systemMessage);
    }

    if (!agent) {
      throw new Error('Failed to build conversation agent');
    }

    // Stream the graph execution
    const stream = await agent.stream(
      { messages: [userMessage] },
      {
        configurable: { thread_id: threadId },
        streamMode: 'values' as const,
      }
    );

    return stream;
  }

  /**
   * Generate a simple response from the LLM without conversation context.
   * Useful for one-off tasks like title generation.
   */
  async generateSimpleResponse(prompt: string): Promise<string> {
    if (!this.model) {
      throw new Error(
        'LangGraph not initialized. Check GCP_PROJECT_ID, VERTEX_AI_LOCATION, and VERTEX_AI_MODEL.'
      );
    }

    this.logger.log('Generating simple response');

    const response = await this.model.invoke([new HumanMessage(prompt)]);

    return response.content as string;
  }

  /**
   * Check if the service is ready (model initialized)
   */
  isReady(): boolean {
    return this.model !== null && this.defaultAgent !== null;
  }
}
