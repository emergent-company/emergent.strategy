#!/usr/bin/env npx tsx
/**
 * Test using responseMimeType for JSON output
 */
import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '..', 'spec-server-dev-vertex-ai.json');

async function main() {
  // Try with different model configurations
  const configs = [
    { name: 'responseMimeType', config: { responseMimeType: 'application/json' } },
    { name: 'responseFormat json_object', config: { responseFormat: 'json_object' } },
  ];

  for (const { name, config } of configs) {
    console.log(`\n=== Testing with ${name} ===`);
    
    try {
      const model = new ChatVertexAI({
        model: 'gemini-2.5-flash-lite',
        authOptions: { projectId: 'spec-server-dev' },
        location: 'europe-central2',
        temperature: 1.0,
        maxOutputTokens: 65535,
        ...config,
      } as any);

      const prompt = `Extract person names from: John and Mary went to the store.

Return as JSON: { "entities": [{ "name": "..." }] }`;

      const start = Date.now();
      const result = await Promise.race([
        model.invoke(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 15000)),
      ]);
      console.log(`✅ Success in ${Date.now() - start}ms:`, (result as any).content);
    } catch (err: any) {
      console.log(`❌ Failed:`, err.message);
    }
  }
}

main();
