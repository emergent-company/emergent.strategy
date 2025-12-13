#!/usr/bin/env npx tsx
/**
 * Extraction Method Comparison Test
 *
 * Compares all extraction methods to determine which produces the best
 * entity property population:
 *
 * 1. function_calling - Uses tools/functionDeclarations
 * 2. structured_output - Uses responseMimeType: "application/json" with responseSchema
 * 3. json_freeform - Uses responseMimeType: "application/json" WITHOUT schema
 * 4. text_generation - Plain text generation, parse JSON from response
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/tests/method-comparison.test.ts
 *   npx tsx scripts/extraction_tests/tests/method-comparison.test.ts --runs=5
 */

import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';
import {
  createTest,
  runTests,
  parseRunsFromArgs,
  logger,
  TEST_DOCUMENTS,
  createTimer,
  flushTraces,
  shutdownTracing,
  isTracingEnabled,
  CONFIG,
} from '../lib/index.js';
import type {
  ExtractionResult,
  ExtractedEntity,
  TestConfig,
} from '../lib/index.js';

// Initialize the Google Gen AI SDK for Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: CONFIG.projectId,
  location: CONFIG.location,
});

// ============================================================================
// Entity Type Definitions
// ============================================================================

const ENTITY_TYPE_DEFINITIONS = `### Book
Biblical book or writing (one of the 66 books of the Bible)

**Properties:**
- author (string): Traditional or attributed author name
- category (string): one of ["Law", "History", "Wisdom", "Major Prophets", "Minor Prophets", "Gospels", "Acts", "Pauline Epistles", "General Epistles", "Apocalyptic"]
- testament (string): one of ["Old Testament", "New Testament"]
- chapter_count (integer): Total number of chapters

### Person
Individual person mentioned in biblical text

**Properties:**
- role (string): Position, title, or role (e.g., prophet, king, apostle, elder)
- significance (string): Why this person is important biblically
- aliases (array): Alternative names
- source_references (array): Biblical references where mentioned

### Group
Tribe, nation, religious sect, or organized group

**Properties:**
- leader (string): Leader or head
- source_references (array): Biblical references where mentioned

### Quote
Notable quotation or spoken words from the text

**Properties:**
- text (string): The quoted text
- speaker (string): Who spoke these words
- context (string): Situational context
- audience (array): Who the quote was addressed to
- source_reference (string): Biblical reference`;

// ============================================================================
// Prompt Template
// ============================================================================

const EXTRACTION_PROMPT = `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, provide:
1. name: Clear, descriptive name of the entity
2. type: Entity type from the allowed list
3. description: Brief description of what this entity represents
4. properties: Type-specific properties based on the schema definitions below

RULES:
- Extract ALL entities that match the allowed types
- Be thorough - do not miss important entities
- Use consistent naming
- Keep descriptions concise but informative
- Only include properties that are explicitly mentioned or clearly implied in the document
- Do NOT guess or fabricate property values

## Allowed Entity Types

Book, Person, Group, Quote

ONLY extract entities of these types.

## Entity Type Definitions

${ENTITY_TYPE_DEFINITIONS}

## Document

${TEST_DOCUMENTS.iiJohn}

## CRITICAL INSTRUCTIONS FOR PROPERTIES

The "properties" field is MANDATORY and must contain type-specific attributes.

RULES FOR PROPERTIES:
1. NEVER return an empty properties object {} if the document contains ANY relevant attributes
2. Extract ALL attributes mentioned in the document that match the entity type schema
3. Properties come from the schema definitions above - use them!
4. If a person's role, title, or significance is mentioned - these go in properties
5. If a book's testament or category is known - these go in properties

EXAMPLES OF CORRECT EXTRACTION:

For a Person entity:
{
  "name": "The elder",
  "type": "Person",
  "description": "The author of the epistle",
  "properties": {
    "role": "elder",
    "significance": "Author of II John"
  }
}

WRONG (empty properties):
{
  "name": "The elder",
  "type": "Person",
  "description": "The author",
  "properties": {}
}

Return the entities as a JSON object with an "entities" array.`;

// ============================================================================
// Schema Definitions
// ============================================================================

// JSON Schema for Gemini responseSchema (using Type enum)
const JSON_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    entities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING },
          description: { type: Type.STRING },
          properties: {
            type: Type.OBJECT,
            additionalProperties: true,
          },
        },
        required: ['name', 'type'],
      },
    },
  },
  required: ['entities'],
};

