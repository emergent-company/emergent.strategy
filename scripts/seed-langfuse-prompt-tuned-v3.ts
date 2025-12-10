#!/usr/bin/env tsx
/**
 * Seed Tuned-v3 Relationship Builder Prompt to Langfuse
 *
 * This script creates tuned-v3 - a BALANCED approach combining insights from v1 and v2.
 *
 * Problem Analysis:
 * - Baseline: High recall (0.72) but low precision (0.17) - too many false positives
 * - Tuned-v1: Reduced extraction but hurt recall more than helped precision
 * - Tuned-v2: Improved precision (0.20) but killed recall (0.40) - too strict
 *
 * Tuned-v3 Strategy - "Confident Extraction":
 * 1. Extract relationships that are STATED or STRONGLY IMPLIED
 * 2. Accept semantic equivalents (e.g., "father of" = PARENT_OF)
 * 3. Reduce duplicate symmetric/inverse relationships
 * 4. Require confidence scoring to filter low-confidence extractions
 * 5. NOT too strict - dialogue mentioning relationships IS valid evidence
 *
 * Usage:
 *   npx tsx scripts/seed-langfuse-prompt-tuned-v3.ts
 */

import { config } from 'dotenv';

// Load environment variables
config();

const PROMPT_NAME = 'relationship-builder';

/**
 * Tuned-v3 Relationship Builder Prompt - Balanced Approach
 *
 * Key changes:
 * - "Stated OR strongly implied" (not just explicit)
 * - Confidence threshold guidance (only extract if confidence >= 0.7)
 * - Accept semantic equivalents
 * - Reduce duplicates but don't over-constrain
 */
const RELATIONSHIP_BUILDER_PROMPT_V3 = `You are an expert at finding connections in knowledge graphs. Your task is to identify relationships between entities based on the document text.

## Extraction Guidelines

Extract relationships that are:
1. **Directly stated**: "A is the father of B" → A PARENT_OF B
2. **Strongly implied**: "A's son B" → A PARENT_OF B (possessive implies relationship)
3. **Semantically equivalent**: "A fathered B" = "A is father of B" → A PARENT_OF B

## Confidence Threshold

Only extract relationships where you are at least 70% confident. Ask yourself:
- Is this relationship clearly supported by the text?
- Would a careful reader agree this relationship exists?
- If uncertain, skip it.

## What to Extract

✅ DO extract:
- Family relationships stated in any form (father, mother, son, daughter, wife, husband)
- Location relationships (lived in, traveled to, born in, from)
- Group memberships explicitly mentioned
- Relationships stated in dialogue if they describe actual relationships
  - Example: "your daughter-in-law" → implies MARRIED_TO relationship exists

## What NOT to Extract

❌ DO NOT extract:
- Duplicate relationships (pick ONE direction for symmetric relationships like MARRIED_TO)
- Both PARENT_OF and CHILD_OF for the same pair (pick the one stated in text)
- Transitive relationships not explicitly stated (if A→B and B→C, don't add A→C unless stated)
- Speculative relationships based only on proximity in text

## Handling Symmetric Relationships

For MARRIED_TO, SIBLING_OF, etc.:
- Extract only ONE direction per relationship
- If "A married B", extract: A MARRIED_TO B (not also B MARRIED_TO A)

## Handling Parent/Child Relationships

- Use the form that matches the text
- "A is the father of B" → A PARENT_OF B
- "B is the son of A" → B CHILD_OF A
- Do NOT add both for the same relationship

## Available Relationship Types

{{relationshipTypes}}

## Entities to Connect

{{entities}}

## Document Context

{{documentText}}

## Your Task

Extract relationships with confidence >= 0.7. For each relationship provide:
- source_ref: temp_id of the source entity
- target_ref: temp_id of the target entity
- type: Relationship type from the list above
- description: Brief explanation of how this relationship is supported by the text
- confidence: Your confidence score (0.7 - 1.0)

Return relationships as a JSON array. It's okay to return an empty array if no relationships meet the confidence threshold.`;

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
  console.log('Seeding TUNED-V3 relationship builder prompt to Langfuse...\n');

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
    // Create Tuned-v3 Relationship Builder prompt with 'tuned-v3' label
    console.log(`Creating prompt: ${PROMPT_NAME} (tuned-v3)`);
    console.log('');
    console.log('Key changes in tuned-v3 prompt (BALANCED approach):');
    console.log('  - "Stated OR strongly implied" (not just explicit)');
    console.log('  - Confidence threshold >= 0.7');
    console.log('  - Accept semantic equivalents (fathered = PARENT_OF)');
    console.log('  - Dialogue-stated relationships ARE valid');
    console.log('  - Reduce duplicates but not over-constrained');
    console.log('');

    const result = await createPrompt(baseUrl, auth, {
      name: PROMPT_NAME,
      type: 'text',
      prompt: RELATIONSHIP_BUILDER_PROMPT_V3,
      labels: ['tuned-v3'],
      config: {
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        pipeline_node: 'relationship_builder',
        description:
          'TUNED-V3: Balanced approach - stated OR strongly implied with confidence threshold.',
        tuning_goal: 'Balance precision and recall - improve both vs baseline',
        changes: [
          'Accept stated OR strongly implied relationships',
          'Confidence threshold >= 0.7',
          'Semantic equivalents accepted',
          'Dialogue-stated relationships valid',
          'Reduce duplicates without over-constraining',
        ],
        previous_versions: ['tuned-v1', 'tuned-v2'],
        learnings: {
          'tuned-v1': 'Hurt recall more than helped precision',
          'tuned-v2': 'Too strict - killed recall (0.40 vs 0.72 baseline)',
        },
      },
      tags: [
        'extraction-pipeline',
        'relationship-building',
        'tuned',
        'balanced',
      ],
    });

    console.log(
      `\n✅ Successfully created ${PROMPT_NAME} v${result.version} (tuned-v3)`
    );
    console.log('\nTo run an experiment with this prompt:');
    console.log('  npx ts-node --project apps/server/tsconfig.json \\');
    console.log('    apps/server/src/cli/run-experiment.cli.ts \\');
    console.log('    --dataset extraction-golden \\');
    console.log('    --name "tuned-v3-experiment" \\');
    console.log('    --prompt-label tuned-v3');
    console.log('\nView prompts in Langfuse UI at:');
    console.log(`  ${baseUrl}/prompts`);
    console.log('\nFilter by label "tuned-v3" to see the new version.');
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
