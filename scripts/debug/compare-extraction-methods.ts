#!/usr/bin/env npx tsx
/**
 * Compare Entity Extraction Methods
 *
 * This script compares different extraction methods to determine which
 * produces the best results for entity properties:
 *
 * 1. function_calling - Current method (uses tools/functionDeclarations)
 * 2. json_schema - Uses responseMimeType: "application/json" with responseSchema
 * 3. json_freeform - Uses responseMimeType: "application/json" without schema
 * 4. text_generation - Plain text generation, parse JSON from response
 *
 * Usage:
 *   npx tsx scripts/debug/compare-extraction-methods.ts
 *   npx tsx scripts/debug/compare-extraction-methods.ts --model gemini-2.5-flash
 *   npx tsx scripts/debug/compare-extraction-methods.ts --methods function_calling,json_freeform
 */

import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';
import { z } from 'zod';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_METHODS = [
  'function_calling',
  'json_schema',
  'json_freeform',
  'text_generation',
];

// Parse command line arguments
const args = process.argv.slice(2);
const modelArg = args.find((a) => a.startsWith('--model='));
const methodsArg = args.find((a) => a.startsWith('--methods='));

const MODEL = modelArg ? modelArg.split('=')[1] : DEFAULT_MODEL;
const METHODS = methodsArg
  ? methodsArg.split('=')[1].split(',')
  : DEFAULT_METHODS;

// ============================================================================
// Test Document (II John - same as your tests)
// ============================================================================

