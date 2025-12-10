#!/usr/bin/env npx tsx
/**
 * Test Extraction Script
 *
 * Runs a single extraction job on a small sample text to verify
 * the LLM extraction pipeline is working correctly.
 *
 * Usage:
 *   npx tsx scripts/test-extraction.ts
 *   npx tsx scripts/test-extraction.ts --type Person
 *   npx tsx scripts/test-extraction.ts --text "Custom text to extract from"
 *
 * Environment:
 *   Uses the same Vertex AI credentials as the server.
 *   Requires GOOGLE_APPLICATION_CREDENTIALS to be set.
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'spec-server-dev',
  location: process.env.VERTEX_AI_LOCATION || 'europe-central2',
  model: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite',
  timeoutMs: 120_000, // 2 minutes
};

// Sample test document (short paragraph with extractable entities)
const DEFAULT_TEST_TEXT = `
Meeting Notes - Product Planning Session

Attendees: John Smith (Product Manager), Sarah Chen (Engineering Lead), Mike Johnson (Designer)

Discussion:
We discussed the new dashboard feature that will allow users to track their daily metrics.
John proposed a timeline of 6 weeks for the initial release. Sarah raised a concern about
the database performance with the current architecture and suggested we need to migrate
to PostgreSQL before launching. Mike will create the wireframes by Friday.

Action Items:
1. Sarah to evaluate PostgreSQL migration effort - Due: Next Monday
2. Mike to complete dashboard wireframes - Due: Friday
3. John to schedule stakeholder review meeting - Due: End of week

Risks identified:
- Timeline is aggressive given the database migration requirement
- Design resources are limited next month due to other commitments
`;

// Simple schema for Person extraction
const PERSON_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Full name of the person' },
          role: { type: 'string', description: 'Role or title of the person' },
          confidence: {
            type: 'number',
            description: 'Confidence score 0.0-1.0',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['entities'],
};

// Simple schema for Task extraction
const TASK_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Brief description of the task',
          },
          assignee: {
            type: 'string',
            description: 'Person responsible for the task',
          },
          due_date: { type: 'string', description: 'When the task is due' },
          confidence: {
            type: 'number',
            description: 'Confidence score 0.0-1.0',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['entities'],
};

// Simple schema for Risk extraction
const RISK_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Brief description of the risk',
          },
          impact: {
            type: 'string',
            description: 'Potential impact of the risk',
          },
          confidence: {
            type: 'number',
            description: 'Confidence score 0.0-1.0',
          },
        },
        required: ['name'],
      },
    },
  },
  required: ['entities'],
};

const SCHEMAS: Record<string, any> = {
  Person: PERSON_SCHEMA,
  Task: TASK_SCHEMA,
  Risk: RISK_SCHEMA,
};

/**
 * Helper to wrap a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${operationName} timed out after ${timeoutMs}ms. The LLM API may be unresponsive.`
        )
      );
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Run a single extraction test
 */
