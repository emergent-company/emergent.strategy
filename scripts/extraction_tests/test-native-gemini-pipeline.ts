#!/usr/bin/env npx tsx
/**
 * Test the Native Gemini SDK pipeline for entity extraction and relationship building
 *
 * This tests the same flow as the LangGraph nodes but without NestJS dependency.
 * It validates:
 * 1. Entity extraction using responseSchema
 * 2. Relationship building using responseSchema
 * 3. End-to-end pipeline timing
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set credentials
const credPath = path.resolve(
  __dirname,
  '..',
  '..',
  'spec-server-dev-vertex-ai.json'
);
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

// Configuration
const CONFIG = {
  projectId: 'spec-server-dev',
  location: 'europe-central2',
  model: 'gemini-2.5-flash-lite',
  temperature: 0.1,
  maxOutputTokens: 8000,
};

// Initialize the Google Gen AI SDK for Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: CONFIG.projectId,
  location: CONFIG.location,
});

// Schema for entity extraction (matches entity-extractor.node.ts)
const ENTITY_EXTRACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    entities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Name of the entity' },
          type: { type: Type.STRING, description: 'Type of entity' },
          description: { type: Type.STRING, description: 'Brief description' },
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

// Schema for relationship building (matches relationship-builder.node.ts)
const RELATIONSHIP_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    relationships: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_ref: {
            type: Type.STRING,
            description: 'Source entity temp_id',
          },
          target_ref: {
            type: Type.STRING,
            description: 'Target entity temp_id',
          },
          type: { type: Type.STRING, description: 'Relationship type' },
          description: {
            type: Type.STRING,
            description: 'Relationship description',
          },
        },
        required: ['source_ref', 'target_ref', 'type'],
        propertyOrdering: ['source_ref', 'target_ref', 'type', 'description'],
      },
      description: 'List of relationships between entities',
    },
  },
  required: ['relationships'],
  propertyOrdering: ['relationships'],
};

// Object schemas
const objectSchemas: Record<string, any> = {
  Person: { description: 'A human individual' },
  Place: { description: 'A location or geographic entity' },
  Event: { description: 'A notable occurrence or happening' },
  Book: { description: 'A written work or scripture' },
  Quote: { description: 'A significant statement or teaching' },
  Group: { description: 'A collection of people' },
  Concept: { description: 'An abstract idea or principle' },
};

// Test document
const documentContent = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever:
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
4. I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father.
5. And now I ask you, dear lady - not as though I were writing you a new commandment, but the one we have had from the beginning - that we love one another.
6. And this is love, that we walk according to his commandments; this is the commandment, just as you have heard from the beginning, so that you should walk in it.
7. For many deceivers have gone out into the world, those who do not confess the coming of Jesus Christ in the flesh. Such a one is the deceiver and the antichrist.`;

function buildEntityExtractionPrompt(
  documentText: string,
  schemas: Record<string, any>,
  allowedTypes?: string[]
): string {
  const typesToExtract = allowedTypes || Object.keys(schemas);

  let prompt = `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, provide:
1. name: Clear, descriptive name of the entity
2. type: Entity type from the allowed list
3. description: Brief description of what this entity represents

## Allowed Entity Types

Extract ONLY these types: ${typesToExtract.join(', ')}

`;

  for (const typeName of typesToExtract) {
    const schema = schemas[typeName];
    if (schema?.description) {
      prompt += `- **${typeName}**: ${schema.description}\n`;
    } else {
      prompt += `- **${typeName}**\n`;
    }
  }

  prompt += `
## Document

${documentText}

Extract all entities now.`;

  return prompt;
}

interface ExtractedEntity {
  name: string;
  type: string;
  description?: string;
  temp_id?: string;
}

interface ExtractedRelationship {
  source_ref: string;
  target_ref: string;
  type: string;
  description?: string;
}

async function extractEntities(): Promise<ExtractedEntity[]> {
  console.log('\n--- Step 1: Entity Extraction ---');
  const prompt = buildEntityExtractionPrompt(
    documentContent,
    objectSchemas,
    Object.keys(objectSchemas)
  );
  console.log(`Prompt length: ${prompt.length} chars`);

  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: ENTITY_EXTRACTION_SCHEMA,
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
      },
    });

    const elapsed = Date.now() - start;
    const text = response.text?.trim();
    if (!text) throw new Error('Empty response');

    const parsed = JSON.parse(text);
    const entities: ExtractedEntity[] = (parsed.entities || []).map(
      (e: any, i: number) => ({
        name: e.name,
        type: e.type,
        description: e.description,
        temp_id: `entity_${i}`,
      })
    );

    console.log(`Success: ${elapsed}ms, ${entities.length} entities`);

    // Print entities by type
    const byType: Record<string, ExtractedEntity[]> = {};
    for (const e of entities) {
      if (!byType[e.type]) byType[e.type] = [];
      byType[e.type].push(e);
    }
    for (const [type, list] of Object.entries(byType)) {
      console.log(`  ${type}: ${list.map((e) => e.name).join(', ')}`);
    }

    return entities;
  } catch (err: any) {
    console.log(`Failed: ${err.message} (${Date.now() - start}ms)`);
    throw err;
  }
}

async function buildRelationships(
  entities: ExtractedEntity[]
): Promise<ExtractedRelationship[]> {
  console.log('\n--- Step 2: Relationship Building ---');

  // Build entity list for the prompt
  const entityList = entities
    .map((e) => `- ${e.temp_id}: ${e.name} (${e.type})`)
    .join('\n');

  const prompt = `You are building a knowledge graph. Given these entities extracted from a document, identify all meaningful relationships between them.

## Entities

${entityList}

## Document Context

${documentContent}

## Instructions

For each relationship:
- source_ref: The temp_id of the source entity
- target_ref: The temp_id of the target entity  
- type: A verb phrase describing the relationship (e.g., "wrote_to", "teaches", "is_child_of")
- description: Brief explanation of the relationship

Find all meaningful relationships between the entities.`;

  console.log(`Prompt length: ${prompt.length} chars`);

  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: CONFIG.model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: RELATIONSHIP_SCHEMA,
        temperature: CONFIG.temperature,
        maxOutputTokens: CONFIG.maxOutputTokens,
      },
    });

    const elapsed = Date.now() - start;
    const text = response.text?.trim();
    if (!text) throw new Error('Empty response');

    const parsed = JSON.parse(text);
    const relationships: ExtractedRelationship[] = (
      parsed.relationships || []
    ).map((r: any) => ({
      source_ref: r.source_ref,
      target_ref: r.target_ref,
      type: r.type,
      description: r.description,
    }));

    console.log(`Success: ${elapsed}ms, ${relationships.length} relationships`);

    // Print relationships
    for (const r of relationships.slice(0, 10)) {
      const source =
        entities.find((e) => e.temp_id === r.source_ref)?.name || r.source_ref;
      const target =
        entities.find((e) => e.temp_id === r.target_ref)?.name || r.target_ref;
      console.log(`  ${source} --[${r.type}]--> ${target}`);
    }
    if (relationships.length > 10) {
      console.log(`  ... and ${relationships.length - 10} more`);
    }

    return relationships;
  } catch (err: any) {
    console.log(`Failed: ${err.message} (${Date.now() - start}ms)`);
    throw err;
  }
}

async function main() {
  console.log('========================================');
  console.log('Native Gemini SDK Pipeline Test');
  console.log('========================================');
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Project: ${CONFIG.projectId}`);
  console.log(`Location: ${CONFIG.location}`);
  console.log(`Document: ${documentContent.length} chars`);

  const pipelineStart = Date.now();

  try {
    // Step 1: Extract entities
    const entities = await extractEntities();
    if (entities.length === 0) {
      throw new Error('No entities extracted');
    }

    // Step 2: Build relationships
    const relationships = await buildRelationships(entities);

    const totalTime = Date.now() - pipelineStart;

    console.log('\n========================================');
    console.log('Pipeline Complete');
    console.log('========================================');
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Entities: ${entities.length}`);
    console.log(`Relationships: ${relationships.length}`);
    console.log('\nResult: SUCCESS');
    console.log('');
    console.log('The Native Gemini SDK pipeline is working correctly!');
    console.log(
      'This confirms the LangGraph nodes will work with NativeGeminiService.'
    );

    process.exit(0);
  } catch (err: any) {
    const totalTime = Date.now() - pipelineStart;
    console.log('\n========================================');
    console.log('Pipeline Failed');
    console.log('========================================');
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Error: ${err.message}`);
    if (err.stack) console.log(err.stack);
    process.exit(1);
  }
}

main();
