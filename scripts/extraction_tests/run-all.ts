#!/usr/bin/env npx tsx
/**
 * Unified Extraction Test Runner
 *
 * Runs all extraction method tests with multi-run averaging.
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/run-all.ts
 *   npx tsx scripts/extraction_tests/run-all.ts --runs=5
 *   npx tsx scripts/extraction_tests/run-all.ts --runs=5 --no-warmup
 */

import {
  GoogleGenAI,
  Type,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
} from '@google/genai';
import {
  runTests,
  parseRunsFromArgs,
  logger,
  createTest,
  createJsonModel,
  createTextModel,
  invokeWithTimeout,
  createTimer,
  TEST_DOCUMENTS,
  JSON_SCHEMAS,
  ZOD_SCHEMAS,
  ENTITY_TYPES,
  createJsonExtractionPrompt,
  createStructuredExtractionPrompt,
  createResponseSchema,
  CONFIG,
} from './lib/index.js';

import type {
  ExtractionResult,
  ExtractedEntity,
  TestConfig,
} from './lib/index.js';

// Initialize the Google Gen AI SDK for Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: CONFIG.projectId,
  location: CONFIG.location,
});

// ============================================================================
// Test Implementation Functions
// ============================================================================

/**
 * JSON Prompting - Most reliable method
 */
async function jsonPromptingExtraction(): Promise<ExtractionResult> {
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

/**
 * Function Calling with withStructuredOutput
 */
async function functionCallingExtraction(): Promise<ExtractionResult> {
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

/**
 * JSON prompting with project meeting document (multi-entity)
 */
async function jsonPromptingMultiEntity(): Promise<ExtractionResult> {
  const timer = createTimer();

  const model = createJsonModel({ temperature: 0.1 });

  const entitySchema = {
    type: 'object',
    required: ['name', 'type'],
    properties: {
      name: { type: 'string', description: 'Name of the entity' },
      type: {
        type: 'string',
        enum: ['Person', 'Task'],
        description: 'Entity type',
      },
      role: { type: 'string', description: 'Role or assignee' },
      description: { type: 'string', description: 'Description' },
    },
  };

  const responseSchema = {
    type: 'object',
    properties: {
      entities: { type: 'array', items: entitySchema },
    },
    required: ['entities'],
  };

  const prompt = `You are an expert entity extraction system. Extract all Person and Task entities from this document.

**Entity Types to Extract:**
1. Person - People mentioned in the document
2. Task - Action items or tasks mentioned

**Document Content:**

${TEST_DOCUMENTS.projectMeeting}

**JSON Schema for Response:**
\`\`\`json
${JSON.stringify(responseSchema, null, 2)}
\`\`\`

Return ONLY a valid JSON object matching this schema. No explanation or markdown.`;

  try {
    const result = await invokeWithTimeout(async () => {
      return model.invoke(prompt);
    }, 30_000);

    const content = (result as any).content;
    const parsed = JSON.parse(content);
    const entities: ExtractedEntity[] = (parsed.entities || []).map(
      (e: any) => ({
        name: e.name,
        type: e.type,
        description: e.description || e.role,
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

// ============================================================================
// Native SDK Test Functions
// ============================================================================

/**
 * Response schema for entity extraction using native SDK types
 */
const NATIVE_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    entities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Name of the entity' },
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
            name: { type: Type.STRING, description: 'Name of the entity' },
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
 * Native SDK with responseSchema (structured output)
 */
async function nativeSdkStructuredOutput(): Promise<ExtractionResult> {
  const timer = createTimer();

  const prompt = createStructuredExtractionPrompt(TEST_DOCUMENTS.iiJohn, [
    'Person',
    'Concept',
  ]);

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: NATIVE_EXTRACTION_SCHEMA,
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response from model');
    }

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

/**
 * Native SDK with function calling (tools)
 */
async function nativeSdkFunctionCalling(): Promise<ExtractionResult> {
  const timer = createTimer();

  const prompt = `You are an expert entity extraction system. Extract all relevant entities from the following document.

Entity types to extract: Person, Concept

**Document Content:**

${TEST_DOCUMENTS.iiJohn}

Extract all entities you can find. For each entity, provide:
- name: The entity's name
- type: The type of entity (Person or Concept)
- description: A brief description of why this entity is relevant

Be thorough and extract all entities mentioned or implied.

You MUST call the extract_entities function with your extracted entities.`;

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

// ============================================================================
// Test Configurations
// ============================================================================

const ALL_TESTS: TestConfig[] = [
  // LangChain JSON prompting (reliable)
  createTest(
    'json-prompting-person',
    'Extract Person entities using JSON prompting (responseMimeType)',
    'json_prompting',
    jsonPromptingExtraction
  ),
  createTest(
    'json-prompting-multi',
    'Extract Person and Task entities from meeting notes',
    'json_prompting',
    jsonPromptingMultiEntity
  ),
  // LangChain function calling (has issues)
  createTest(
    'langchain-function-calling',
    'LangChain withStructuredOutput (function_calling) - KNOWN ISSUES',
    'function_calling',
    functionCallingExtraction
  ),
  // Native SDK tests
  createTest(
    'native-sdk-structured',
    'Native @google/genai SDK with responseSchema',
    'structured_output',
    nativeSdkStructuredOutput
  ),
  createTest(
    'native-sdk-function-calling',
    'Native @google/genai SDK with function declarations',
    'function_calling',
    nativeSdkFunctionCalling
  ),
];

// ============================================================================
// Main
// ============================================================================

async function main() {
  const runs = parseRunsFromArgs(3);
  const skipWarmup = process.argv.includes('--no-warmup');

  console.log();
  console.log(logger.c.bold('Extraction Test Suite'));
  console.log(logger.c.dim('─'.repeat(50)));
  console.log(`  ${logger.c.dim('Model:')}     ${CONFIG.model}`);
  console.log(`  ${logger.c.dim('Location:')}  ${CONFIG.location}`);
  console.log(`  ${logger.c.dim('Runs:')}      ${runs} per test`);
  console.log(
    `  ${logger.c.dim('Warmup:')}    ${
      skipWarmup ? 'disabled' : `${CONFIG.warmupRuns} run(s)`
    }`
  );
  console.log();

  const summaries = await runTests(ALL_TESTS, {
    runs,
    skipWarmup,
    warmupRuns: CONFIG.warmupRuns,
    verbose: true,
  });

  // Exit with error if any test had 0% success rate
  const failedTests = summaries.filter((s) => s.stats.successRate === 0);
  if (failedTests.length > 0) {
    console.log();
    console.log(
      logger.c.error(`⚠ ${failedTests.length} test(s) had 0% success rate`)
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(logger.c.error('Fatal error:'), err);
  process.exit(1);
});
