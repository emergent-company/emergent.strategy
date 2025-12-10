#!/usr/bin/env npx tsx
/**
 * Compare LLM Provider Performance
 *
 * This script compares Vertex AI and Google AI Studio providers
 * by running multiple extraction-like tests on each.
 * Includes Langfuse tracing for observability.
 *
 * Usage:
 *   npx tsx scripts/compare-llm-providers.ts [options]
 *
 * Options:
 *   --provider=google|vertex|all    Provider to test (default: all)
 *   --method=response|function|all  Method to test (default: all)
 *   --split-only                    Only run split extraction tests
 *   --combined-only                 Only run combined extraction tests
 *   --help                          Show this help message
 *
 * Examples:
 *   npx tsx scripts/compare-llm-providers.ts --provider=google --method=function
 *   npx tsx scripts/compare-llm-providers.ts --provider=vertex --split-only
 *   npx tsx scripts/compare-llm-providers.ts --method=response
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse CLI arguments
interface CLIOptions {
  provider: 'google' | 'vertex' | 'all';
  method: 'response' | 'function' | 'all';
  splitOnly: boolean;
  combinedOnly: boolean;
  help: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    provider: 'all',
    method: 'all',
    splitOnly: false,
    combinedOnly: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--provider=')) {
      const value = arg.split('=')[1];
      if (value === 'google' || value === 'vertex' || value === 'all') {
        options.provider = value;
      } else {
        console.error(
          `Invalid provider: ${value}. Use google, vertex, or all.`
        );
        process.exit(1);
      }
    } else if (arg.startsWith('--method=')) {
      const value = arg.split('=')[1];
      if (value === 'response' || value === 'function' || value === 'all') {
        options.method = value;
      } else {
        console.error(
          `Invalid method: ${value}. Use response, function, or all.`
        );
        process.exit(1);
      }
    } else if (arg === '--split-only') {
      options.splitOnly = true;
    } else if (arg === '--combined-only') {
      options.combinedOnly = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      console.error('Use --help for usage information.');
      process.exit(1);
    }
  }

  if (options.splitOnly && options.combinedOnly) {
    console.error('Cannot use --split-only and --combined-only together.');
    process.exit(1);
  }

  return options;
}

function showHelp(): void {
  console.log(`
LLM Provider Performance Comparison

Usage:
  npx tsx scripts/compare-llm-providers.ts [options]

Options:
  --provider=google|vertex|all    Provider to test (default: all)
  --method=response|function|all  Method to test (default: all)
  --split-only                    Only run split extraction tests (2-step)
  --combined-only                 Only run combined extraction tests (1-step)
  --help                          Show this help message

Examples:
  # Test only Google AI Studio with function calling
  npx tsx scripts/compare-llm-providers.ts --provider=google --method=function

  # Test only Vertex AI with split extraction
  npx tsx scripts/compare-llm-providers.ts --provider=vertex --split-only

  # Test only responseSchema method on all providers
  npx tsx scripts/compare-llm-providers.ts --method=response

  # Test everything (default)
  npx tsx scripts/compare-llm-providers.ts
`);
}

const cliOptions = parseArgs();

if (cliOptions.help) {
  showHelp();
  process.exit(0);
}

// Load environment variables

// Load environment variables
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../apps/server/.env') });

// Set GOOGLE_APPLICATION_CREDENTIALS for Vertex AI
const serviceAccountPath = resolve(
  __dirname,
  '../spec-server-dev-vertex-ai.json'
);
process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;

import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';
import { Langfuse, LangfuseGenerationClient } from 'langfuse-node';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// Load I John chapters 1-3 for testing (subset to avoid timeouts)
const I_JOHN_PATH = resolve(__dirname, '../test-data/bible/books/62_I_John.md');
const FULL_I_JOHN_TEXT = readFileSync(I_JOHN_PATH, 'utf-8');

// Extract only chapters 1-3 (more manageable size)
const chapterMatch = FULL_I_JOHN_TEXT.match(
  /# I John[\s\S]*?(?=## Chapter 4|$)/
);
const I_JOHN_CHAPTERS_1_3 = chapterMatch
  ? chapterMatch[0].trim()
  : FULL_I_JOHN_TEXT.substring(0, 5000);

// Test prompt - extraction from chapters 1-3
const TEST_PROMPT = `Extract all entities and relationships from this Biblical text (I John chapters 1-3):

${I_JOHN_CHAPTERS_1_3}

Extract:
1. All named entities (people, divine beings, concepts, groups, places)
2. All relationships between entities (who relates to whom and how)
3. Key theological themes mentioned
4. Be thorough`;

// Schema for structured output - COMBINED (entities + relationships in one call)
const EXTRACTION_SCHEMA = {
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
            description: 'Type: PERSON, DIVINE_BEING, CONCEPT, GROUP, or THEME',
          },
          description: {
            type: Type.STRING,
            description: 'Brief description of the entity',
          },
        },
        required: ['name', 'type'],
      },
    },
    relationships: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING, description: 'Source entity name' },
          target: { type: Type.STRING, description: 'Target entity name' },
          type: {
            type: Type.STRING,
            description: 'Relationship type (e.g., PROCLAIMS, IS_WITH, etc.)',
          },
        },
        required: ['source', 'target', 'type'],
      },
    },
    themes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Key themes in the text',
    },
  },
  required: ['entities', 'relationships', 'themes'],
};

// Schema for ENTITY-ONLY extraction (split extraction step 1)
const ENTITY_ONLY_SCHEMA = {
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
            description: 'Type: PERSON, DIVINE_BEING, CONCEPT, GROUP, or THEME',
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
};

// Schema for RELATIONSHIP-ONLY extraction (split extraction step 2)
const RELATIONSHIP_ONLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    relationships: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_ref: {
            type: Type.STRING,
            description:
              'Source entity temp_id (from the provided entity list)',
          },
          target_ref: {
            type: Type.STRING,
            description:
              'Target entity temp_id (from the provided entity list)',
          },
          type: {
            type: Type.STRING,
            description:
              'Relationship type (e.g., PARENT_OF, MARRIED_TO, PROCLAIMED_BY, etc.)',
          },
          description: {
            type: Type.STRING,
            description: 'Brief description of the relationship',
          },
        },
        required: ['source_ref', 'target_ref', 'type'],
      },
    },
  },
  required: ['relationships'],
};

// Function declaration for function calling test - COMBINED
const EXTRACTION_FUNCTION = {
  name: 'extract_entities_and_relationships',
  description: 'Extract entities and relationships from Biblical text',
  parameters: EXTRACTION_SCHEMA,
};

// Function declaration for ENTITY-ONLY extraction
const ENTITY_ONLY_FUNCTION = {
  name: 'extract_entities',
  description: 'Extract entities from Biblical text',
  parameters: ENTITY_ONLY_SCHEMA,
};

// Function declaration for RELATIONSHIP-ONLY extraction
const RELATIONSHIP_ONLY_FUNCTION = {
  name: 'build_relationships',
  description: 'Build relationships between extracted entities',
  parameters: RELATIONSHIP_ONLY_SCHEMA,
};

interface TestResult {
  run: number;
  provider: string;
  method: string;
  durationMs: number;
  success: boolean;
  entityCount?: number;
  relationshipCount?: number;
  themeCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  error?: string;
  // Split extraction timing breakdown
  entityStepMs?: number;
  relationshipStepMs?: number;
}

// Configuration
const REQUEST_TIMEOUT_MS = 120000; // 120 seconds per step (increased for split extraction)
const MAX_OUTPUT_TOKENS = 65535; // Max for Gemini 2.5
const MODEL = 'gemini-2.5-flash';
const NUM_RUNS = 3; // Reduced from 10 for faster iteration
const NUM_WARMUP = 1; // Single warmup run

// Langfuse client
let langfuse: Langfuse | null = null;
let sessionTraceId: string | null = null;

function initLangfuse(): void {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_HOST;

  if (!publicKey || !secretKey || !baseUrl) {
    console.log('⚠️  Langfuse not configured - tracing disabled');
    return;
  }

  try {
    langfuse = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
      flushAt: 1,
      flushInterval: 1000,
    });
    console.log(`✅ Langfuse initialized at ${baseUrl} (env: test)`);
  } catch (error) {
    console.error('❌ Failed to initialize Langfuse:', error);
    langfuse = null;
  }
}

function createSessionTrace(): string | null {
  if (!langfuse) return null;

  const traceId = `llm-comparison-${randomUUID()}`;
  try {
    langfuse.trace({
      id: traceId,
      name: 'LLM Provider Comparison',
      metadata: {
        model: MODEL,
        numRuns: NUM_RUNS,
        numWarmup: NUM_WARMUP,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        inputTextLength: TEST_PROMPT.length,
        environment: 'test',
      },
      tags: ['comparison', 'benchmark', 'test'],
      timestamp: new Date(),
    });
    console.log(`📊 Langfuse trace: ${traceId}`);
    return traceId;
  } catch (error) {
    console.error('Failed to create session trace:', error);
    return null;
  }
}

function createGeneration(
  provider: string,
  method: string,
  run: number,
  isWarmup: boolean
): LangfuseGenerationClient | null {
  if (!langfuse || !sessionTraceId) return null;

  try {
    return langfuse.generation({
      traceId: sessionTraceId,
      name: `${provider}/${method}${isWarmup ? '/warmup' : ''}`,
      input: { prompt: TEST_PROMPT.substring(0, 500) + '...' },
      metadata: {
        provider,
        method,
        run,
        isWarmup,
        model: MODEL,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        environment: 'test',
      },
      startTime: new Date(),
    });
  } catch (error) {
    console.error('Failed to create generation:', error);
    return null;
  }
}

function updateGeneration(
  generation: LangfuseGenerationClient | null,
  result: TestResult
): void {
  if (!generation || !langfuse) return;

  try {
    generation.update({
      output: result.success
        ? {
            entityCount: result.entityCount,
            relationshipCount: result.relationshipCount,
            themeCount: result.themeCount,
          }
        : { error: result.error },
      usage: result.promptTokens
        ? {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: result.totalTokens,
          }
        : undefined,
      model: MODEL,
      endTime: new Date(),
      level: result.success ? undefined : 'ERROR',
      statusMessage: result.success ? undefined : result.error,
    });
  } catch (error) {
    console.error('Failed to update generation:', error);
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

async function runTest(
  ai: GoogleGenAI,
  provider: string,
  method: 'responseSchema' | 'function_calling',
  run: number,
  isWarmup: boolean = false
): Promise<TestResult> {
  const startTime = Date.now();
  const generation = createGeneration(provider, method, run, isWarmup);

  try {
    let entityCount = 0;
    let relationshipCount = 0;
    let themeCount = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    if (method === 'responseSchema') {
      const response = await withTimeout(
        ai.models.generateContent({
          model: MODEL,
          contents: TEST_PROMPT,
          config: {
            responseMimeType: 'application/json',
            responseSchema: EXTRACTION_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
        REQUEST_TIMEOUT_MS,
        `${provider}/responseSchema`
      );

      const parsed = JSON.parse(response.text || '{}');
      entityCount = parsed.entities?.length || 0;
      relationshipCount = parsed.relationships?.length || 0;
      themeCount = parsed.themes?.length || 0;

      // Extract usage metadata
      if (response.usageMetadata) {
        promptTokens = response.usageMetadata.promptTokenCount || 0;
        completionTokens = response.usageMetadata.candidatesTokenCount || 0;
        totalTokens = response.usageMetadata.totalTokenCount || 0;
      }
    } else {
      const response = await withTimeout(
        ai.models.generateContent({
          model: MODEL,
          contents: TEST_PROMPT,
          config: {
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            tools: [{ functionDeclarations: [EXTRACTION_FUNCTION] }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['extract_entities_and_relationships'],
              },
            },
          },
        }),
        REQUEST_TIMEOUT_MS,
        `${provider}/function_calling`
      );

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const args = functionCalls[0].args as any;
        entityCount = args.entities?.length || 0;
        relationshipCount = args.relationships?.length || 0;
        themeCount = args.themes?.length || 0;
      }

      // Extract usage metadata
      if (response.usageMetadata) {
        promptTokens = response.usageMetadata.promptTokenCount || 0;
        completionTokens = response.usageMetadata.candidatesTokenCount || 0;
        totalTokens = response.usageMetadata.totalTokenCount || 0;
      }
    }

    const result: TestResult = {
      run,
      provider,
      method,
      durationMs: Date.now() - startTime,
      success: true,
      entityCount,
      relationshipCount,
      themeCount,
      promptTokens,
      completionTokens,
      totalTokens,
    };

    updateGeneration(generation, result);
    return result;
  } catch (error) {
    const result: TestResult = {
      run,
      provider,
      method,
      durationMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    updateGeneration(generation, result);
    return result;
  }
}

/**
 * Generate a temp_id from entity name and type (matching production logic)
 */
