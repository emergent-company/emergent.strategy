/**
 * Langfuse Client for Verification Cascade
 *
 * Provides observability for the verification pipeline, including:
 * - Trace creation for verification jobs
 * - Span tracking for each tier (Exact Match, NLI, LLM Judge)
 * - Generation tracking for LLM Judge calls
 * - Custom event tracking for self-hosted NLI model
 *
 * Uses the same Langfuse instance configuration as the main server.
 */

import {
  Langfuse,
  LangfuseSpanClient,
  LangfuseGenerationClient,
} from 'langfuse-node';
import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
dotenvConfig({ path: path.resolve(PROJECT_ROOT, '.env') });

/**
 * Langfuse configuration from environment
 */
export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  enabled: boolean;
}

/**
 * Get Langfuse configuration from environment variables
 */
export function getLangfuseConfig(): LangfuseConfig {
  return {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
    secretKey: process.env.LANGFUSE_SECRET_KEY || '',
    baseUrl: process.env.LANGFUSE_HOST || 'http://localhost:3011',
    enabled: process.env.LANGFUSE_ENABLED === 'true',
  };
}

// Singleton Langfuse client
let langfuseClient: Langfuse | null = null;

/**
 * Get or create Langfuse client instance
 */
export function getLangfuseClient(): Langfuse | null {
  if (langfuseClient) return langfuseClient;

  const config = getLangfuseConfig();

  if (!config.enabled) {
    console.log('[Langfuse] Disabled via LANGFUSE_ENABLED');
    return null;
  }

  if (!config.publicKey || !config.secretKey) {
    console.log('[Langfuse] Missing credentials, observability disabled');
    return null;
  }

  try {
    langfuseClient = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
      flushAt: 1, // Flush immediately for scripts
      flushInterval: 1000,
    });
    console.log(`[Langfuse] Initialized at ${config.baseUrl}`);
    return langfuseClient;
  } catch (error) {
    console.error('[Langfuse] Failed to initialize:', error);
    return null;
  }
}

/**
 * Flush and shutdown Langfuse client
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseClient) {
    await langfuseClient.flushAsync();
    await langfuseClient.shutdownAsync();
    langfuseClient = null;
    console.log('[Langfuse] Shutdown complete');
  }
}

/**
 * Extract short ID from UUID for display
 */
function getShortId(fullId: string): string {
  const parts = fullId.split('-');
  return parts.length > 0 ? parts[parts.length - 1] : fullId;
}

/**
 * Verification trace context for tracking a verification job
 */
export interface VerificationTraceContext {
  traceId: string;
  langfuse: Langfuse;
}

/**
 * Create a trace for a verification job
 */
export function createVerificationTrace(
  jobId: string,
  metadata?: Record<string, any>
): VerificationTraceContext | null {
  const client = getLangfuseClient();
  if (!client) return null;

  try {
    const shortId = getShortId(jobId);
    const trace = client.trace({
      id: jobId,
      name: `Verification ${shortId}`,
      metadata: {
        ...metadata,
        jobId,
        type: 'verification-cascade',
      },
      tags: ['verification', 'extraction-verification'],
      timestamp: new Date(),
    });

    return { traceId: trace.id, langfuse: client };
  } catch (error) {
    console.error('[Langfuse] Failed to create verification trace:', error);
    return null;
  }
}

/**
 * Create a span for a verification tier
 */
export function createTierSpan(
  context: VerificationTraceContext | null,
  tier: 1 | 2 | 3,
  input: any,
  metadata?: Record<string, any>
): LangfuseSpanClient | null {
  if (!context) return null;

  const tierNames: Record<1 | 2 | 3, string> = {
    1: 'Tier 1: Exact Match',
    2: 'Tier 2: NLI (Self-Hosted)',
    3: 'Tier 3: LLM Judge',
  };

  try {
    const span = context.langfuse.span({
      traceId: context.traceId,
      name: tierNames[tier],
      input,
      metadata: {
        ...metadata,
        tier,
        tierType: tier === 1 ? 'exact-match' : tier === 2 ? 'nli' : 'llm-judge',
      },
      startTime: new Date(),
    });

    return span;
  } catch (error) {
    console.error(`[Langfuse] Failed to create tier ${tier} span:`, error);
    return null;
  }
}

/**
 * Update a tier span with results
 */
export function updateTierSpan(
  span: LangfuseSpanClient | null,
  output: any,
  metadata?: Record<string, any>
): void {
  if (!span) return;

  try {
    span.update({
      output,
      metadata,
      endTime: new Date(),
    });
  } catch (error) {
    console.error('[Langfuse] Failed to update tier span:', error);
  }
}

