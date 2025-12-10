#!/usr/bin/env npx tsx
/**
 * Test Vertex AI with complex schema like the real extraction
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import { z } from 'zod';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set credentials before anything else
const credPath = path.resolve(
  __dirname,
  '..',
  '..',
  'spec-server-dev-vertex-ai.json'
);
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

const projectId = 'spec-server-dev';
const location = 'europe-central2';
const modelName = 'gemini-2.5-flash-lite';

// Full Person schema from Bible template (same as test-extraction-job.ts)
const PersonSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Full name of the person' },
    role: {
      type: 'string',
      description: 'Position, title, or role (e.g., prophet, king, apostle)',
    },
    tribe: {
      type: 'string',
      description: 'Israelite tribe name - will be linked to Group entity',
    },
    father: {
      type: 'string',
      description: "Father's name - will be linked to Person entity",
    },
    mother: {
      type: 'string',
      description: "Mother's name - will be linked to Person entity",
    },
    aliases: {
      type: 'array',
      items: { type: 'string' },
      description: 'Alternative names',
    },
    occupation: { type: 'string', description: 'Profession or occupation' },
    significance: {
      type: 'string',
      description: 'Why this person is important biblically',
    },
    birth_location: {
      type: 'string',
      description: 'Place of birth name - will be linked to Place',
    },
    death_location: {
      type: 'string',
      description: 'Place of death name - will be linked to Place',
    },
    source_references: {
      type: 'array',
      items: { type: 'string' },
      description: 'Biblical references',
    },
  },
};

// JSON Schema for extraction (as used by withStructuredOutput)
const extractionJsonSchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: PersonSchema,
    },
  },
  required: ['entities'],
};

// Zod schema (simplified - what we're now using in entity-extractor)
const SimplifiedEntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

const SimplifiedOutputSchema = z.object({
  entities: z.array(SimplifiedEntitySchema),
});

const documentContent = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever :
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
4. I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father.
5. And now I ask you, dear lady — not as though I were writing you a new commandment, but the one we have had from the beginning — that we love one another.`;

async function testComplexJsonSchema() {
  console.log('\n🧪 Test 1: Complex JSON Schema (like test-extraction-job.ts)');

  const model = new ChatVertexAI({
    model: modelName,
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 65535,
  });

  const structuredModel = (model as any).withStructuredOutput(
    extractionJsonSchema,
    {
      name: 'extract_person',
    }
  );

  const prompt = `Extract all Person entities from this biblical text.

${documentContent}

Return a JSON object with an "entities" array containing the extracted Person entities.`;

  console.log(`   Prompt length: ${prompt.length} chars`);

  const start = Date.now();

  try {
    const result = await Promise.race([
      structuredModel.invoke(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 60s')), 60000)
      ),
    ]);

    const elapsed = Date.now() - start;
    console.log(`✅ Success: ${elapsed}ms`);
    console.log(`   Entities: ${result?.entities?.length || 0}`);
    if (result?.entities?.length > 0) {
      console.log(`   First: ${JSON.stringify(result.entities[0])}`);
    }
    return true;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ Failed: ${e.message} (${elapsed}ms)`);
    return false;
  }
}

async function testSimplifiedZodSchema() {
  console.log(
    '\n🧪 Test 2: Simplified Zod Schema (what we use now in entity-extractor)'
  );

  const model = new ChatVertexAI({
    model: modelName,
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 65535,
  });

  const structuredModel = (model as any).withStructuredOutput(
    SimplifiedOutputSchema,
    {
      name: 'extract_entities',
      method: 'function_calling',
    }
  );

  const prompt = `Extract all entities (people, places, concepts) from this biblical text.

${documentContent}

For each entity provide:
- name: The entity name
- type: The entity type (Person, Place, Book, etc.)
- description: Brief description

Return a JSON object with an "entities" array.`;

  console.log(`   Prompt length: ${prompt.length} chars`);

  const start = Date.now();

  try {
    const result = await Promise.race([
      structuredModel.invoke(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 60s')), 60000)
      ),
    ]);

    const elapsed = Date.now() - start;
    console.log(`✅ Success: ${elapsed}ms`);
    console.log(`   Entities: ${result?.entities?.length || 0}`);
    if (result?.entities?.length > 0) {
      result.entities.forEach((e: any) =>
        console.log(`   - ${e.name} (${e.type})`)
      );
    }
    return true;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ Failed: ${e.message} (${elapsed}ms)`);
    return false;
  }
}

async function testRawInvoke() {
  console.log('\n🧪 Test 3: Raw invoke (no structured output)');

  const model = new ChatVertexAI({
    model: modelName,
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 2000,
  });

  const prompt = `Extract all people from this text and return as JSON:

${documentContent}

Return JSON: {"entities": [{"name": "...", "type": "Person", "description": "..."}]}`;

  console.log(`   Prompt length: ${prompt.length} chars`);

  const start = Date.now();

  try {
    const result = await Promise.race([
      model.invoke(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 60s')), 60000)
      ),
    ]);

    const elapsed = Date.now() - start;
    console.log(`✅ Success: ${elapsed}ms`);
    const content =
      typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content);
    console.log(`   Response: ${content.slice(0, 500)}...`);
    return true;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ Failed: ${e.message} (${elapsed}ms)`);
    return false;
  }
}

async function main() {
  console.log('🔧 Vertex AI Complex Schema Test');
  console.log(`   Model: ${modelName}`);
  console.log(`   Project: ${projectId}`);
  console.log(`   Location: ${location}`);

  await testRawInvoke();
  await testSimplifiedZodSchema();
  await testComplexJsonSchema();
}

main().catch(console.error);
