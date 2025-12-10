/**
 * Langfuse Tracing for Extraction Tests
 *
 * Provides lightweight tracing integration for standalone test scripts.
 * Uses environment variables for configuration (same as main server).
 */

import {
  Langfuse,
  LangfuseSpanClient,
  LangfuseGenerationClient,
} from 'langfuse-node';
import { CONFIG } from './config.js';
import { logger } from './logger.js';

// Environment-based configuration
const LANGFUSE_CONFIG = {
  enabled: process.env.LANGFUSE_ENABLED === 'true',
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  host: process.env.LANGFUSE_HOST || 'http://localhost:3011',
};

let langfuseInstance: Langfuse | null = null;

/**
 * Initialize Langfuse client (singleton)
 */
export function initLangfuse(): Langfuse | null {
  if (langfuseInstance) {
    return langfuseInstance;
  }

  if (!LANGFUSE_CONFIG.enabled) {
    logger.debug('Langfuse tracing disabled (LANGFUSE_ENABLED != true)');
    return null;
  }

  if (!LANGFUSE_CONFIG.publicKey || !LANGFUSE_CONFIG.secretKey) {
    logger.warn(
      'Langfuse enabled but missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY'
    );
    return null;
  }

  try {
    langfuseInstance = new Langfuse({
      publicKey: LANGFUSE_CONFIG.publicKey,
      secretKey: LANGFUSE_CONFIG.secretKey,
      baseUrl: LANGFUSE_CONFIG.host,
      flushAt: 1, // Flush immediately for tests
      flushInterval: 1000,
    });
    logger.info(`Langfuse initialized at ${LANGFUSE_CONFIG.host}`);
    return langfuseInstance;
  } catch (error) {
    logger.error(`Failed to initialize Langfuse: ${error}`);
    return null;
  }
}

/**
 * Get the Langfuse client (initialize if needed)
 */
export function getLangfuse(): Langfuse | null {
  return langfuseInstance || initLangfuse();
}

/**
 * Check if Langfuse tracing is enabled and initialized
 */
export function isTracingEnabled(): boolean {
  return getLangfuse() !== null;
}

/**
 * Trace context for a test run
 */
export interface TestTraceContext {
  traceId: string;
  testName: string;
  parentSpanId?: string;
}

/**
 * Create a trace for a test run
 */
export function createTestTrace(
  testName: string,
  metadata?: Record<string, any>
): TestTraceContext | null {
  const langfuse = getLangfuse();
  if (!langfuse) return null;

  try {
    const trace = langfuse.trace({
      name: `extraction-test/${testName}`,
      metadata: {
        ...metadata,
        model: CONFIG.model,
        projectId: CONFIG.projectId,
        location: CONFIG.location,
        testType: 'extraction',
      },
      tags: ['extraction-test', testName],
      timestamp: new Date(),
    });

    logger.debug(`Created trace: ${trace.id} for test: ${testName}`);
    return {
      traceId: trace.id,
      testName,
    };
  } catch (error) {
    logger.error(`Failed to create trace: ${error}`);
    return null;
  }
}

/**
 * Create a generation (LLM call) within a trace
 */
export function createGeneration(
  ctx: TestTraceContext | null,
  name: string,
  input: any,
  metadata?: Record<string, any>
): LangfuseGenerationClient | null {
  if (!ctx) return null;

  const langfuse = getLangfuse();
  if (!langfuse) return null;

  try {
    const generation = langfuse.generation({
      traceId: ctx.traceId,
      name,
      input,
      model: CONFIG.model,
      metadata: {
        ...metadata,
        parentSpanId: ctx.parentSpanId,
      },
      startTime: new Date(),
    });

    logger.debug(
      `Created generation: ${generation.id} in trace: ${ctx.traceId}`
    );
    return generation;
  } catch (error) {
    logger.error(`Failed to create generation: ${error}`);
    return null;
  }
}

/**
 * End a generation with output and usage
 */
export function endGeneration(
  generation: LangfuseGenerationClient | null,
  output: any,
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  },
  status: 'success' | 'error' = 'success',
  statusMessage?: string
): void {
  if (!generation) return;

  try {
    generation.update({
      output,
      usage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
      endTime: new Date(),
      level: status === 'error' ? 'ERROR' : undefined,
      statusMessage,
    });
    logger.debug(`Updated generation: ${generation.id}`);
  } catch (error) {
    logger.error(`Failed to update generation: ${error}`);
  }
}

