#!/usr/bin/env npx tsx
/**
 * Test different structured output methods with ChatVertexAI
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '..', 'spec-server-dev-vertex-ai.json');

const PersonSchema = z.object({
  name: z.string().describe('Full name of the person'),
  role: z.string().optional().describe('Role or title'),
});

const EntitiesSchema = z.object({
  entities: z.array(PersonSchema),
});

const prompt = 'Extract person names from: John Smith (CEO) and Sarah Chen (CTO) met today.';

async function testMethod(name: string, fn: () => Promise<any>) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('═'.repeat(60));
  
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 20s')), 20000)),
    ]);
    console.log(`✅ Success in ${Date.now() - start}ms`);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.log(`❌ Failed in ${Date.now() - start}ms: ${err.message}`);
  }
}

async function main() {
  console.log('Testing different structured output methods with ChatVertexAI\n');

  // Method 1: withStructuredOutput with Zod schema
  await testMethod('withStructuredOutput (Zod)', async () => {
    const model = new ChatVertexAI({
      model: 'gemini-2.5-flash-lite',
      authOptions: { projectId: 'spec-server-dev' },
      location: 'europe-central2',
      temperature: 1.0,
      maxOutputTokens: 65535,
    });
    const structured = model.withStructuredOutput(EntitiesSchema);
    return structured.invoke(prompt);
  });

  // Method 2: withStructuredOutput with JSON Schema
  await testMethod('withStructuredOutput (JSON Schema)', async () => {
    const model = new ChatVertexAI({
      model: 'gemini-2.5-flash-lite',
      authOptions: { projectId: 'spec-server-dev' },
      location: 'europe-central2',
      temperature: 1.0,
      maxOutputTokens: 65535,
    });
    const jsonSchema = {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              role: { type: 'string' },
            },
            required: ['name'],
          },
        },
      },
      required: ['entities'],
    };
    const structured = model.withStructuredOutput(jsonSchema);
    return structured.invoke(prompt);
  });

  // Method 3: responseMimeType + manual parse
  await testMethod('responseMimeType (JSON mode)', async () => {
    const model = new ChatVertexAI({
      model: 'gemini-2.5-flash-lite',
      authOptions: { projectId: 'spec-server-dev' },
      location: 'europe-central2',
      temperature: 1.0,
      maxOutputTokens: 65535,
      responseMimeType: 'application/json',
    } as any);
    const result = await model.invoke(prompt + '\nReturn as JSON: {"entities": [{"name": "...", "role": "..."}]}');
    return JSON.parse((result as any).content);
  });

  // Method 4: bindTools approach (tool calling strategy)
  await testMethod('bindTools (tool calling)', async () => {
    const model = new ChatVertexAI({
      model: 'gemini-2.5-flash-lite',
      authOptions: { projectId: 'spec-server-dev' },
      location: 'europe-central2',
      temperature: 1.0,
      maxOutputTokens: 65535,
    });
    
    const extractTool = {
      name: 'extract_entities',
      description: 'Extract person entities from text',
      parameters: {
        type: 'object',
        properties: {
          entities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Full name' },
                role: { type: 'string', description: 'Role or title' },
              },
              required: ['name'],
            },
          },
        },
        required: ['entities'],
      },
    };
    
    const bound = model.bindTools([extractTool], { tool_choice: 'extract_entities' });
    const result = await bound.invoke(prompt);
    return (result as any).tool_calls?.[0]?.args;
  });
}

main();
