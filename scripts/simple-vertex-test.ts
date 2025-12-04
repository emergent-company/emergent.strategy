#!/usr/bin/env npx tsx
import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '..', 'spec-server-dev-vertex-ai.json');

async function main() {
  const model = new ChatVertexAI({
    model: 'gemini-2.5-flash-lite',
    authOptions: { projectId: 'spec-server-dev' },
    location: 'europe-central2',
    temperature: 1.0,
    maxOutputTokens: 65535,
  });

  console.log('Testing simple call (no structured output)...');
  const start = Date.now();

  try {
    const result = await Promise.race([
      model.invoke('Say hello in 3 words'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 30s')), 30000)),
    ]);
    console.log(`✅ Success in ${Date.now() - start}ms:`, (result as any).content);
  } catch (err: any) {
    console.log(`❌ Failed in ${Date.now() - start}ms:`, err.message);
  }
}

main();
