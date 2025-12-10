#!/usr/bin/env tsx
/**
 * Seed Tuned Relationship Builder Prompt to Langfuse
 *
 * This script creates a tuned version of the relationship builder prompt
 * designed to reduce over-extraction (extracting too many relationships).
 *
 * Key changes from the original:
 * 1. Extract ONLY relationships explicitly stated in the text
 * 2. Don't duplicate symmetric relationships (A married_to B, not also B married_to A)
 * 3. Don't duplicate inverse relationships (use parent_of OR child_of, not both)
 * 4. Don't infer transitive relationships (A parent of B, B parent of C ≠ A grandparent of C)
 * 5. Prioritize precision over recall
 *
 * Usage:
 *   npx tsx scripts/seed-langfuse-prompt-tuned.ts
 *
 * The prompt will be created with label 'tuned-v1' for easy filtering
 * and comparison with the 'production' version in experiments.
 */

import { config } from 'dotenv';

// Load environment variables
config();

const PROMPT_NAME = 'relationship-builder';

/**
 * Tuned Relationship Builder Prompt
 *
 * Changes from original:
 * - Removed "EVERY entity should have at least one relationship" (caused over-extraction)
 * - Added explicit rules against duplicating symmetric/inverse relationships
 * - Added rules against inferring transitive relationships
 * - Emphasized extracting ONLY what's explicitly stated
 * - Changed goal from "ZERO ORPHANS" to "PRECISION over recall"
 */
const RELATIONSHIP_BUILDER_PROMPT_TUNED = `You are an expert at finding connections in knowledge graphs. Your job is to identify relationships between entities that are EXPLICITLY stated in the document.

For EACH relationship you find:
1. Identify the source entity (by temp_id)
2. Identify the target entity (by temp_id)
3. Determine the relationship type from the available types
4. Provide a description of this specific relationship instance
5. Assign a confidence score (0.0-1.0)

## CRITICAL RULES - READ CAREFULLY

### Rule 1: Extract ONLY Explicit Relationships
- ONLY extract relationships that are DIRECTLY STATED in the text
- Do NOT infer relationships from context or descriptions
- If the text says "A is the father of B", extract that ONE relationship
- Do NOT add relationships just because entities are mentioned together

### Rule 2: No Duplicate Symmetric Relationships
For SYMMETRIC relationships (like MARRIED_TO, SIBLING_OF):
- Extract ONLY ONE direction
- If "A married B", extract: A --MARRIED_TO--> B
- Do NOT also add: B --MARRIED_TO--> A (this is redundant)

### Rule 3: No Duplicate Inverse Relationships  
For relationships with INVERSES (like PARENT_OF/CHILD_OF):
- Extract ONLY ONE form per relationship
- If "A is the father of B", extract: A --PARENT_OF--> B
- Do NOT also add: B --CHILD_OF--> A (this is redundant)
- Choose the form that matches how it's stated in the text

### Rule 4: No Transitive Relationships
- Do NOT infer relationships across generations or chains
- If A is parent of B, and B is parent of C:
  - Extract: A --PARENT_OF--> B
  - Extract: B --PARENT_OF--> C
  - Do NOT add: C --CHILD_OF--> A (transitive inference)
- Each relationship must be independently stated in the text

### Rule 5: Directional Relationships
- Relationships are DIRECTED (source → target matters)
- Use the direction as stated in the text
- "A traveled to B" = A --TRAVELS_TO--> B (not B --TRAVELS_TO--> A)

## Available Relationship Types

{{relationshipTypes}}

## Entities to Connect

{{entities}}

## Document Context

{{documentText}}

## Your Task

Extract relationships between entities that are EXPLICITLY stated in the document.

IMPORTANT - Quality over Quantity:
- It's better to extract fewer, accurate relationships than many questionable ones
- Only extract what you can directly support with text evidence
- When in doubt, leave it out

For each relationship, provide:
- source_ref: temp_id of the source entity
- target_ref: temp_id of the target entity
- type: Relationship type from the list above
- description: Quote or paraphrase the text that supports this relationship
- confidence: How confident you are (0.0-1.0)

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
  console.log('Seeding TUNED relationship builder prompt to Langfuse...\n');

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
    // Create Tuned Relationship Builder prompt with 'tuned-v1' label
    console.log(`Creating prompt: ${PROMPT_NAME} (tuned-v1)`);
    console.log('');
    console.log('Key changes in tuned prompt:');
    console.log('  - Extract ONLY explicit relationships (no inference)');
    console.log('  - No duplicate symmetric relationships (married_to once)');
    console.log(
      '  - No duplicate inverse relationships (parent_of OR child_of)'
    );
    console.log('  - No transitive relationships (no grandparent inference)');
    console.log('  - Quality over quantity emphasis');
    console.log('');

    const result = await createPrompt(baseUrl, auth, {
      name: PROMPT_NAME,
      type: 'text',
      prompt: RELATIONSHIP_BUILDER_PROMPT_TUNED,
      labels: ['tuned-v1'],
      config: {
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        pipeline_node: 'relationship_builder',
        description:
          'TUNED: Reduces over-extraction by emphasizing explicit relationships only. No symmetric/inverse duplicates.',
        tuning_goal:
          'Improve relationship precision without sacrificing recall',
        changes: [
          'Removed ZERO ORPHANS requirement',
          'Added rules against symmetric duplicates',
          'Added rules against inverse duplicates',
          'Added rules against transitive inference',
          'Emphasized text evidence for each relationship',
        ],
      },
      tags: [
        'extraction-pipeline',
        'relationship-building',
        'tuned',
        'precision-focused',
      ],
    });

    console.log(
      `\n✅ Successfully created ${PROMPT_NAME} v${result.version} (tuned-v1)`
    );
    console.log('\nTo run an experiment with this prompt:');
    console.log('  npx tsx scripts/run-extraction-experiment.ts \\');
    console.log('    --dataset extraction-golden \\');
    console.log('    --name "tuned-v1-experiment" \\');
    console.log('    --prompt-label tuned-v1');
    console.log('\nView prompts in Langfuse UI at:');
    console.log(`  ${baseUrl}/prompts`);
    console.log('\nFilter by label "tuned-v1" to see the new version.');
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
