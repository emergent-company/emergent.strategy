#!/usr/bin/env npx tsx
/**
 * Function Calling (Structured Output) Extraction Test
 *
 * Uses withStructuredOutput with method: 'function_calling'.
 * Note: This method has shown intermittent API issues with Vertex AI.
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/tests/function-calling.test.ts
 *   npx tsx scripts/extraction_tests/tests/function-calling.test.ts --runs=5
 */

import {
  createTextModel,
  invokeWithTimeout,
  createTest,
  runTest,
  parseRunsFromArgs,
  logger,
  TEST_DOCUMENTS,
  ZOD_SCHEMAS,
  createStructuredExtractionPrompt,
  createTimer,
  flushTraces,
  shutdownTracing,
  isTracingEnabled,
} from '../lib/index.js';
import type { ExtractionResult, ExtractedEntity } from '../lib/index.js';

/**
 * Extract entities using function calling (withStructuredOutput)
 */
async function extractWithFunctionCalling(): Promise<ExtractionResult> {
  const timer = createTimer();

  const baseModel = createTextModel({ temperature: 0.1 });
  const structuredModel = baseModel.withStructuredOutput(
    ZOD_SCHEMAS.extractionResponse,
    { method: 'function_calling', name: 'extract_entities' }
  ) as any;

  const prompt = createStructuredExtractionPrompt(TEST_DOCUMENTS.iiJohn, [
    'Person',
    'Concept',
  ]);

  try {
    const result = await invokeWithTimeout(async () => {
      return structuredModel.invoke(prompt);
    }, 30_000);

    const entities: ExtractedEntity[] = (result.entities || []).map(
      (e: any) => ({
        name: e.name,
        type: e.type,
        description: e.description,
      })
    );

    return {
      success: true,
      entities,
      durationMs: timer.stop(),
      promptLength: prompt.length,
    };
  } catch (err: unknown) {
    return {
      success: false,
      entities: [],
      durationMs: timer.stop(),
      error: err instanceof Error ? err.message : String(err),
      promptLength: prompt.length,
    };
  }
}

async function main() {
  const runs = parseRunsFromArgs(3);

  const test = createTest(
    'function-calling',
    'Extract entities using withStructuredOutput (function_calling method)',
    'function_calling',
    extractWithFunctionCalling
  );

  const summary = await runTest(test, { runs, warmupRuns: 1 });

  logger.summary(summary);

  // Flush traces when running standalone
  if (isTracingEnabled()) {
    console.log(logger.c.dim('\nFlushing traces to Langfuse...'));
    await flushTraces();
    await shutdownTracing();
    console.log(logger.c.success('Traces sent to Langfuse'));
  }
}

main().catch(console.error);
