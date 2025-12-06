import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LLMResult } from '@langchain/core/outputs';
import { Serialized } from '@langchain/core/load/serializable';
import { Logger } from '@nestjs/common';

/**
 * Captured data from an LLM call, including raw response data
 * that would otherwise be lost if an error occurs during parsing.
 */
export interface CapturedLLMCallData {
  /** Run ID from LangChain */
  runId: string;
  /** Timestamp when the call started */
  startTime: Date;
  /** Timestamp when the call ended */
  endTime?: Date;
  /** The prompts sent to the LLM */
  prompts?: string[];
  /** The serialized LLM configuration */
  llmConfig?: Serialized;
  /** The full LLM result (if successful) */
  llmResult?: LLMResult;
  /** Raw llmOutput from the result (provider-specific) */
  llmOutput?: Record<string, any>;
  /** Error that occurred (if any) */
  error?: {
    message: string;
    name: string;
    stack?: string;
    raw?: any;
  };
  /** Extra parameters passed to the LLM */
  extraParams?: Record<string, unknown>;
  /** Tags associated with the call */
  tags?: string[];
  /** Metadata associated with the call */
  metadata?: Record<string, unknown>;
}

/**
 * LLM Response Capture Handler
 *
 * A LangChain callback handler that captures the full LLM response data,
 * including raw provider-specific outputs that would be lost if an error
 * occurs during post-processing.
 *
 * This is particularly useful for debugging issues where Vertex AI returns
 * empty or malformed responses, as it captures whatever data was available
 * before the error occurred.
 *
 * Usage:
 * ```typescript
 * const handler = new LlmResponseCaptureHandler();
 * const result = await model.invoke(prompt, { callbacks: [handler] });
 * console.log(handler.getCapturedData()); // Get all captured data
 * console.log(handler.getLastCapture()); // Get most recent capture
 * ```
 */
export class LlmResponseCaptureHandler extends BaseCallbackHandler {
  name = 'LlmResponseCaptureHandler';

  private readonly logger = new Logger(LlmResponseCaptureHandler.name);
  private captures: Map<string, CapturedLLMCallData> = new Map();
  private lastRunId?: string;

  /**
   * Called when an LLM starts running
   */
  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string,
    _parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.lastRunId = runId;
    this.captures.set(runId, {
      runId,
      startTime: new Date(),
      prompts,
      llmConfig: llm,
      extraParams,
      tags,
      metadata,
    });

    this.logger.debug(`[Capture] LLM call started: ${runId}`);
  }

  /**
   * Called when an LLM finishes running
   */
  async handleLLMEnd(
    output: LLMResult,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>
  ): Promise<void> {
    const capture = this.captures.get(runId);
    if (capture) {
      capture.endTime = new Date();
      capture.llmResult = output;
      capture.llmOutput = output.llmOutput;

      // Log a summary of what was captured
      const generationsCount = output.generations?.length ?? 0;
      const firstGenCount = output.generations?.[0]?.length ?? 0;
      this.logger.debug(
        `[Capture] LLM call ended: ${runId} - ` +
          `${generationsCount} generation sets, ${firstGenCount} items in first set`
      );

      // If there's llmOutput, log its keys for debugging
      if (output.llmOutput) {
        this.logger.debug(
          `[Capture] llmOutput keys: ${Object.keys(output.llmOutput).join(
            ', '
          )}`
        );
      }
    } else {
      // Create a capture even if we missed the start
      this.captures.set(runId, {
        runId,
        startTime: new Date(),
        endTime: new Date(),
        llmResult: output,
        llmOutput: output.llmOutput,
      });
      this.lastRunId = runId;
    }
  }

  /**
   * Called when an LLM errors
   */
  async handleLLMError(
    err: Error | unknown,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>
  ): Promise<void> {
    const capture = this.captures.get(runId);
    const errorData = {
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.name : 'Unknown',
      stack: err instanceof Error ? err.stack : undefined,
      raw: this.safeStringify(err),
    };

    if (capture) {
      capture.endTime = new Date();
      capture.error = errorData;

      this.logger.warn(
        `[Capture] LLM call error: ${runId} - ${errorData.message}`
      );
    } else {
      // Create a capture even if we missed the start
      this.captures.set(runId, {
        runId,
        startTime: new Date(),
        endTime: new Date(),
        error: errorData,
      });
      this.lastRunId = runId;
    }
  }

  /**
   * Get all captured data
   */
  getCapturedData(): CapturedLLMCallData[] {
    return Array.from(this.captures.values());
  }

  /**
   * Get capture for a specific run ID
   */
  getCapture(runId: string): CapturedLLMCallData | undefined {
    return this.captures.get(runId);
  }

  /**
   * Get the most recent capture
   */
  getLastCapture(): CapturedLLMCallData | undefined {
    if (this.lastRunId) {
      return this.captures.get(this.lastRunId);
    }
    return undefined;
  }

  /**
   * Clear all captured data
   */
  clear(): void {
    this.captures.clear();
    this.lastRunId = undefined;
  }

  /**
   * Get a summary of the last capture suitable for logging
   */
  getLastCaptureSummary(): string {
    const capture = this.getLastCapture();
    if (!capture) {
      return 'No captures available';
    }

    const durationMs = capture.endTime
      ? capture.endTime.getTime() - capture.startTime.getTime()
      : 0;

    const parts = [`runId: ${capture.runId}`, `duration: ${durationMs}ms`];

    if (capture.error) {
      parts.push(`error: ${capture.error.message}`);
    }

    if (capture.llmResult) {
      const genCount = capture.llmResult.generations?.length ?? 0;
      const firstCount = capture.llmResult.generations?.[0]?.length ?? 0;
      parts.push(`generations: ${genCount} sets, ${firstCount} in first`);
    }

    if (capture.llmOutput) {
      parts.push(
        `llmOutput keys: ${Object.keys(capture.llmOutput).join(', ')}`
      );
    }

    return parts.join(' | ');
  }

  /**
   * Safely stringify an object, handling circular references
   */
  private safeStringify(obj: unknown): string | undefined {
    if (obj === undefined || obj === null) {
      return undefined;
    }

    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        // Handle BigInt
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      });
    } catch (e) {
      return `[Unstringifiable: ${e instanceof Error ? e.message : String(e)}]`;
    }
  }
}