// Function declaration for function calling (uses plain JSON schema)
const EXTRACT_ENTITIES_FUNCTION = {
  name: 'extract_entities',
  description:
    'Extract entities from the document text. Returns an array of entities with their names, types, descriptions, and properties.',
  parameters: JSON_SCHEMA,
};

// ============================================================================
// Analysis Helpers
// ============================================================================

function analyzeResults(
  entities: ExtractedEntity[],
  durationMs: number,
  rawResponse?: string
): ExtractionResult {
  let entitiesWithProperties = 0;
  let totalPropertyCount = 0;

  for (const e of entities) {
    const props = e.properties;
    const propCount = props ? Object.keys(props).length : 0;

    if (propCount > 0) {
      entitiesWithProperties++;
      totalPropertyCount += propCount;
    }
  }

  return {
    success: true,
    entities,
    durationMs,
    entitiesWithProperties,
    totalPropertyCount,
    rawResponse,
  };
}

// ============================================================================
// Extraction Methods
// ============================================================================

async function extractWithFunctionCalling(): Promise<ExtractionResult> {
  const timer = createTimer();

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: EXTRACTION_PROMPT,
      config: {
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
        tools: [{ functionDeclarations: [EXTRACT_ENTITIES_FUNCTION] }],
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
      return {
        success: false,
        entities: [],
        durationMs: timer.stop(),
        error: 'No function calls in response',
        rawResponse: response.text,
      };
    }

    const targetCall = functionCalls.find(
      (fc) => fc.name === 'extract_entities'
    );
    if (!targetCall || !targetCall.args) {
      return {
        success: false,
        entities: [],
        durationMs: timer.stop(),
        error: 'extract_entities function not called',
      };
    }

    const data = targetCall.args as { entities: ExtractedEntity[] };
    const entities = data.entities || [];

    return analyzeResults(entities, timer.stop());
  } catch (error) {
    return {
      success: false,
      entities: [],
      durationMs: timer.stop(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function extractWithJsonSchema(): Promise<ExtractionResult> {
  const timer = createTimer();

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: EXTRACTION_PROMPT,
      config: {
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema: JSON_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      return {
        success: false,
        entities: [],
        durationMs: timer.stop(),
        error: 'No text in response',
      };
    }

    const data = JSON.parse(text) as { entities: ExtractedEntity[] };
    const entities = data.entities || [];

    return analyzeResults(entities, timer.stop(), text);
  } catch (error) {
    return {
      success: false,
      entities: [],
      durationMs: timer.stop(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function extractWithJsonFreeform(): Promise<ExtractionResult> {
  const timer = createTimer();

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: EXTRACTION_PROMPT,
      config: {
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
        responseMimeType: 'application/json',
        // No responseSchema - let the model follow prompt instructions
      },
    });

    const text = response.text;
    if (!text) {
      return {
        success: false,
        entities: [],
        durationMs: timer.stop(),
        error: 'No text in response',
      };
    }

    const data = JSON.parse(text) as { entities: ExtractedEntity[] };
    const entities = data.entities || [];

    return analyzeResults(entities, timer.stop(), text);
  } catch (error) {
    return {
      success: false,
      entities: [],
      durationMs: timer.stop(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function extractWithTextGeneration(): Promise<ExtractionResult> {
  const timer = createTimer();

  const promptWithJsonInstruction = `${EXTRACTION_PROMPT}

IMPORTANT: Return ONLY a valid JSON object with the following structure:
{
  "entities": [
    {
      "name": "...",
      "type": "...",
      "description": "...",
      "properties": { ... }
    }
  ]
}

Do not include any text before or after the JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: promptWithJsonInstruction,
      config: {
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
        // Plain text generation - no JSON mode
      },
    });

    const text = response.text;
    if (!text) {
      return {
        success: false,
        entities: [],
        durationMs: timer.stop(),
        error: 'No text in response',
      };
    }

    // Try to extract JSON from the response
    let jsonText = text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    const data = JSON.parse(jsonText) as { entities: ExtractedEntity[] };
    const entities = data.entities || [];

    return analyzeResults(entities, timer.stop(), text);
  } catch (error) {
    return {
      success: false,
      entities: [],
      durationMs: timer.stop(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const runs = parseRunsFromArgs(3);

  console.log(logger.c.info('\n=== Extraction Method Comparison Test ==='));
  console.log(logger.c.dim(`Using: @google/genai with Vertex AI`));
  console.log(logger.c.dim(`Model: ${CONFIG.model}`));
  console.log(logger.c.dim(`Project: ${CONFIG.projectId}`));
  console.log(logger.c.dim(`Location: ${CONFIG.location}`));
  console.log(logger.c.dim(`Document: II John`));
  console.log();

  const tests: TestConfig[] = [
    createTest(
      'function_calling',
      'Uses tools/functionDeclarations with forced function call',
      'function_calling',
      extractWithFunctionCalling
    ),
    createTest(
      'structured_output',
      'Uses responseMimeType: application/json with responseSchema',
      'structured_output',
      extractWithJsonSchema
    ),
    createTest(
      'json_freeform',
      'Uses responseMimeType: application/json WITHOUT schema',
      'json_freeform',
      extractWithJsonFreeform
    ),
    createTest(
      'text_generation',
      'Plain text generation with JSON in prompt instructions',
      'text_generation',
      extractWithTextGeneration
    ),
  ];

  const summaries = await runTests(tests, { runs, warmupRuns: 1 });

  // Print property population comparison
  console.log(logger.c.info('\n=== Property Population Analysis ==='));
  console.log();

  for (const summary of summaries) {
    const successfulRuns = summary.runs.filter((r) => r.result.success);
    if (successfulRuns.length === 0) {
      console.log(`${summary.testName}: No successful runs`);
      continue;
    }

    // Calculate averages from successful runs
    const avgEntitiesWithProps =
      successfulRuns.reduce(
        (sum, r) => sum + (r.result.entitiesWithProperties || 0),
        0
      ) / successfulRuns.length;
    const avgTotalProps =
      successfulRuns.reduce(
        (sum, r) => sum + (r.result.totalPropertyCount || 0),
        0
      ) / successfulRuns.length;
    const avgEntities =
      successfulRuns.reduce((sum, r) => sum + r.result.entities.length, 0) /
      successfulRuns.length;

    const propRate =
      avgEntities > 0
        ? ((avgEntitiesWithProps / avgEntities) * 100).toFixed(1)
        : '0';

    console.log(`${summary.testName}:`);
    console.log(`  Avg entities: ${avgEntities.toFixed(1)}`);
    console.log(
      `  Avg with properties: ${avgEntitiesWithProps.toFixed(1)} (${propRate}%)`
    );
    console.log(`  Avg total properties: ${avgTotalProps.toFixed(1)}`);
    console.log();
  }

  // Determine winner
  const ranked = summaries
    .filter((s) => s.stats.successfulRuns > 0)
    .map((s) => {
      const successfulRuns = s.runs.filter((r) => r.result.success);
      const avgEntities =
        successfulRuns.reduce((sum, r) => sum + r.result.entities.length, 0) /
        successfulRuns.length;
      const avgEntitiesWithProps =
        successfulRuns.reduce(
          (sum, r) => sum + (r.result.entitiesWithProperties || 0),
          0
        ) / successfulRuns.length;
      const avgTotalProps =
        successfulRuns.reduce(
          (sum, r) => sum + (r.result.totalPropertyCount || 0),
          0
        ) / successfulRuns.length;
      const propRate = avgEntities > 0 ? avgEntitiesWithProps / avgEntities : 0;

      return {
        name: s.testName,
        propRate,
        avgTotalProps,
        avgDurationMs: s.stats.avgDurationMs,
      };
    })
    .sort((a, b) => {
      // Sort by property rate first, then by total properties
      if (b.propRate !== a.propRate) return b.propRate - a.propRate;
      return b.avgTotalProps - a.avgTotalProps;
    });

  if (ranked.length > 0) {
    const winner = ranked[0];
    console.log(logger.c.success(`\n🏆 RECOMMENDED METHOD: ${winner.name}`));
    console.log(
      `   Property population rate: ${(winner.propRate * 100).toFixed(1)}%`
    );
    console.log(`   Avg total properties: ${winner.avgTotalProps.toFixed(1)}`);
    console.log(`   Avg duration: ${winner.avgDurationMs.toFixed(0)}ms`);
  }

  // Flush traces when running standalone
  if (isTracingEnabled()) {
    console.log(logger.c.dim('\nFlushing traces to Langfuse...'));
    await flushTraces();
    await shutdownTracing();
    console.log(logger.c.success('Traces sent to Langfuse'));
  }
}

main().catch(console.error);