async function runExtractionTest(
  typeName: string,
  text: string
): Promise<{
  success: boolean;
  entities: any[];
  error?: string;
  durationMs: number;
}> {
  const startTime = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing extraction for type: ${typeName}`);
  console.log(`${'='.repeat(60)}`);

  // Check credentials
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    // Try to set from expected location
    const defaultPath = path.resolve(
      __dirname,
      '..',
      'spec-server-dev-vertex-ai.json'
    );
    process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultPath;
    console.log(`Set GOOGLE_APPLICATION_CREDENTIALS to: ${defaultPath}`);
  } else {
    console.log(`Using credentials: ${credPath}`);
  }

  console.log(`\nConfiguration:`);
  console.log(`  Project: ${CONFIG.projectId}`);
  console.log(`  Location: ${CONFIG.location}`);
  console.log(`  Model: ${CONFIG.model}`);
  console.log(`  Timeout: ${CONFIG.timeoutMs}ms`);

  const schema = SCHEMAS[typeName];
  if (!schema) {
    return {
      success: false,
      entities: [],
      error: `Unknown type: ${typeName}. Available types: ${Object.keys(
        SCHEMAS
      ).join(', ')}`,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Initialize ChatVertexAI
    console.log(`\nInitializing ChatVertexAI...`);
    const model = new ChatVertexAI({
      model: CONFIG.model,
      authOptions: {
        projectId: CONFIG.projectId,
      },
      location: CONFIG.location,
      temperature: 1.0,
      maxOutputTokens: 2048,
    });

    // Create structured output model
    const structuredModel = model.withStructuredOutput(schema, {
      name: `extract_${typeName.toLowerCase()}`,
    });

    // Build the prompt
    const prompt = `You are an expert entity extraction system. Extract all ${typeName} entities from the following text.

**Instructions:**
- Extract ALL ${typeName} entities found in the text
- For each entity, provide a confidence score (0.0-1.0)
- If no ${typeName} entities are found, return an empty array

**Text to analyze:**

${text}

**Output:** Return a JSON object with an "entities" array containing the extracted ${typeName} entities.`;

    console.log(`\nSending request to Vertex AI...`);
    const callStartTime = Date.now();

    // Make the LLM call with timeout
    const result: any = await withTimeout(
      structuredModel.invoke(prompt, {
        tags: ['test-extraction', typeName],
        metadata: {
          type: typeName,
          test: true,
        },
      }),
      CONFIG.timeoutMs,
      `LLM extraction for ${typeName}`
    );

    const callDuration = Date.now() - callStartTime;
    console.log(`\nLLM call completed in ${callDuration}ms`);

    const entities = result.entities || [];
    console.log(`\nExtracted ${entities.length} ${typeName} entities:`);

    for (const entity of entities) {
      console.log(
        `  - ${entity.name}${entity.role ? ` (${entity.role})` : ''}${
          entity.assignee ? ` [${entity.assignee}]` : ''
        }`
      );
    }

    return {
      success: true,
      entities,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\nExtraction failed: ${errorMessage}`);

    // Provide helpful error context
    if (errorMessage.includes('timed out')) {
      console.error(
        'The LLM API is not responding. Check if Vertex AI is accessible.'
      );
    } else if (errorMessage.includes('PERMISSION_DENIED')) {
      console.error(
        'Check that GOOGLE_APPLICATION_CREDENTIALS points to a valid service account.'
      );
    } else if (
      errorMessage.includes('500') ||
      errorMessage.includes('Internal')
    ) {
      console.error(
        'Google API returned an internal error. This may be a transient issue - try again.'
      );
    } else if (errorMessage.includes('RESOURCE_EXHAUSTED')) {
      console.error('Rate limit exceeded. Wait a moment and try again.');
    }

    return {
      success: false,
      entities: [],
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Extraction Pipeline Test Script                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let typesToTest = ['Person', 'Task', 'Risk'];
  let testText = DEFAULT_TEST_TEXT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      typesToTest = [args[i + 1]];
      i++;
    } else if (args[i] === '--text' && args[i + 1]) {
      testText = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log(`
Usage: npx tsx scripts/test-extraction.ts [options]

Options:
  --type <type>   Extract only this type (Person, Task, Risk)
  --text <text>   Use custom text instead of default sample
  --help          Show this help message

Examples:
  npx tsx scripts/test-extraction.ts
  npx tsx scripts/test-extraction.ts --type Person
  npx tsx scripts/test-extraction.ts --type Task --text "John needs to finish the report by Friday"
`);
      process.exit(0);
    }
  }

  console.log(`\nTest text (${testText.length} chars):`);
  console.log('-'.repeat(40));
  console.log(
    testText.substring(0, 200) + (testText.length > 200 ? '...' : '')
  );
  console.log('-'.repeat(40));

  const results: {
    type: string;
    success: boolean;
    entities: number;
    durationMs: number;
    error?: string;
  }[] = [];

  for (const typeName of typesToTest) {
    const result = await runExtractionTest(typeName, testText);
    results.push({
      type: typeName,
      success: result.success,
      entities: result.entities.length,
      durationMs: result.durationMs,
      error: result.error,
    });
  }

  // Print summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const allSuccess = results.every((r) => r.success);
  const totalEntities = results.reduce((sum, r) => sum + r.entities, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    console.log(
      `${status} ${result.type}: ${result.entities} entities extracted in ${result.durationMs}ms` +
        (result.error ? ` (Error: ${result.error.substring(0, 50)}...)` : '')
    );
  }

  console.log('-'.repeat(60));
  console.log(`Total: ${totalEntities} entities in ${totalDuration}ms`);
  console.log(
    `Status: ${allSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`
  );

  process.exit(allSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
