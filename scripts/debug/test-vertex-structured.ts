#!/usr/bin/env npx tsx
/**
 * Test Vertex AI structured output with different methods
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

// Simple entity schema
const EntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

const OutputSchema = z.object({
  entities: z.array(EntitySchema),
});

const prompt = `Extract all people from this text as entities:

"John the Elder wrote a letter to the elect lady. Jesus Christ is mentioned as the Father's Son. The antichrist is warned about."

Return the entities in JSON format with name, type, and description.`;

async function testMethod(
  method: 'json_mode' | 'function_calling' | undefined
) {
  const methodName = method || 'default (function_calling)';
  console.log(`\n🧪 Testing withStructuredOutput method: ${methodName}`);

  const model = new ChatVertexAI({
    model: modelName,
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 1000,
  });

  const options: any = { name: 'extract_entities' };
  if (method) {
    options.method = method;
  }

  const structuredModel = (model as any).withStructuredOutput(
    OutputSchema,
    options
  );

  const start = Date.now();

  try {
    const result = await Promise.race([
      structuredModel.invoke(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 60s')), 60000)
      ),
    ]);

    const elapsed = Date.now() - start;
    console.log(`✅ ${methodName}: ${elapsed}ms`);
    console.log(
      `   Entities: ${JSON.stringify(result?.entities || [], null, 2)}`
    );
    return true;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ ${methodName}: ${e.message} (${elapsed}ms)`);
    return false;
  }
}

async function main() {
  console.log('🔧 Vertex AI Structured Output Test');
  console.log(`   Model: ${modelName}`);
  console.log(`   Project: ${projectId}`);
  console.log(`   Location: ${location}`);

  // Test default (function_calling)
  await testMethod(undefined);

  // Test explicit function_calling
  await testMethod('function_calling');

  // Test json_mode
  await testMethod('json_mode');
}

main().catch(console.error);
