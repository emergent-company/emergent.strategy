#!/usr/bin/env npx tsx
/**
 * Test using JSON mode instead of structured output
 */
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

  const prompt = `Extract person names from: John and Mary went to the store.

Return as JSON in this format:
{
  "entities": [
    { "name": "person name here" }
  ]
}

Return ONLY valid JSON, no explanation.`;

  console.log('Testing JSON extraction WITHOUT structured output...');
  const start = Date.now();

  try {
    const result = await Promise.race([
      model.invoke(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 30s')), 30000)),
    ]);
    const content = (result as any).content;
    console.log(`✅ Success in ${Date.now() - start}ms`);
    console.log('Raw response:', content);
    
    // Try to parse as JSON
    try {
      const json = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());
      console.log('Parsed JSON:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Could not parse as JSON');
    }
  } catch (err: any) {
    console.log(`❌ Failed in ${Date.now() - start}ms:`, err.message);
  }
}

main();