/**
 * Create a span within a trace
 */
export function createSpan(
  ctx: TestTraceContext | null,
  name: string,
  input?: any,
  metadata?: Record<string, any>
): LangfuseSpanClient | null {
  if (!ctx) return null;

  const langfuse = getLangfuse();
  if (!langfuse) return null;

  try {
    const span = langfuse.span({
      traceId: ctx.traceId,
      name,
      input,
      metadata: {
        ...metadata,
        parentSpanId: ctx.parentSpanId,
      },
      startTime: new Date(),
    });

    logger.debug(`Created span: ${span.id} in trace: ${ctx.traceId}`);
    return span;
  } catch (error) {
    logger.error(`Failed to create span: ${error}`);
    return null;
  }
}

/**
 * End a span with output
 */
export function endSpan(
  span: LangfuseSpanClient | null,
  output?: any,
  status: 'success' | 'error' = 'success',
  statusMessage?: string
): void {
  if (!span) return;

  try {
    span.update({
      output,
      endTime: new Date(),
      level: status === 'error' ? 'ERROR' : undefined,
      statusMessage,
    });
    logger.debug(`Updated span: ${span.id}`);
  } catch (error) {
    logger.error(`Failed to update span: ${error}`);
  }
}

/**
 * Score a trace with evaluation metrics
 */
export function scoreTrace(
  ctx: TestTraceContext | null,
  name: string,
  value: number,
  comment?: string
): void {
  if (!ctx) return;

  const langfuse = getLangfuse();
  if (!langfuse) return;

  try {
    langfuse.score({
      traceId: ctx.traceId,
      name,
      value,
      comment,
    });
    logger.debug(`Scored trace ${ctx.traceId}: ${name}=${value}`);
  } catch (error) {
    logger.error(`Failed to score trace: ${error}`);
  }
}

/**
 * Finalize a trace with output
 */
export function finalizeTrace(
  ctx: TestTraceContext | null,
  output: any,
  status: 'success' | 'error' = 'success'
): void {
  if (!ctx) return;

  const langfuse = getLangfuse();
  if (!langfuse) return;

  try {
    langfuse.trace({
      id: ctx.traceId,
      output,
      tags: [status],
    });
    logger.debug(`Finalized trace: ${ctx.traceId} with status: ${status}`);
  } catch (error) {
    logger.error(`Failed to finalize trace: ${error}`);
  }
}

/**
 * Flush all pending events to Langfuse
 */
export async function flushTraces(): Promise<void> {
  const langfuse = getLangfuse();
  if (!langfuse) return;

  try {
    await langfuse.flushAsync();
    logger.debug('Flushed Langfuse events');
  } catch (error) {
    logger.error(`Failed to flush Langfuse events: ${error}`);
  }
}

/**
 * Shutdown Langfuse client
 */
export async function shutdownTracing(): Promise<void> {
  if (!langfuseInstance) return;

  try {
    await langfuseInstance.shutdownAsync();
    logger.info('Langfuse shutdown complete');
    langfuseInstance = null;
  } catch (error) {
    logger.error(`Failed to shutdown Langfuse: ${error}`);
  }
}

/**
 * Helper: Wrap an async function with tracing
 */
export async function withTracing<T>(
  testName: string,
  fn: (ctx: TestTraceContext | null) => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const ctx = createTestTrace(testName, metadata);

  try {
    const result = await fn(ctx);
    finalizeTrace(ctx, { success: true, result }, 'success');
    return result;
  } catch (error) {
    finalizeTrace(ctx, { success: false, error: String(error) }, 'error');
    throw error;
  } finally {
    await flushTraces();
  }
}

/**
 * Helper: Wrap an LLM call with generation tracing
 */
export async function withGeneration<T>(
  ctx: TestTraceContext | null,
  name: string,
  input: any,
  fn: () => Promise<T>,
  getUsage?: (result: T) => {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }
): Promise<T> {
  const generation = createGeneration(ctx, name, input);
  const startTime = Date.now();

  try {
    const result = await fn();
    const usage = getUsage ? getUsage(result) : undefined;
    endGeneration(generation, result, usage, 'success');
    return result;
  } catch (error) {
    endGeneration(generation, null, undefined, 'error', String(error));
    throw error;
  }
}