const TEST_DOCUMENT = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever:
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
4. I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father.
5. And now I ask you, dear lady — not as though I were writing you a new commandment, but the one we have had from the beginning — that we love one another.
6. And this is love, that we walk according to his commandments; this is the commandment, just as you have heard from the beginning, so that you should walk in it.
7. For many deceivers have gone out into the world, those who do not confess the coming of Jesus Christ in the flesh. Such a one is the deceiver and the antichrist.
8. Watch yourselves, so that you may not lose what we have worked for, but may win a full reward.
9. Everyone who goes on ahead and does not abide in the teaching of Christ, does not have God. Whoever abides in the teaching has both the Father and the Son.
10. If anyone comes to you and does not bring this teaching, do not receive him into your house or give him any greeting,
11. for whoever greets him takes part in his wicked works.
12. Though I have much to write to you, I would rather not use paper and ink. Instead I hope to come to you and talk face to face, so that our joy may be complete.
13. The children of your elect sister greet you.`;

// ============================================================================
// Entity Type Definitions (simplified for testing)
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

${TEST_DOCUMENT}

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

// Zod schema for validation
const EntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

const ExtractedEntitiesSchema = z.object({
  entities: z.array(EntitySchema),
});

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
// Extraction Methods
// ============================================================================

interface ExtractionResult {
  method: string;
  success: boolean;
  entities: Array<{
    name: string;
    type: string;
    description?: string;
    properties?: Record<string, unknown>;
  }>;
  entitiesWithProperties: number;
  totalPropertyCount: number;
  durationMs: number;
  error?: string;
  rawResponse?: string;
}

async function extractWithFunctionCalling(
  ai: GoogleGenAI
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const method = 'function_calling';

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: EXTRACTION_PROMPT,
      config: {
        temperature: 0.1,
        maxOutputTokens: 16000,
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
        method,
        success: false,
        entities: [],
        entitiesWithProperties: 0,
        totalPropertyCount: 0,
        durationMs: Date.now() - startTime,
        error: 'No function calls in response',
        rawResponse: response.text,
      };
    }

    const targetCall = functionCalls.find(
      (fc) => fc.name === 'extract_entities'
    );
    if (!targetCall || !targetCall.args) {
      return {
        method,
        success: false,
        entities: [],
        entitiesWithProperties: 0,
        totalPropertyCount: 0,
        durationMs: Date.now() - startTime,
        error: 'extract_entities function not called',
      };
    }

    const data = targetCall.args as {
      entities: Array<Record<string, unknown>>;
    };
    const entities = data.entities || [];

    return analyzeResults(method, entities, Date.now() - startTime);
  } catch (error) {
    return {
      method,
      success: false,
      entities: [],
      entitiesWithProperties: 0,
      totalPropertyCount: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function extractWithJsonSchema(
  ai: GoogleGenAI
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const method = 'json_schema';

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: EXTRACTION_PROMPT,
      config: {
        temperature: 0.1,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
        responseSchema: JSON_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      return {
        method,
        success: false,
        entities: [],
        entitiesWithProperties: 0,
        totalPropertyCount: 0,
        durationMs: Date.now() - startTime,
        error: 'No text in response',
      };
    }

    const data = JSON.parse(text) as {
      entities: Array<Record<string, unknown>>;
    };
    const entities = data.entities || [];

    return analyzeResults(method, entities, Date.now() - startTime);
  } catch (error) {
    return {
      method,
      success: false,
      entities: [],
      entitiesWithProperties: 0,
      totalPropertyCount: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function extractWithJsonFreeform(
  ai: GoogleGenAI
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const method = 'json_freeform';

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: EXTRACTION_PROMPT,
      config: {
        temperature: 0.1,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
        // No responseSchema - let the model follow prompt instructions
      },
    });

    const text = response.text;
    if (!text) {
      return {
        method,
        success: false,
        entities: [],
        entitiesWithProperties: 0,
        totalPropertyCount: 0,
        durationMs: Date.now() - startTime,
        error: 'No text in response',
      };
    }

    const data = JSON.parse(text) as {
      entities: Array<Record<string, unknown>>;
    };
    const entities = data.entities || [];

    return analyzeResults(method, entities, Date.now() - startTime);
  } catch (error) {
    return {
      method,
      success: false,
      entities: [],
      entitiesWithProperties: 0,
      totalPropertyCount: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function extractWithTextGeneration(
  ai: GoogleGenAI
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const method = 'text_generation';

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
      model: MODEL,
      contents: promptWithJsonInstruction,
      config: {
        temperature: 0.1,
        maxOutputTokens: 16000,
        // Plain text generation - no JSON mode
      },
    });

    const text = response.text;
    if (!text) {
      return {
        method,
        success: false,
        entities: [],
        entitiesWithProperties: 0,
        totalPropertyCount: 0,
        durationMs: Date.now() - startTime,
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

    const data = JSON.parse(jsonText) as {
      entities: Array<Record<string, unknown>>;
    };
    const entities = data.entities || [];

    return analyzeResults(method, entities, Date.now() - startTime, text);
  } catch (error) {
    return {
      method,
      success: false,
      entities: [],
      entitiesWithProperties: 0,
      totalPropertyCount: 0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Analysis Helpers
// ============================================================================

function analyzeResults(
  method: string,
  entities: Array<Record<string, unknown>>,
  durationMs: number,
  rawResponse?: string
): ExtractionResult {
  let entitiesWithProperties = 0;
  let totalPropertyCount = 0;

  const analyzedEntities = entities.map((e) => {
    const props = e.properties as Record<string, unknown> | undefined;
    const propCount = props ? Object.keys(props).length : 0;

    if (propCount > 0) {
      entitiesWithProperties++;
      totalPropertyCount += propCount;
    }

    return {
      name: e.name as string,
      type: e.type as string,
      description: e.description as string | undefined,
      properties: props,
    };
  });

  return {
    method,
    success: true,
    entities: analyzedEntities,
    entitiesWithProperties,
    totalPropertyCount,
    durationMs,
    rawResponse,
  };
}

function printResults(results: ExtractionResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('EXTRACTION METHOD COMPARISON RESULTS');
  console.log('='.repeat(80));
  console.log(`Model: ${MODEL}`);
  console.log('='.repeat(80) + '\n');

  // Summary table
  console.log('SUMMARY:');
  console.log('-'.repeat(80));
  console.log(
    '| Method              | Success | Entities | With Props | Total Props | Duration |'
  );
  console.log(
    '|---------------------|---------|----------|------------|-------------|----------|'
  );

  for (const r of results) {
    const methodPad = r.method.padEnd(19);
    const successPad = (r.success ? 'Yes' : 'No').padEnd(7);
    const entitiesPad = String(r.entities.length).padEnd(8);
    const withPropsPad = String(r.entitiesWithProperties).padEnd(10);
    const totalPropsPad = String(r.totalPropertyCount).padEnd(11);
    const durationPad = `${r.durationMs}ms`.padEnd(8);

    console.log(
      `| ${methodPad} | ${successPad} | ${entitiesPad} | ${withPropsPad} | ${totalPropsPad} | ${durationPad} |`
    );
  }
  console.log('-'.repeat(80) + '\n');

  // Property population rate
  console.log('PROPERTY POPULATION RATE:');
  console.log('-'.repeat(80));
  for (const r of results) {
    if (r.success && r.entities.length > 0) {
      const rate = (
        (r.entitiesWithProperties / r.entities.length) *
        100
      ).toFixed(1);
      const avgProps =
        r.entitiesWithProperties > 0
          ? (r.totalPropertyCount / r.entitiesWithProperties).toFixed(1)
          : '0';
      console.log(
        `${r.method}: ${rate}% of entities have properties (avg ${avgProps} props/entity)`
      );
    } else if (!r.success) {
      console.log(`${r.method}: FAILED - ${r.error}`);
    }
  }
  console.log();

  // Detailed entity breakdown for each method
  console.log('DETAILED RESULTS:');
  console.log('-'.repeat(80));

  for (const r of results) {
    console.log(`\n### ${r.method.toUpperCase()} ###`);
    if (!r.success) {
      console.log(`  ERROR: ${r.error}`);
      continue;
    }

    console.log(`  Total entities: ${r.entities.length}`);
    console.log(`  Entities with properties: ${r.entitiesWithProperties}`);
    console.log(`  Total properties: ${r.totalPropertyCount}`);
    console.log(`  Duration: ${r.durationMs}ms`);
    console.log('\n  Entities:');

    for (const e of r.entities) {
      const propCount = e.properties ? Object.keys(e.properties).length : 0;
      const propStatus = propCount > 0 ? `[${propCount} props]` : '[NO PROPS]';
      console.log(`    - ${e.name} (${e.type}) ${propStatus}`);

      if (e.properties && Object.keys(e.properties).length > 0) {
        for (const [key, value] of Object.entries(e.properties)) {
          const valueStr =
            typeof value === 'string'
              ? value.length > 50
                ? value.substring(0, 50) + '...'
                : value
              : JSON.stringify(value);
          console.log(`        ${key}: ${valueStr}`);
        }
      }
    }
  }

  // Winner determination
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATION:');
  console.log('='.repeat(80));

  const successfulResults = results.filter((r) => r.success);
  if (successfulResults.length === 0) {
    console.log('All methods failed!');
    return;
  }

  // Sort by property population rate, then by total properties
  const ranked = successfulResults.sort((a, b) => {
    const rateA =
      a.entities.length > 0 ? a.entitiesWithProperties / a.entities.length : 0;
    const rateB =
      b.entities.length > 0 ? b.entitiesWithProperties / b.entities.length : 0;

    if (rateB !== rateA) return rateB - rateA;
    return b.totalPropertyCount - a.totalPropertyCount;
  });

  const winner = ranked[0];
  const rate = (
    (winner.entitiesWithProperties / winner.entities.length) *
    100
  ).toFixed(1);

  console.log(`\nBest method: ${winner.method}`);
  console.log(`  - ${rate}% property population rate`);
  console.log(`  - ${winner.totalPropertyCount} total properties extracted`);
  console.log(`  - ${winner.durationMs}ms execution time`);

  if (winner.method !== 'function_calling') {
    console.log(
      `\n  ** Switching from function_calling to ${winner.method} is recommended **`
    );
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('Entity Extraction Method Comparison');
  console.log('===================================\n');

  // Check for required environment variables
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLOUD_API_KEY;
  const projectId = process.env.VERTEX_PROJECT_ID || process.env.GCP_PROJECT_ID;
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Try to load project from service account JSON if not set
  let effectiveProjectId = projectId;
  if (!effectiveProjectId && serviceAccountPath) {
    try {
      const fs = await import('fs');
      const saContent = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      effectiveProjectId = saContent.project_id;
    } catch {
      // Ignore
    }
  }

  // If still no project, check for spec-server-dev-vertex-ai.json
  if (!effectiveProjectId && !apiKey) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const saPath = path.join(process.cwd(), 'spec-server-dev-vertex-ai.json');
      if (fs.existsSync(saPath)) {
        const saContent = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        effectiveProjectId = saContent.project_id;
        process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
        console.log(`Using service account from: ${saPath}`);
      }
    } catch {
      // Ignore
    }
  }

  if (!apiKey && !effectiveProjectId) {
    console.error(
      'Error: Either GOOGLE_API_KEY, GOOGLE_APPLICATION_CREDENTIALS, or VERTEX_PROJECT_ID must be set'
    );
    process.exit(1);
  }

  console.log(`Model: ${MODEL}`);
  console.log(`Methods to test: ${METHODS.join(', ')}`);
  console.log(
    `Using: ${apiKey ? 'API Key' : `Vertex AI (${effectiveProjectId})`}\n`
  );

  // Initialize the client
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    vertexai: !apiKey,
    project: effectiveProjectId,
    location: process.env.VERTEX_LOCATION || 'europe-central2',
  });

  const results: ExtractionResult[] = [];

  // Run each method
  for (const method of METHODS) {
    console.log(`\nRunning ${method}...`);

    let result: ExtractionResult;

    switch (method) {
      case 'function_calling':
        result = await extractWithFunctionCalling(ai);
        break;
      case 'json_schema':
        result = await extractWithJsonSchema(ai);
        break;
      case 'json_freeform':
        result = await extractWithJsonFreeform(ai);
        break;
      case 'text_generation':
        result = await extractWithTextGeneration(ai);
        break;
      default:
        console.log(`  Unknown method: ${method}`);
        continue;
    }

    results.push(result);

    if (result.success) {
      console.log(
        `  Success: ${result.entities.length} entities, ${result.entitiesWithProperties} with properties`
      );
    } else {
      console.log(`  Failed: ${result.error}`);
    }
  }

  // Print comparison results
  printResults(results);
}

main().catch(console.error);
