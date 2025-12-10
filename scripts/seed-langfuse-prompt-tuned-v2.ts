#!/usr/bin/env tsx
/**
 * Seed Tuned-v2 Relationship Builder Prompt to Langfuse
 *
 * This script creates tuned-v2 version of the relationship builder prompt
 * with a different approach than tuned-v1.
 *
 * tuned-v1 Problems:
 * - Reduced extraction but hurt recall more than helped precision
 * - Model still extracted 9 relationships for ruth-ch1-declaration (expects 0)
 *
 * tuned-v2 Strategy:
 * 1. REQUIRE explicit text evidence for every relationship
 * 2. Explicitly state that 0 relationships is a valid output
 * 3. Use structured thinking (identify text evidence FIRST, then extract)
 * 4. Reject relationships based on proximity or co-occurrence only
 * 5. Simplify rules - don't over-constrain on symmetric/inverse
 *
 * Usage:
 *   npx tsx scripts/seed-langfuse-prompt-tuned-v2.ts
 */

import { config } from 'dotenv';

// Load environment variables
config();

const PROMPT_NAME = 'relationship-builder';

/**
 * Tuned-v2 Relationship Builder Prompt
 *
 * Key changes from tuned-v1:
 * - Evidence-first approach: quote text before creating relationship
 * - Explicitly allows 0 relationships as valid output
 * - Simplified rules (removed over-constraining symmetric/inverse rules)
 * - Rejection criteria for speculative relationships
 */
const RELATIONSHIP_BUILDER_PROMPT_V2 = `You are an expert at finding connections in knowledge graphs. Your task is to identify relationships between entities that are EXPLICITLY stated in the document text.

## CRITICAL: Evidence-First Approach

For EVERY relationship you extract, you must be able to quote or closely paraphrase the SPECIFIC text that states this relationship. If you cannot point to explicit text, DO NOT extract the relationship.

## What IS a Valid Relationship

A valid relationship must have DIRECT text evidence:
- "A is the father of B" → Extract: A PARENT_OF B
- "A married B" → Extract: A MARRIED_TO B  
- "A traveled to B" → Extract: A TRAVELS_TO B
- "A is from B" / "A was born in B" → Extract: A BORN_IN B

## What is NOT a Valid Relationship

DO NOT extract relationships based on:
- **Proximity**: Two entities mentioned in the same sentence does NOT mean they're related
- **Co-occurrence**: Characters appearing in the same scene does NOT create a relationship
- **Implication**: "Naomi urged her daughters-in-law" does NOT state a specific relationship
- **Dialogue**: What characters SAY to each other is NOT a relationship between them
- **Context**: Being part of the same story does NOT create relationships

## Important: Zero Relationships is Valid

If the text contains NO explicit relationship statements, return an empty array [].

Example texts with ZERO relationships:
- Dialogue between characters (they're talking, not related)
- Descriptive passages about settings
- Internal monologue or thoughts
- Speeches or declarations

## Available Relationship Types

{{relationshipTypes}}

## Entities to Connect

{{entities}}

## Document Context

{{documentText}}

## Your Task

1. Read the document carefully
2. For each potential relationship:
   a. Identify the EXACT text that states this relationship
   b. If no exact text exists, SKIP this relationship
   c. Only extract if you can quote supporting text
3. Return the relationships as a JSON array

For each relationship provide:
- source_ref: temp_id of the source entity
- target_ref: temp_id of the target entity
- type: Relationship type from the list above
- description: The EXACT TEXT or close paraphrase that supports this relationship
- confidence: Your confidence (0.0-1.0)

REMEMBER: Quality over quantity. An empty array [] is better than speculative relationships.

Return relationships as a JSON array.`;

interface CreatePromptRequest {
  name: string;
  type: 'text' | 'chat';
  prompt: string;
  labels?: string[];
  config?: Record<string, unknown>;
  tags?: string[];
}

interface CreatePromptResponse {
  name: string;
  version: number;
  labels: string[];
  type: string;
}