function generateTempId(name: string, type: string): string {
  const sanitized = `${name}_${type}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
  return `temp_${sanitized}`;
}

/**
 * Build the entity extraction prompt (entities only)
 */
function buildEntityPrompt(documentText: string): string {
  return `Extract all entities from this Biblical text.

DOCUMENT TEXT:
${documentText}

INSTRUCTIONS:
1. Extract all named entities (people, divine beings, concepts, groups, places, themes)
2. For each entity provide:
   - name: The exact name as it appears in the text
   - type: One of PERSON, DIVINE_BEING, CONCEPT, GROUP, PLACE, THEME
   - description: A brief description based on the text
3. Be thorough - extract ALL entities mentioned
4. Return ONLY the entities array`;
}

/**
 * Build the relationship extraction prompt (relationships only, using extracted entities)
 */
function buildRelationshipPrompt(
  documentText: string,
  entities: Array<{
    temp_id: string;
    name: string;
    type: string;
    description?: string;
  }>
): string {
  const entityList = entities
    .map(
      (e) =>
        `- ${e.temp_id}: ${e.name} (${e.type})${
          e.description ? ` - ${e.description}` : ''
        }`
    )
    .join('\n');

  return `Build relationships between the extracted entities based on the document text.

DOCUMENT TEXT:
${documentText}

EXTRACTED ENTITIES:
${entityList}

INSTRUCTIONS:
1. Analyze the document and identify relationships between the entities listed above
2. Use the temp_id values (e.g., "temp_god_divine_being") as source_ref and target_ref
3. Choose appropriate relationship types like:
   - PARENT_OF, CHILD_OF, MARRIED_TO, SIBLING_OF (family)
   - PROCLAIMED_BY, REVEALED_TO, COMMANDED (divine communication)
   - MEMBER_OF, PART_OF, CONTAINS (membership/containment)
   - ASSOCIATED_WITH, RELATED_TO (general associations)
4. Provide a brief description for each relationship
5. Return ONLY the relationships array`;
}

/**
 * Run a split extraction test (2 LLM calls: entities then relationships)
 */
async function runSplitExtractionTest(
  ai: GoogleGenAI,
  provider: string,
  method: 'responseSchema' | 'function_calling',
  run: number,
  isWarmup: boolean = false,
  entityOnly: boolean = false // For warmup, only run entity step
): Promise<TestResult> {
  const startTime = Date.now();
  const methodName = `split_${method}`;
  const generation = createGeneration(provider, methodName, run, isWarmup);

  try {
    let entityCount = 0;
    let relationshipCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let entityStepMs = 0;
    let relationshipStepMs = 0;

    // STEP 1: Extract entities
    const entityPrompt = buildEntityPrompt(I_JOHN_CHAPTERS_1_3);
    const entityStepStart = Date.now();

    let extractedEntities: Array<{
      temp_id: string;
      name: string;
      type: string;
      description?: string;
    }> = [];

    if (method === 'responseSchema') {
      const entityResponse = await withTimeout(
        ai.models.generateContent({
          model: MODEL,
          contents: entityPrompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: ENTITY_ONLY_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
        REQUEST_TIMEOUT_MS,
        `${provider}/split_responseSchema/entities`
      );

      const parsed = JSON.parse(entityResponse.text || '{}');
      const rawEntities = parsed.entities || [];

      // Generate temp_ids for entities
      extractedEntities = rawEntities.map(
        (e: { name: string; type: string; description?: string }) => ({
          temp_id: generateTempId(e.name, e.type),
          name: e.name,
          type: e.type,
          description: e.description,
        })
      );

      if (entityResponse.usageMetadata) {
        totalPromptTokens += entityResponse.usageMetadata.promptTokenCount || 0;
        totalCompletionTokens +=
          entityResponse.usageMetadata.candidatesTokenCount || 0;
        totalTokens += entityResponse.usageMetadata.totalTokenCount || 0;
      }
    } else {
      // function_calling method
      const entityResponse = await withTimeout(
        ai.models.generateContent({
          model: MODEL,
          contents: entityPrompt,
          config: {
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            tools: [{ functionDeclarations: [ENTITY_ONLY_FUNCTION] }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['extract_entities'],
              },
            },
          },
        }),
        REQUEST_TIMEOUT_MS,
        `${provider}/split_function_calling/entities`
      );

      const functionCalls = entityResponse.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const args = functionCalls[0].args as any;
        const rawEntities = args.entities || [];

        extractedEntities = rawEntities.map(
          (e: { name: string; type: string; description?: string }) => ({
            temp_id: generateTempId(e.name, e.type),
            name: e.name,
            type: e.type,
            description: e.description,
          })
        );
      }

      if (entityResponse.usageMetadata) {
        totalPromptTokens += entityResponse.usageMetadata.promptTokenCount || 0;
        totalCompletionTokens +=
          entityResponse.usageMetadata.candidatesTokenCount || 0;
        totalTokens += entityResponse.usageMetadata.totalTokenCount || 0;
      }
    }

    entityStepMs = Date.now() - entityStepStart;
    entityCount = extractedEntities.length;

    // For warmup, we only run the entity step
    if (entityOnly) {
      const result: TestResult = {
        run,
        provider,
        method: methodName,
        durationMs: Date.now() - startTime,
        success: true,
        entityCount,
        relationshipCount: 0,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        entityStepMs,
        relationshipStepMs: 0,
      };
      updateGeneration(generation, result);
      return result;
    }

    // STEP 2: Build relationships using extracted entities
    if (extractedEntities.length === 0) {
      throw new Error('No entities extracted in step 1');
    }

    const relationshipPrompt = buildRelationshipPrompt(
      I_JOHN_CHAPTERS_1_3,
      extractedEntities
    );
    const relationshipStepStart = Date.now();

    if (method === 'responseSchema') {
      const relResponse = await withTimeout(
        ai.models.generateContent({
          model: MODEL,
          contents: relationshipPrompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: RELATIONSHIP_ONLY_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
        REQUEST_TIMEOUT_MS,
        `${provider}/split_responseSchema/relationships`
      );

      const parsed = JSON.parse(relResponse.text || '{}');
      relationshipCount = parsed.relationships?.length || 0;

      if (relResponse.usageMetadata) {
        totalPromptTokens += relResponse.usageMetadata.promptTokenCount || 0;
        totalCompletionTokens +=
          relResponse.usageMetadata.candidatesTokenCount || 0;
        totalTokens += relResponse.usageMetadata.totalTokenCount || 0;
      }
    } else {
      // function_calling method
      const relResponse = await withTimeout(
        ai.models.generateContent({
          model: MODEL,
          contents: relationshipPrompt,
          config: {
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            tools: [{ functionDeclarations: [RELATIONSHIP_ONLY_FUNCTION] }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['build_relationships'],
              },
            },
          },
        }),
        REQUEST_TIMEOUT_MS,
        `${provider}/split_function_calling/relationships`
      );

      const functionCalls = relResponse.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const args = functionCalls[0].args as any;
        relationshipCount = args.relationships?.length || 0;
      }

      if (relResponse.usageMetadata) {
        totalPromptTokens += relResponse.usageMetadata.promptTokenCount || 0;
        totalCompletionTokens +=
          relResponse.usageMetadata.candidatesTokenCount || 0;
        totalTokens += relResponse.usageMetadata.totalTokenCount || 0;
      }
    }

    relationshipStepMs = Date.now() - relationshipStepStart;

    const result: TestResult = {
      run,
      provider,
      method: methodName,
      durationMs: Date.now() - startTime,
      success: true,
      entityCount,
      relationshipCount,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens,
      entityStepMs,
      relationshipStepMs,
    };

    updateGeneration(generation, result);
    return result;
  } catch (error) {
    const result: TestResult = {
      run,
      provider,
      method: methodName,
      durationMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    updateGeneration(generation, result);
    return result;
  }
}

function calculateStats(results: TestResult[]) {
  const successful = results.filter((r) => r.success);
  const durations = successful.map((r) => r.durationMs);

  if (durations.length === 0) {
    return { min: 0, max: 0, avg: 0, median: 0, stdDev: 0, successRate: 0 };
  }

  durations.sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / durations.length;
  const median =
    durations.length % 2 === 0
      ? (durations[durations.length / 2 - 1] +
          durations[durations.length / 2]) /
        2
      : durations[Math.floor(durations.length / 2)];

  // Calculate standard deviation
  const squaredDiffs = durations.map((d) => Math.pow(d - avg, 2));
  const avgSquaredDiff =
    squaredDiffs.reduce((a, b) => a + b, 0) / durations.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  // Average token counts
  const avgPromptTokens = Math.round(
    successful.reduce((a, r) => a + (r.promptTokens || 0), 0) /
      successful.length
  );
  const avgCompletionTokens = Math.round(
    successful.reduce((a, r) => a + (r.completionTokens || 0), 0) /
      successful.length
  );

  return {
    min: durations[0],
    max: durations[durations.length - 1],
    avg: Math.round(avg),
    median: Math.round(median),
    stdDev: Math.round(stdDev),
    successRate: Math.round((successful.length / results.length) * 100),
    avgPromptTokens,
    avgCompletionTokens,
  };
}

/**
 * Run a test variant (warmup + measured runs) with early abort if warmup fails
 * Returns true if the variant was run successfully (warmup passed)
 */
async function runTestVariant(
  ai: GoogleGenAI,
  provider: string,
  method: 'responseSchema' | 'function_calling',
  results: TestResult[]
): Promise<boolean> {
  console.log(`   Method: ${method}`);

  // Warmup runs - abort if second warmup fails
  let warmupFailures = 0;
  for (let i = 1; i <= NUM_WARMUP; i++) {
    process.stdout.write(`   Warmup ${i}/${NUM_WARMUP}... `);
    const result = await runTest(ai, provider, method, 0, true);

    if (result.success) {
      console.log(
        `✅ ${result.durationMs}ms (warmup, ${result.entityCount} entities)`
      );
      warmupFailures = 0; // Reset on success
    } else {
      console.log(`❌ ${result.error}`);
      warmupFailures++;

      // If this is the second consecutive failure (or second warmup failed), abort
      if (i === NUM_WARMUP && !result.success) {
        console.log(
          `   ⚠️  Warmup failed - skipping ${provider}/${method} variant`
        );
        console.log('');
        return false;
      }
    }
  }

  // Measured runs
  for (let i = 1; i <= NUM_RUNS; i++) {
    process.stdout.write(`   Run ${i}/${NUM_RUNS}... `);
    const result = await runTest(ai, provider, method, i, false);
    results.push(result);

    if (result.success) {
      console.log(
        `✅ ${result.durationMs}ms (${result.entityCount} entities, ${result.relationshipCount} rels, ${result.totalTokens} tokens)`
      );
    } else {
      console.log(`❌ ${result.error}`);
    }
  }

  console.log('');
  return true;
}

/**
 * Run a split extraction test variant (warmup entity-only + measured full runs)
 * Returns true if the variant was run successfully (warmup passed)
 */
async function runSplitTestVariant(
  ai: GoogleGenAI,
  provider: string,
  method: 'responseSchema' | 'function_calling',
  results: TestResult[]
): Promise<boolean> {
  const methodName = `split_${method}`;
  console.log(`   Method: ${methodName}`);

  // Warmup runs - ENTITY ONLY (as per user request)
  let warmupFailures = 0;
  for (let i = 1; i <= NUM_WARMUP; i++) {
    process.stdout.write(`   Warmup ${i}/${NUM_WARMUP} (entity only)... `);
    const result = await runSplitExtractionTest(
      ai,
      provider,
      method,
      0,
      true,
      true // entity only
    );

    if (result.success) {
      console.log(
        `✅ ${result.durationMs}ms (warmup, ${result.entityCount} entities)`
      );
      warmupFailures = 0;
    } else {
      console.log(`❌ ${result.error}`);
      warmupFailures++;

      if (i === NUM_WARMUP && !result.success) {
        console.log(
          `   ⚠️  Warmup failed - skipping ${provider}/${methodName} variant`
        );
        console.log('');
        return false;
      }
    }
  }

  // Measured runs - FULL 2-step extraction
  for (let i = 1; i <= NUM_RUNS; i++) {
    process.stdout.write(`   Run ${i}/${NUM_RUNS}... `);
    const result = await runSplitExtractionTest(
      ai,
      provider,
      method,
      i,
      false,
      false // full extraction
    );
    results.push(result);

    if (result.success) {
      console.log(
        `✅ ${result.durationMs}ms total (entity: ${result.entityStepMs}ms, rel: ${result.relationshipStepMs}ms) ` +
          `(${result.entityCount} entities, ${result.relationshipCount} rels, ${result.totalTokens} tokens)`
      );
    } else {
      console.log(`❌ ${result.error}`);
    }
  }

  console.log('');
  return true;
}

async function main() {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const gcpProjectId = process.env.GCP_PROJECT_ID;
  const vertexLocation = process.env.VERTEX_AI_LOCATION || 'europe-central2';

  // Determine which providers and methods to run based on CLI options
  const runGoogle =
    cliOptions.provider === 'all' || cliOptions.provider === 'google';
  const runVertex =
    cliOptions.provider === 'all' || cliOptions.provider === 'vertex';
  const runResponseSchema =
    cliOptions.method === 'all' || cliOptions.method === 'response';
  const runFunctionCalling =
    cliOptions.method === 'all' || cliOptions.method === 'function';
  const runCombined = !cliOptions.splitOnly;
  const runSplit = !cliOptions.combinedOnly;

  console.log(
    '╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║         LLM Provider Performance Comparison                    ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝'
  );
  console.log('');

  // Initialize Langfuse
  initLangfuse();
  sessionTraceId = createSessionTrace();
  console.log('');

  console.log(`Configuration:`);
  console.log(`  Model: ${MODEL}`);
  console.log(
    `  Warmup runs: ${NUM_WARMUP} (abort variant if 2nd warmup fails)`
  );
  console.log(`  Measured runs: ${NUM_RUNS}`);
  console.log(`  Request timeout: ${REQUEST_TIMEOUT_MS}ms`);
  console.log(`  Max output tokens: ${MAX_OUTPUT_TOKENS}`);
  console.log(`  Input: Full I John (5 chapters, ${TEST_PROMPT.length} chars)`);
  console.log('');
  console.log(`Filters:`);
  console.log(`  Providers: ${cliOptions.provider}`);
  console.log(`  Methods: ${cliOptions.method}`);
  console.log(
    `  Test types: ${
      cliOptions.splitOnly
        ? 'split only'
        : cliOptions.combinedOnly
        ? 'combined only'
        : 'all'
    }`
  );
  console.log('');

  const results: TestResult[] = [];

  // Test Google AI Studio
  if (runGoogle && googleApiKey) {
    console.log('🔵 Testing Google AI Studio (API Key)...');
    console.log('');

    const googleAI = new GoogleGenAI({ apiKey: googleApiKey });

    // Combined extraction tests
    if (runCombined) {
      if (runResponseSchema) {
        await runTestVariant(
          googleAI,
          'google-ai-studio',
          'responseSchema',
          results
        );
      }
      if (runFunctionCalling) {
        await runTestVariant(
          googleAI,
          'google-ai-studio',
          'function_calling',
          results
        );
      }
    }

    // Split extraction tests
    if (runSplit) {
      if (runResponseSchema) {
        await runSplitTestVariant(
          googleAI,
          'google-ai-studio',
          'responseSchema',
          results
        );
      }
      if (runFunctionCalling) {
        await runSplitTestVariant(
          googleAI,
          'google-ai-studio',
          'function_calling',
          results
        );
      }
    }
  } else if (runGoogle && !googleApiKey) {
    console.log('⚠️  Skipping Google AI Studio - GOOGLE_API_KEY not set');
    console.log('');
  }

  // Test Vertex AI
  if (runVertex && gcpProjectId) {
    console.log('🟢 Testing Vertex AI (Service Account)...');
    console.log(`   Project: ${gcpProjectId}`);
    console.log(`   Location: ${vertexLocation}`);
    console.log('');

    // Read service account credentials
    const credentials = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

    const vertexAI = new GoogleGenAI({
      vertexai: true,
      project: gcpProjectId,
      location: vertexLocation,
      googleAuthOptions: {
        credentials,
      },
    });

    // Combined extraction tests
    if (runCombined) {
      if (runResponseSchema) {
        await runTestVariant(vertexAI, 'vertex-ai', 'responseSchema', results);
      }
      if (runFunctionCalling) {
        await runTestVariant(
          vertexAI,
          'vertex-ai',
          'function_calling',
          results
        );
      }
    }

    // Split extraction tests
    if (runSplit) {
      if (runResponseSchema) {
        await runSplitTestVariant(
          vertexAI,
          'vertex-ai',
          'responseSchema',
          results
        );
      }
      if (runFunctionCalling) {
        await runSplitTestVariant(
          vertexAI,
          'vertex-ai',
          'function_calling',
          results
        );
      }
    }
  } else if (runVertex && !gcpProjectId) {
    console.log('⚠️  Skipping Vertex AI - GCP_PROJECT_ID not set');
    console.log('');
  }

  // Print summary
  console.log(
    '╔════════════════════════════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║                                       SUMMARY                                              ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════════════════════════════════╝'
  );
  console.log('');

  const providers = ['google-ai-studio', 'vertex-ai'];
  const methods = [
    'responseSchema',
    'function_calling',
    'split_responseSchema',
    'split_function_calling',
  ];

  console.log(
    '┌───────────────────┬───────────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐'
  );
  console.log(
    '│ Provider          │ Method                │ Min     │ Max     │ Avg     │ Median  │ StdDev  │ Success │'
  );
  console.log(
    '├───────────────────┼───────────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤'
  );

  for (const provider of providers) {
    for (const method of methods) {
      const filtered = results.filter(
        (r) => r.provider === provider && r.method === method
      );
      if (filtered.length === 0) continue;

      const stats = calculateStats(filtered);
      console.log(
        `│ ${provider.padEnd(17)} │ ${method.padEnd(21)} │ ${String(
          stats.min
        ).padStart(5)}ms │ ${String(stats.max).padStart(5)}ms │ ${String(
          stats.avg
        ).padStart(5)}ms │ ${String(stats.median).padStart(5)}ms │ ${String(
          stats.stdDev
        ).padStart(5)}ms │ ${String(stats.successRate).padStart(5)}%  │`
      );
    }
  }

  console.log(
    '└───────────────────┴───────────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘'
  );
  console.log('');

  // Token usage summary
  console.log('Token Usage (averages):');
  for (const provider of providers) {
    for (const method of methods) {
      const filtered = results.filter(
        (r) => r.provider === provider && r.method === method
      );
      if (filtered.length === 0) continue;

      const stats = calculateStats(filtered);
      console.log(
        `  ${provider}/${method}: ${stats.avgPromptTokens} prompt, ${stats.avgCompletionTokens} completion`
      );
    }
  }
  console.log('');

  // Step timing breakdown for split extraction methods
  const hasSplitResults = results.some((r) => r.method.startsWith('split_'));

  if (hasSplitResults) {
    console.log('Split Extraction Step Breakdown:');
    console.log(
      '┌───────────────────┬───────────────────────┬──────────────────────────────┬──────────────────────────────┬─────────────┐'
    );
    console.log(
      '│ Provider          │ Method                │ Entity Step (avg/min/max)    │ Relationship Step (avg/min/max) │ % of Total  │'
    );
    console.log(
      '├───────────────────┼───────────────────────┼──────────────────────────────┼──────────────────────────────┼─────────────┤'
    );

    for (const provider of providers) {
      for (const method of ['split_responseSchema', 'split_function_calling']) {
        const filtered = results.filter(
          (r) => r.provider === provider && r.method === method && r.success
        );
        if (filtered.length === 0) continue;

        // Entity step stats
        const entityTimes = filtered.map((r) => r.entityStepMs || 0);
        const avgEntityStep = Math.round(
          entityTimes.reduce((a, b) => a + b, 0) / entityTimes.length
        );
        const minEntityStep = Math.min(...entityTimes);
        const maxEntityStep = Math.max(...entityTimes);

        // Relationship step stats
        const relTimes = filtered.map((r) => r.relationshipStepMs || 0);
        const avgRelStep = Math.round(
          relTimes.reduce((a, b) => a + b, 0) / relTimes.length
        );
        const minRelStep = Math.min(...relTimes);
        const maxRelStep = Math.max(...relTimes);

        // Total and percentages
        const avgTotal = Math.round(
          filtered.reduce((a, r) => a + r.durationMs, 0) / filtered.length
        );
        const entityPct =
          avgTotal > 0 ? Math.round((avgEntityStep / avgTotal) * 100) : 0;
        const relPct =
          avgTotal > 0 ? Math.round((avgRelStep / avgTotal) * 100) : 0;

        // Format step times with min/max
        const entityStr = `${(avgEntityStep / 1000).toFixed(1)}s (${(
          minEntityStep / 1000
        ).toFixed(1)}-${(maxEntityStep / 1000).toFixed(1)})`;
        const relStr = `${(avgRelStep / 1000).toFixed(1)}s (${(
          minRelStep / 1000
        ).toFixed(1)}-${(maxRelStep / 1000).toFixed(1)})`;
        const pctStr = `E:${entityPct}% R:${relPct}%`;

        console.log(
          `│ ${provider.padEnd(17)} │ ${method.padEnd(21)} │ ${entityStr.padEnd(
            28
          )} │ ${relStr.padEnd(28)} │ ${pctStr.padEnd(11)} │`
        );
      }
    }

    console.log(
      '└───────────────────┴───────────────────────┴──────────────────────────────┴──────────────────────────────┴─────────────┘'
    );
    console.log('');
    console.log(
      '  Legend: E = Entity extraction step, R = Relationship extraction step'
    );
    console.log(
      '  Note: Relationship step includes context from entity extraction in prompt'
    );
    console.log('');
  }

  // Extraction quality summary (entities/relationships)
  console.log('Extraction Output (averages):');
  console.log(
    '┌───────────────────┬───────────────────────┬─────────────────┬─────────────────┬─────────────┐'
  );
  console.log(
    '│ Provider          │ Method                │ Entities        │ Relationships   │ Ratio (R/E) │'
  );
  console.log(
    '├───────────────────┼───────────────────────┼─────────────────┼─────────────────┼─────────────┤'
  );

  for (const provider of providers) {
    for (const method of methods) {
      const filtered = results.filter(
        (r) => r.provider === provider && r.method === method && r.success
      );
      if (filtered.length === 0) continue;

      const entityCounts = filtered.map((r) => r.entityCount || 0);
      const relCounts = filtered.map((r) => r.relationshipCount || 0);

      const avgEntities = Math.round(
        entityCounts.reduce((a, b) => a + b, 0) / entityCounts.length
      );
      const minEntities = Math.min(...entityCounts);
      const maxEntities = Math.max(...entityCounts);

      const avgRels = Math.round(
        relCounts.reduce((a, b) => a + b, 0) / relCounts.length
      );
      const minRels = Math.min(...relCounts);
      const maxRels = Math.max(...relCounts);

      const ratio = avgEntities > 0 ? (avgRels / avgEntities).toFixed(1) : '0';

      const entityStr = `${avgEntities} (${minEntities}-${maxEntities})`;
      const relStr = `${avgRels} (${minRels}-${maxRels})`;

      console.log(
        `│ ${provider.padEnd(17)} │ ${method.padEnd(21)} │ ${entityStr.padEnd(
          15
        )} │ ${relStr.padEnd(15)} │ ${ratio.padStart(11)} │`
      );
    }
  }

  console.log(
    '└───────────────────┴───────────────────────┴─────────────────┴─────────────────┴─────────────┘'
  );
  console.log('');

  // Finalize Langfuse trace
  if (langfuse && sessionTraceId) {
    try {
      langfuse.trace({
        id: sessionTraceId,
        output: {
          summary: providers.flatMap((p) =>
            methods.map((m) => {
              const filtered = results.filter(
                (r) => r.provider === p && r.method === m
              );
              return { provider: p, method: m, ...calculateStats(filtered) };
            })
          ),
        },
        tags: ['completed'],
      });
      await langfuse.flushAsync();
      console.log('📊 Langfuse trace finalized');
    } catch (error) {
      console.error('Failed to finalize Langfuse trace:', error);
    }
    await langfuse.shutdownAsync();
  }

  // Print raw results as JSON for analysis
  console.log('');
  console.log('Raw results (JSON):');
  console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
