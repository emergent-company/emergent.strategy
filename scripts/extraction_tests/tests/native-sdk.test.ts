#!/usr/bin/env npx tsx
/**
 * Native Google Gen AI SDK Extraction Test
 *
 * Uses the native @google/genai SDK with responseSchema for structured output.
 * This bypasses LangChain to test if the issue is with LangChain or the API itself.
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/tests/native-sdk.test.ts
 *   npx tsx scripts/extraction_tests/tests/native-sdk.test.ts --runs=5
 */

import { GoogleGenAI, Type } from '@google/genai';
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
 * Response schema for entity extraction using native SDK types
 */
const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    entities: {
      type: Type.ARRAY,
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
        propertyOrdering: ['name', 'type', 'description'],
      },
      description: 'List of extracted entities',
    },
  },
  required: ['entities'],
  propertyOrdering: ['entities'],
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

Be thorough and extract all entities mentioned or implied.`;
}

/**
 * Extract entities using native Google SDK with responseSchema
 */
async function extractWithNativeSDK(): Promise<ExtractionResult> {
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
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
      },
    });

    // Extract text from response
    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response from model');
    }

    // Parse JSON response
    const parsed = JSON.parse(text);
    const entities: ExtractedEntity[] = (parsed.entities || []).map(
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

  console.log(logger.c.info('\n=== Native Google Gen AI SDK Test ==='));
  console.log(logger.c.dim(`Using: @google/genai with Vertex AI`));
  console.log(logger.c.dim(`Model: ${CONFIG.model}`));
  console.log(logger.c.dim(`Project: ${CONFIG.projectId}`));
  console.log(logger.c.dim(`Location: ${CONFIG.location}`));
  console.log();

  const test = createTest(
    'native-sdk-structured',
    'Extract entities using native @google/genai SDK with responseSchema',
    'structured_output',
    extractWithNativeSDK
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
