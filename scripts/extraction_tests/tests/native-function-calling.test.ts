#!/usr/bin/env npx tsx
/**
 * Native Google Gen AI SDK Function Calling Test
 *
 * Uses the native @google/genai SDK with function declarations (tools).
 * This tests if function calling works better with the native SDK vs LangChain.
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/tests/native-function-calling.test.ts
 *   npx tsx scripts/extraction_tests/tests/native-function-calling.test.ts --runs=5
 */

import {
  GoogleGenAI,
  Type,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
} from '@google/genai';
import {
  createTest,
  runTest,
  parseRunsFromArgs,
  logger,
  TEST_DOCUMENTS,
  createTimer,
  flushTraces,
  shutdownTracing,
  isTracingEnabled,
  CONFIG,
} from '../lib/index.js';
import type { ExtractionResult, ExtractedEntity } from '../lib/index.js';

// Initialize the Google Gen AI SDK for Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: CONFIG.projectId,
  location: CONFIG.location,
});

/**
 * Function declaration for entity extraction
 */
const extractEntitiesDeclaration: FunctionDeclaration = {
  name: 'extract_entities',
  description:
    'Extract entities from a document. Call this function with all extracted entities.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      entities: {
        type: Type.ARRAY,
        description: 'List of extracted entities',
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: 'Name of the entity',
            },
            type: {
              type: Type.STRING,
              description: 'Type of entity (Person, Concept, etc.)',
            },
            description: {
              type: Type.STRING,
              description: 'Brief description of the entity',
            },
          },
          required: ['name', 'type'],
        },
      },
    },
    required: ['entities'],
  },
};

/**
 * Create extraction prompt
 */
function createExtractionPrompt(
  documentContent: string,
  entityTypes: string[]
): string {
  return `You are an expert entity extraction system. Extract all relevant entities from the following document.

Entity types to extract: ${entityTypes.join(', ')}

**Document Content:**

${documentContent}

Extract all entities you can find. For each entity, provide:
- name: The entity's name
- type: The type of entity (${entityTypes.join(' or ')})
- description: A brief description of why this entity is relevant

Be thorough and extract all entities mentioned or implied.

You MUST call the extract_entities function with your extracted entities.`;
}

/**
 * Extract entities using native Google SDK with function calling
 */
async function extractWithNativeFunctionCalling(): Promise<ExtractionResult> {
  const timer = createTimer();

  const prompt = createExtractionPrompt(TEST_DOCUMENTS.iiJohn, [
    'Person',
    'Concept',
  ]);

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: prompt,
      config: {
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
        tools: [{ functionDeclarations: [extractEntitiesDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['extract_entities'],
          },
        },
      },
    });

    // Check for function calls in response
    const functionCalls = response.functionCalls;
    if (!functionCalls || functionCalls.length === 0) {
      throw new Error('No function calls in response');
    }

    const extractCall = functionCalls.find(
      (fc) => fc.name === 'extract_entities'
    );
    if (!extractCall || !extractCall.args) {
      throw new Error('extract_entities function not called');
    }

    const args = extractCall.args as { entities?: any[] };
    const entities: ExtractedEntity[] = (args.entities || []).map((e: any) => ({
      name: e.name,
      type: e.type,
      description: e.description,
    }));

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

  console.log(
    logger.c.info('\n=== Native Google Gen AI SDK Function Calling Test ===')
  );
  console.log(logger.c.dim(`Using: @google/genai with Vertex AI`));
  console.log(logger.c.dim(`Model: ${CONFIG.model}`));
  console.log(logger.c.dim(`Project: ${CONFIG.projectId}`));
  console.log(logger.c.dim(`Location: ${CONFIG.location}`));
  console.log();

  const test = createTest(
    'native-sdk-function-calling',
    'Extract entities using native @google/genai SDK with function declarations',
    'function_calling',
    extractWithNativeFunctionCalling
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
