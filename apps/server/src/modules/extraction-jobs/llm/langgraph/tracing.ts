/**
 * LangGraph Node Tracing Utilities
 *
 * Provides a clean interface for nodes to create Langfuse observations
 * using the trace_id and parent_observation_id from graph state.
 *
 * This module exports:
 * - NodeTracingContext: Interface for tracing context passed through graph state
 * - NodeSpanHelper: Helper class for creating/ending spans within a node
 * - NodeGenerationHelper: Helper class for creating/ending generations (LLM calls) with prompt linking
 * - createNodeSpan: Factory function for easy span creation in nodes
 * - createNodeGeneration: Factory function for easy generation creation in nodes
 */

import { LangfuseService } from '../../../langfuse/langfuse.service';
import { LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse-node';
import { LangfusePromptClient } from '../../../langfuse/prompts/types';

/**
 * Tracing context extracted from graph state
 */
export interface NodeTracingContext {
  /** Langfuse trace ID (from job trace) */
  traceId?: string;
  /** Parent observation ID (langgraph-pipeline span) */
  parentObservationId?: string;
}

/**
 * Configuration for a node span
 */
export interface NodeSpanConfig {
  /** Name of the node (e.g., 'document_router', 'entity_extractor') */
  nodeName: string;
  /** Input data to record */
  input?: any;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Helper class for managing a span within a node execution
 */
export class NodeSpanHelper {
  private span: LangfuseSpanClient | null = null;
  private startTime: number;

  constructor(
    private readonly langfuseService: LangfuseService | null,
    private readonly context: NodeTracingContext,
    private readonly config: NodeSpanConfig
  ) {
    this.startTime = Date.now();
    this.createSpan();
  }

  private createSpan(): void {
    if (!this.langfuseService || !this.context.traceId) {
      return;
    }

    this.span = this.langfuseService.createSpan(
      this.context.traceId,
      this.config.nodeName,
      this.config.input,
      {
        ...this.config.metadata,
        parentObservationId: this.context.parentObservationId,
      }
    );
  }

  /**
   * End the span with success status
   */
  end(output: any): void {
    if (!this.span || !this.langfuseService) {
      return;
    }

    this.langfuseService.endSpan(
      this.span,
      {
        ...output,
        durationMs: Date.now() - this.startTime,
      },
      'success'
    );
  }

  /**
   * End the span with error status
   */
  endWithError(error: string, partialOutput?: any): void {
    if (!this.span || !this.langfuseService) {
      return;
    }

    this.langfuseService.endSpan(
      this.span,
      {
        ...partialOutput,
        error,
        durationMs: Date.now() - this.startTime,
      },
      'error',
      error
    );
  }

  /**
   * Get the span ID (useful for creating nested observations)
   */
  getSpanId(): string | undefined {
    return this.span?.id;
  }

  /**
   * Get duration since span started
   */
  getDurationMs(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Factory function to create a node span helper
 *
 * @param langfuseService - LangfuseService instance (can be null if tracing disabled)
 * @param state - Graph state containing trace_id and parent_observation_id
 * @param nodeName - Name of the node
 * @param input - Optional input data to record
 * @param metadata - Optional additional metadata
 * @returns NodeSpanHelper instance
 */
export function createNodeSpan(
  langfuseService: LangfuseService | null,
  state: { trace_id?: string; parent_observation_id?: string },
  nodeName: string,
  input?: any,
  metadata?: Record<string, any>
): NodeSpanHelper {
  return new NodeSpanHelper(
    langfuseService,
    {
      traceId: state.trace_id,
      parentObservationId: state.parent_observation_id,
    },
    {
      nodeName,
      input,
      metadata,
    }
  );
}

/**
 * Extract tracing context from graph state
 */
export function getTracingContext(state: {
  trace_id?: string;
  parent_observation_id?: string;
}): NodeTracingContext {
  return {
    traceId: state.trace_id,
    parentObservationId: state.parent_observation_id,
  };
}

/**
 * Configuration for a node generation (LLM call)
 */
export interface NodeGenerationConfig {
  /** Name of the generation (e.g., 'extract_entities', 'build_relationships') */
  generationName: string;
  /** Input data to record (the prompt/messages sent to the LLM) */
  input?: any;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Langfuse prompt client for linking to prompt metrics */
  prompt?: LangfusePromptClient;
  /** Model name (e.g., 'gemini-1.5-flash') */
  model?: string;
}

/**
 * Helper class for managing a generation (LLM call) observation within a node execution.
 * Unlike spans, generations are specifically for tracking LLM calls and can be linked
 * to Langfuse prompts for prompt metrics.
 */
export class NodeGenerationHelper {
  private generation: LangfuseGenerationClient | null = null;
  private startTime: number;
  private readonly model?: string;

  constructor(
    private readonly langfuseService: LangfuseService | null,
    private readonly context: NodeTracingContext,
    private readonly config: NodeGenerationConfig
  ) {
    this.startTime = Date.now();
    this.model = config.model;
    this.createGeneration();
  }

  private createGeneration(): void {
    if (!this.langfuseService || !this.context.traceId) {
      return;
    }

    this.generation = this.langfuseService.createObservation(
      this.context.traceId,
      this.config.generationName,
      this.config.input,
      {
        ...this.config.metadata,
        parentObservationId: this.context.parentObservationId,
      },
      this.context.parentObservationId,
      this.config.prompt
    );
  }

  /**
   * End the generation with success status
   * @param output - The LLM output
   * @param usage - Optional token usage statistics
   */
  end(
    output: any,
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }
  ): void {
    if (!this.generation || !this.langfuseService) {
      return;
    }

    this.langfuseService.updateObservation(
      this.generation,
      output,
      usage,
      this.model,
      'success'
    );
  }

  /**
   * End the generation with error status
   */
  endWithError(error: string, partialOutput?: any): void {
    if (!this.generation || !this.langfuseService) {
      return;
    }

    this.langfuseService.updateObservation(
      this.generation,
      partialOutput,
      undefined,
      this.model,
      'error',
      error
    );
  }

  /**
   * Get the generation ID (useful for debugging/logging)
   */
  getGenerationId(): string | undefined {
    return this.generation?.id;
  }

  /**
   * Get duration since generation started
   */
  getDurationMs(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Factory function to create a node generation helper for LLM calls.
 *
 * Use this when making LLM calls within a node to:
 * - Track the LLM call as a generation observation (not a span)
 * - Link the generation to a Langfuse prompt for metrics
 * - Record token usage and model information
 *
 * @param langfuseService - LangfuseService instance (can be null if tracing disabled)
 * @param state - Graph state containing trace_id and parent_observation_id
 * @param generationName - Name of the generation (e.g., 'extract_entities')
 * @param input - Input data to record (the prompt/messages sent to the LLM)
 * @param options - Optional configuration (metadata, prompt, model)
 * @returns NodeGenerationHelper instance
 *
 * @example
 * ```typescript
 * const generation = createNodeGeneration(
 *   this.langfuseService,
 *   state,
 *   'extract_entities',
 *   { messages, chunk: state.current_chunk },
 *   {
 *     prompt: promptResult.langfusePrompt,
 *     model: 'gemini-1.5-flash',
 *     metadata: { documentId: state.document_id }
 *   }
 * );
 *
 * try {
 *   const result = await llm.invoke(messages);
 *   generation.end(result.content, {
 *     promptTokens: result.usage?.input_tokens,
 *     completionTokens: result.usage?.output_tokens,
 *     totalTokens: result.usage?.total_tokens
 *   });
 * } catch (error) {
 *   generation.endWithError(error.message);
 * }
 * ```
 */
export function createNodeGeneration(
  langfuseService: LangfuseService | null,
  state: { trace_id?: string; parent_observation_id?: string },
  generationName: string,
  input?: any,
  options?: {
    metadata?: Record<string, any>;
    prompt?: LangfusePromptClient;
    model?: string;
  }
): NodeGenerationHelper {
  return new NodeGenerationHelper(
    langfuseService,
    {
      traceId: state.trace_id,
      parentObservationId: state.parent_observation_id,
    },
    {
      generationName,
      input,
      metadata: options?.metadata,
      prompt: options?.prompt,
      model: options?.model,
    }
  );
}