/**
 * Create a prompt via Langfuse REST API
 */
async function createPrompt(
  baseUrl: string,
  auth: string,
  request: CreatePromptRequest
): Promise<CreatePromptResponse> {
  const response = await fetch(`${baseUrl}/api/public/v2/prompts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create prompt "${request.name}": ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

async function main() {
  console.log('Seeding TUNED-V2 relationship builder prompt to Langfuse...\n');

  // Check required environment variables
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl =
    process.env.LANGFUSE_BASE_URL ||
    process.env.LANGFUSE_HOST ||
    'http://localhost:3011';

  if (!secretKey || !publicKey) {
    console.error(
      'Error: LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY environment variables are required'
    );
    console.error('\nPlease set these in your .env file:');
    console.error('  LANGFUSE_SECRET_KEY=sk-lf-...');
    console.error('  LANGFUSE_PUBLIC_KEY=pk-lf-...');
    console.error('  LANGFUSE_BASE_URL=http://localhost:3011');
    process.exit(1);
  }

  console.log(`Langfuse URL: ${baseUrl}`);
  console.log(`Public Key: ${publicKey.slice(0, 12)}...`);
  console.log('');

  // Create Basic Auth header
  const auth = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString(
    'base64'
  )}`;

  try {
    // Create Tuned-v2 Relationship Builder prompt with 'tuned-v2' label
    console.log(`Creating prompt: ${PROMPT_NAME} (tuned-v2)`);
    console.log('');
    console.log('Key changes in tuned-v2 prompt:');
    console.log('  - Evidence-first: quote text BEFORE extracting');
    console.log('  - Explicitly states 0 relationships is valid');
    console.log(
      '  - Clear rejection criteria (proximity, co-occurrence, dialogue)'
    );
    console.log('  - Simplified rules (removed over-constraining from v1)');
    console.log('  - Description must contain supporting text evidence');
    console.log('');

    const result = await createPrompt(baseUrl, auth, {
      name: PROMPT_NAME,
      type: 'text',
      prompt: RELATIONSHIP_BUILDER_PROMPT_V2,
      labels: ['tuned-v2'],
      config: {
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        pipeline_node: 'relationship_builder',
        description:
          'TUNED-V2: Evidence-first approach requiring explicit text support for each relationship.',
        tuning_goal:
          'Eliminate speculative relationships by requiring text evidence',
        changes: [
          'Evidence-first approach - must quote supporting text',
          'Explicitly allows 0 relationships as valid',
          'Clear rejection criteria for proximity/co-occurrence/dialogue',
          'Simplified from v1 - removed symmetric/inverse complexity',
          'Description field must contain text evidence',
        ],
        previous_version: 'tuned-v1',
        problem_with_v1:
          'Still extracted 9 relationships for dialogue-heavy text expecting 0',
      },
      tags: [
        'extraction-pipeline',
        'relationship-building',
        'tuned',
        'evidence-based',
      ],
    });

    console.log(
      `\n✅ Successfully created ${PROMPT_NAME} v${result.version} (tuned-v2)`
    );
    console.log('\nTo run an experiment with this prompt:');
    console.log('  npx tsx apps/server/src/cli/run-experiment.cli.ts \\');
    console.log('    --dataset extraction-golden \\');
    console.log('    --name "tuned-v2-experiment" \\');
    console.log('    --prompt-label tuned-v2');
    console.log('\nView prompts in Langfuse UI at:');
    console.log(`  ${baseUrl}/prompts`);
    console.log('\nFilter by label "tuned-v2" to see the new version.');
  } catch (error) {
    console.error('Failed to create prompt:', error);

    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        console.log(
          '\nCheck your LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY.'
        );
      }
      if (error.message.includes('ECONNREFUSED')) {
        console.log(`\nCannot connect to Langfuse at ${baseUrl}`);
        console.log('Make sure Langfuse is running.');
      }
    }

    process.exit(1);
  }
}

main();
