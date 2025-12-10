#!/usr/bin/env tsx
/**
 * Seed Langfuse Prompts
 *
 * This script creates the extraction pipeline prompts in Langfuse.
 * Run this script to populate Langfuse with the initial prompt templates.
 *
 * Usage:
 *   npx tsx scripts/seed-langfuse-prompts.ts
 *
 * Prerequisites:
 *   - LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY environment variables
 *   - LANGFUSE_BASE_URL (defaults to http://localhost:3011 for local dev)
 */

import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Prompt names matching the EXTRACTION_PROMPT_NAMES constant
 */
const PROMPT_NAMES = {
  ENTITY_EXTRACTOR: 'entity-extractor',
  ENTITY_EXTRACTOR_RETRY: 'entity-extractor-retry',
  RELATIONSHIP_BUILDER: 'relationship-builder',
  IDENTITY_RESOLVER: 'identity-resolver',
  QUALITY_AUDITOR: 'quality-auditor',
} as const;

/**
 * Entity Extractor Prompt Template
 *
 * Variables:
 *   - {{documentText}}: The full document text
 *   - {{schemaDefinitions}}: Formatted schema definitions for entity types
 *   - {{allowedTypes}}: Comma-separated list of allowed entity types
 */
const ENTITY_EXTRACTOR_PROMPT = `You are an expert knowledge graph builder. Your task is to extract entities from the document based on the provided schema definitions.

For EACH entity you find:
1. Assign a unique temp_id (format: type_name, e.g., "person_john_smith", "location_jerusalem")
2. Determine the entity type from the allowed types
3. Provide a clear, descriptive name
4. Write a detailed description
5. Extract all relevant properties according to the schema
6. Assign a confidence score (0.0-1.0)

CRITICAL RULES:
- Extract EVERY entity that matches the provided types
- Use consistent temp_ids that are descriptive and unique
- If an entity could have multiple types, choose the most specific one
- Descriptions should be self-contained and informative

PROPERTY RULES:
- Properties marked with * are REQUIRED - you MUST include them or DO NOT extract the entity
- If a required property cannot be determined from the document, SKIP that entity entirely
- For enum properties, you MUST use one of the allowed values listed
- Only extract entities where you can provide all required properties with valid values

## Entity Types to Extract

You MUST ONLY extract entities of the following types: {{allowedTypes}}
DO NOT create entities of any other type. If something doesn't fit these types, do not extract it.

{{schemaDefinitions}}

## Document Content

{{documentText}}

## Your Task

Extract ALL entities from this document that match the types listed above.

For each entity, provide:
- temp_id: Unique identifier (format: type_shortname, e.g., "person_john")
- name: Clear, descriptive name
- type: One of the types listed above
- description: What this entity represents in context
- properties: Type-specific properties (as JSON object) - include ALL required properties
- confidence: How confident you are (0.0-1.0)

IMPORTANT REMINDERS:
- Properties marked with * are REQUIRED - include them or skip the entity
- For enum properties, use ONLY the allowed values listed in brackets
- Do NOT extract an entity if you cannot determine its required properties from the document

Return entities as a JSON array.`;

/**
 * Relationship Builder Prompt Template
 *
 * Variables:
 *   - {{documentText}}: Truncated document text for context (first 4000 chars)
 *   - {{entities}}: JSON array of extracted entities with temp_ids
 *   - {{relationshipTypes}}: Formatted relationship type definitions
 */
const RELATIONSHIP_BUILDER_PROMPT = `You are an expert at finding connections in knowledge graphs. Your job is to identify ALL meaningful relationships between entities.

For EACH relationship you find:
1. Identify the source entity (by temp_id)
2. Identify the target entity (by temp_id)
3. Determine the relationship type from the available types
4. Provide a description of this specific relationship instance
5. Assign a confidence score (0.0-1.0)

CRITICAL RULES:
- EVERY entity should have at least one relationship (no orphans!)
- Use the EXACT temp_ids from the entity list
- Relationships are DIRECTED (source -> target matters)
- Create MULTIPLE relationships for the same entity pair if there are different relationship types
- If an entity is mentioned in another entity's description, CREATE A RELATIONSHIP
- Look for implicit relationships (spatial, temporal, causal, hierarchical)

RELATIONSHIP DISCOVERY STRATEGIES:
1. **Explicit mentions**: "A is the father of B" -> A PARENT_OF B
2. **Description references**: Entity A's description mentions B -> A RELATED_TO B
3. **Actions**: "A killed B" -> A ACTED_UPON B
4. **Locations**: "A is in B" -> A LOCATED_IN B
5. **Temporal**: "A happened before B" -> A PRECEDES B
6. **Hierarchical**: "A is part of B" -> A PART_OF B

## Available Relationship Types

{{relationshipTypes}}

## Entities to Connect

{{entities}}

## Document Context

{{documentText}}

## Your Task

Find ALL relationships between these entities. Every entity should be connected to at least one other entity.

For each relationship, provide:
- source_ref: temp_id of the source entity
- target_ref: temp_id of the target entity
- type: Relationship type from the list above
- description: What this specific relationship represents
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
  console.log('Seeding Langfuse prompts for extraction pipeline...\n');

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
    // Create Entity Extractor prompt
    console.log(`Creating prompt: ${PROMPT_NAMES.ENTITY_EXTRACTOR}`);
    const entityResult = await createPrompt(baseUrl, auth, {
      name: PROMPT_NAMES.ENTITY_EXTRACTOR,
      type: 'text',
      prompt: ENTITY_EXTRACTOR_PROMPT,
      labels: ['production'],
      config: {
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        pipeline_node: 'entity_extractor',
        description:
          'Extracts entities from documents based on schema definitions',
      },
      tags: ['extraction-pipeline', 'entity-extraction'],
    });
    console.log(
      `  Created ${PROMPT_NAMES.ENTITY_EXTRACTOR} v${entityResult.version}`
    );

    // Create Relationship Builder prompt
    console.log(`Creating prompt: ${PROMPT_NAMES.RELATIONSHIP_BUILDER}`);
    const relationshipResult = await createPrompt(baseUrl, auth, {
      name: PROMPT_NAMES.RELATIONSHIP_BUILDER,
      type: 'text',
      prompt: RELATIONSHIP_BUILDER_PROMPT,
      labels: ['production'],
      config: {
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        pipeline_node: 'relationship_builder',
        description:
          'Builds relationships between extracted entities based on document context',
      },
      tags: ['extraction-pipeline', 'relationship-building'],
    });
    console.log(
      `  Created ${PROMPT_NAMES.RELATIONSHIP_BUILDER} v${relationshipResult.version}`
    );

    console.log('\nSuccessfully seeded Langfuse prompts!');
    console.log('\nPrompts created:');
    console.log(
      `  - ${PROMPT_NAMES.ENTITY_EXTRACTOR} v${entityResult.version} (production)`
    );
    console.log(
      `  - ${PROMPT_NAMES.RELATIONSHIP_BUILDER} v${relationshipResult.version} (production)`
    );
    console.log('\nYou can view and edit these prompts in the Langfuse UI at:');
    console.log(`  ${baseUrl}/prompts`);
  } catch (error) {
    console.error('Failed to create prompts:', error);

    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        console.log(
          '\nNote: If prompts already exist, this script will create new versions.'
        );
      }
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