/**
 * Create a generation for NLI model inference (self-hosted model tracking)
 *
 * Even though NLI is self-hosted, we track it as a generation to:
 * - Monitor latency and throughput
 * - Track input/output for debugging
 * - Measure model performance over time
 */
export function createNLIGeneration(
  context: VerificationTraceContext | null,
  input: { premise: string; hypothesis: string },
  parentSpanId?: string
): LangfuseGenerationClient | null {
  if (!context) return null;

  try {
    const generation = context.langfuse.generation({
      traceId: context.traceId,
      name: 'NLI Inference',
      model: 'deberta-v3-small-mnli', // Self-hosted model name
      input,
      metadata: {
        observation_type: 'nli-inference',
        model_type: 'self-hosted',
        model_provider: 'local-docker',
      },
      startTime: new Date(),
      parentObservationId: parentSpanId,
    });

    return generation;
  } catch (error) {
    console.error('[Langfuse] Failed to create NLI generation:', error);
    return null;
  }
}

/**
 * Update NLI generation with results
 */
export function updateNLIGeneration(
  generation: LangfuseGenerationClient | null,
  output: { entailment: number; contradiction: number; neutral: number },
  latencyMs: number,
  status: 'success' | 'error' = 'success',
  statusMessage?: string
): void {
  if (!generation) return;

  try {
    generation.update({
      output,
      metadata: {
        latencyMs,
        entailment: output.entailment,
        contradiction: output.contradiction,
        neutral: output.neutral,
      },
      endTime: new Date(),
      // No cost for self-hosted model, but track the call
      usageDetails: {
        // Approximate token count based on input length
        // (DeBERTa uses wordpiece tokenization, ~1.3 tokens per word)
        input: 0, // We don't have exact token count from NLI service
      },
      level: status === 'error' ? 'ERROR' : 'DEFAULT',
      statusMessage,
    });
  } catch (error) {
    console.error('[Langfuse] Failed to update NLI generation:', error);
  }
}

/**
 * Create a generation for LLM Judge (Gemini)
 */
export function createLLMJudgeGeneration(
  context: VerificationTraceContext | null,
  input: string,
  model: string,
  parentSpanId?: string
): LangfuseGenerationClient | null {
  if (!context) return null;

  try {
    const generation = context.langfuse.generation({
      traceId: context.traceId,
      name: 'LLM Judge',
      model,
      input,
      metadata: {
        observation_type: 'llm-judge',
        model_type: 'cloud',
        model_provider: 'vertex-ai',
      },
      startTime: new Date(),
      parentObservationId: parentSpanId,
    });

    return generation;
  } catch (error) {
    console.error('[Langfuse] Failed to create LLM Judge generation:', error);
    return null;
  }
}

/**
 * Update LLM Judge generation with results
 */
export function updateLLMJudgeGeneration(
  generation: LangfuseGenerationClient | null,
  output: any,
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number },
  status: 'success' | 'error' = 'success',
  statusMessage?: string
): void {
  if (!generation) return;

  try {
    const usageDetails: Record<string, number> = {};
    if (usage?.inputTokens) usageDetails.input = usage.inputTokens;
    if (usage?.outputTokens) usageDetails.output = usage.outputTokens;
    if (usage?.totalTokens) usageDetails.total = usage.totalTokens;

    generation.update({
      output,
      usageDetails:
        Object.keys(usageDetails).length > 0 ? usageDetails : undefined,
      endTime: new Date(),
      level: status === 'error' ? 'ERROR' : 'DEFAULT',
      statusMessage,
    });
  } catch (error) {
    console.error('[Langfuse] Failed to update LLM Judge generation:', error);
  }
}

/**
 * Log a verification event (for quick debugging/monitoring)
 */
export function logVerificationEvent(
  context: VerificationTraceContext | null,
  name: string,
  metadata?: Record<string, any>
): void {
  if (!context) return;

  try {
    context.langfuse.event({
      traceId: context.traceId,
      name,
      metadata,
      startTime: new Date(),
    });
  } catch (error) {
    console.error('[Langfuse] Failed to log verification event:', error);
  }
}

/**
 * Score a verification result for quality tracking
 */
export function scoreVerification(
  context: VerificationTraceContext | null,
  name: string,
  value: number,
  comment?: string
): void {
  if (!context) return;

  try {
    context.langfuse.score({
      traceId: context.traceId,
      name,
      value,
      comment,
    });
  } catch (error) {
    console.error('[Langfuse] Failed to score verification:', error);
  }
}
