#!/usr/bin/env npx tsx
/**
 * Test the exact Person schema from Bible pack with a simple document
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  projectId: 'spec-server-dev',
  location: 'europe-central2',
  model: 'gemini-2.5-flash-lite',
  timeoutMs: 30_000, // 30 seconds for testing
};

// Exact Person schema from Bible pack
const PERSON_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Full name of the person' },
    role: { type: 'string', description: 'Position, title, or role' },
    tribe: { type: 'string', description: 'Israelite tribe name' },
    father: { type: 'string', description: "Father's name" },
    mother: { type: 'string', description: "Mother's name" },
    aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names' },
    occupation: { type: 'string', description: 'Profession' },
    significance: { type: 'string', description: 'Why important' },
    birth_location: { type: 'string', description: 'Place of birth' },
    death_location: { type: 'string', description: 'Place of death' },
    source_references: { type: 'array', items: { type: 'string' }, description: 'Biblical refs' },
  },
};

// Simple test document
const SIMPLE_DOC = `Meeting Notes - Project Update
Attendees: John Smith (CEO), Sarah Chen (CTO), Mike Johnson (Designer)
John presented the quarterly results. Sarah discussed tech improvements.`;

// Bible document
const BIBLE_DOC = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever:
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.`;

async function testExtraction(docName: string, docContent: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Testing: ${docName}`);
  console.log(`${'═'.repeat(60)}`);

  const credPath = path.resolve(__dirname, '..', 'spec-server-dev-vertex-ai.json');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  
  const model = new ChatVertexAI({
    model: CONFIG.model,
    authOptions: { projectId: CONFIG.projectId },
    location: CONFIG.location,
    temperature: 1.0,
    maxOutputTokens: 65535, // Same as job test
  });

  const jsonSchema = {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: PERSON_SCHEMA,
      },
    },
    required: ['entities'],
  };

  const structuredModel = model.withStructuredOutput(jsonSchema, {
    name: 'extract_person',
  });

  const prompt = `Extract all Person entities from this document. Return as JSON with "entities" array.

Document:
${docContent}`;

  console.log(`Prompt length: ${prompt.length} chars`);
  console.log(`Sending request...`);

  const start = Date.now();
  try {
    const result: any = await Promise.race([
      structuredModel.invoke(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
      ),
    ]);
    console.log(`✅ Completed in ${Date.now() - start}ms`);
    console.log(`Entities: ${result.entities?.length || 0}`);
    if (result.entities) {
      for (const e of result.entities) {
        console.log(`  - ${e.name}${e.role ? ` (${e.role})` : ''}`);
      }
    }
    return true;
  } catch (err: any) {
    console.log(`❌ Failed in ${Date.now() - start}ms: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing Person schema with different documents\n');
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Location: ${CONFIG.location}`);
  
  await testExtraction('Simple Meeting Notes', SIMPLE_DOC);
  await testExtraction('Bible - II John (excerpt)', BIBLE_DOC);
}

main().catch(console.error);
