#!/usr/bin/env npx tsx
/**
 * JSON Prompting Extraction Test
 *
 * Uses responseMimeType: 'application/json' for reliable extraction.
 * This is the most stable method based on our testing.
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/tests/json-prompting.test.ts
 *   npx tsx scripts/extraction_tests/tests/json-prompting.test.ts --runs=5
 */

import {
  createJsonModel,
  invokeWithTimeout,
  createTest,
  runTest,
  parseRunsFromArgs,
  logger,
  TEST_DOCUMENTS,
  JSON_SCHEMAS,
  ENTITY_TYPES,
  createJsonExtractionPrompt,
  createResponseSchema,
  createTimer,
  flushTraces,
  shutdownTracing,
  isTracingEnabled,
} from '../lib/index.js';
import type { ExtractionResult, ExtractedEntity } from '../lib/index.js';

/**
 * Extract Person entities using JSON prompting
 */
async function extractWithJsonPrompting(): Promise<ExtractionResult> {
  const timer = createTimer();

  const model = createJsonModel({ temperature: 0.1 });
  const entityType = ENTITY_TYPES.Person;
  const responseSchema = createResponseSchema(JSON_SCHEMAS.person);

  const prompt = createJsonExtractionPrompt(
    TEST_DOCUMENTS.iiJohn,
    entityType,
    responseSchema
  );

  try {
    const result = await invokeWithTimeout(async () => {
      return model.invoke(prompt);
    }, 30_000);

    const content = (result as any).content;
    const parsed = JSON.parse(content);
    const entities: ExtractedEntity[] = (parsed.entities || []).map(
      (e: any) => ({
        name: e.name,
        type: 'Person',
        description: e.significance || e.role,
        ...e,
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
    'json-prompting-person',
    'Extract Person entities using JSON prompting (responseMimeType)',
    'json_prompting',
    extractWithJsonPrompting
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
