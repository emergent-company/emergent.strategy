import { Injectable, Logger } from '@nestjs/common';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { StateGraph, Annotation } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { AppConfigService } from '../../../common/config/config.service';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// Define the state shape for our conversation graph
const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
});

export interface StreamConversationOptions {
  message: string;
  threadId: string;
}

/**
 * LangGraph service for conversation orchestration.
 * Implements a simple chat flow with Google Vertex AI (Gemini).
 */
@Injectable()
export class LangGraphService {
  private readonly logger = new Logger(LangGraphService.name);
  private model: ChatVertexAI | null = null;
  private graph: any = null;
  private checkpointer: MemorySaver;

  constructor(private readonly config: AppConfigService) {
    this.checkpointer = new MemorySaver();
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

    try {
      // Initialize Vertex AI model (uses Application Default Credentials)
      this.model = new ChatVertexAI({
        model: modelName,
        authOptions: {
          projectId: projectId,
        },
        location: location,
        temperature: 0.7,
        maxOutputTokens: 1000,
      });

      this.logger.log(`Vertex AI Chat initialized: model=${modelName}`);

      // Build the conversation graph
      this.buildGraph();
    } catch (error) {
      this.logger.error('Failed to initialize Vertex AI Chat', error);
      this.model = null;
    }
  }

  private buildGraph() {
    if (!this.model) {
      this.logger.warn('Cannot build graph: model not initialized');
      return;
    }

    const workflow = new StateGraph(GraphState)
      // Add a node that calls the LLM
      .addNode('agent', async (state: typeof GraphState.State) => {
        this.logger.debug(
          `Agent node: processing ${state.messages.length} messages`
        );
        const response = await this.model!.invoke(state.messages);
        return { messages: [response] };
      })
      // Set the entry point
      .addEdge('__start__', 'agent')
      // Set the exit point
      .addEdge('agent', '__end__');

    // Compile with checkpointer for conversation memory
    this.graph = workflow.compile({
      checkpointer: this.checkpointer,
    });

    this.logger.log('LangGraph conversation graph compiled');
  }

  /**
   * Stream a conversation response using LangGraph.
   * Returns an async iterable that yields message chunks.
   */
  async streamConversation(
    options: StreamConversationOptions
  ): Promise<AsyncIterable<any>> {
    const { message, threadId } = options;

    if (!this.graph) {
      throw new Error(
        'LangGraph not initialized. Check GCP_PROJECT_ID, VERTEX_AI_LOCATION, and VERTEX_AI_MODEL.'
      );
    }

    this.logger.log(`Streaming conversation for thread: ${threadId}`);

    // Create user message
    const userMessage = new HumanMessage(message);

    // Stream the graph execution
    const stream = await this.graph.stream(
      { messages: [userMessage] },
      {
        configurable: { thread_id: threadId },
        streamMode: 'values' as const,
      }
    );

    return stream;
  }

  /**
   * Check if the service is ready (model initialized)
   */
  isReady(): boolean {
    return this.model !== null && this.graph !== null;
  }
}
