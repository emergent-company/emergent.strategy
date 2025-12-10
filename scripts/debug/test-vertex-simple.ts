#!/usr/bin/env npx tsx
/**
 * Simple Vertex AI connectivity test
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
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
console.log(`Credentials: ${credPath}`);

const projectId = process.env.GCP_PROJECT_ID || 'spec-server-dev';
const location = process.env.VERTEX_AI_LOCATION || 'europe-central2';

// Test different models
const models = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-2.5-flash-lite',
];

async function testModel(modelName: string) {
  console.log(`\n🧪 Testing ${modelName}...`);

  const model = new ChatVertexAI({
    model: modelName,
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 100,
  });

  const start = Date.now();

  try {
    const result = await Promise.race([
      model.invoke('Say hello in one word'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
      ),
    ]);

    const elapsed = Date.now() - start;
    console.log(`✅ ${modelName}: "${result.content}" (${elapsed}ms)`);
    return true;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ ${modelName}: ${e.message} (${elapsed}ms)`);
    return false;
  }
}

async function main() {
  console.log('🔧 Vertex AI Connectivity Test');
  console.log(`   Project: ${projectId}`);
  console.log(`   Location: ${location}`);

  for (const model of models) {
    await testModel(model);
  }
}

main().catch(console.error);
