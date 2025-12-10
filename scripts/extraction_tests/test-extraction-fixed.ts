#!/usr/bin/env npx tsx
/**
 * Test Extraction with JSON prompting (no withStructuredOutput)
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set credentials
const credPath = path.resolve(__dirname, '..', '..', 'spec-server-dev-vertex-ai.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

// Configuration
const CONFIG = {
  projectId: 'spec-server-dev',
  location: 'europe-central2',
  model: 'gemini-2.5-flash-lite',
  timeoutMs: 30_000,
};

// Document from II John
const DOCUMENT_CONTENT = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever :
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
4. I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father.
5. And now I ask you, dear lady — not as though I were writing you a new commandment, but the one we have had from the beginning — that we love one another.
6. And this is love, that we walk according to his commandments; this is the commandment, just as you have heard from the beginning, so that you should walk in it.
7. For many deceivers have gone out into the world, those who do not confess the coming of Jesus Christ in the flesh. Such a one is the deceiver and the antichrist.
`;

// Person schema
const PERSON_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Full name of the person' },
    role: { type: 'string', description: 'Position, title, or role' },
    significance: { type: 'string', description: 'Why important' },
    source_references: { type: 'array', items: { type: 'string' }, description: 'Biblical refs' },
  },
};

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Extraction Test (JSON Prompting - NO withStructuredOutput)  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nModel: ${CONFIG.model}`);
  console.log(`Location: ${CONFIG.location}`);

  const model = new ChatVertexAI({
    model: CONFIG.model,
    authOptions: { projectId: CONFIG.projectId },
    location: CONFIG.location,
    temperature: 1.0,
    maxOutputTokens: 65535,
    responseMimeType: 'application/json',
  } as any);

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

  const prompt = `You are an expert entity extraction system. Extract all Person entities from this document.

**Entity Type to Extract:** Person

**Schema Definition:**
Properties:
  - name (required) [string]: Full name of the person
  - role [string]: Position, title, or role
  - significance [string]: Why this person is important
  - source_references [array]: Biblical references where mentioned

**Document Content:**

${DOCUMENT_CONTENT}

**JSON Schema for Response:**
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

Return ONLY a valid JSON object matching this schema. No explanation or markdown.`;

  console.log(`\nPrompt length: ${prompt.length} chars`);
  console.log('Sending request...');

  const start = Date.now();
  try {
    const result = await Promise.race([
      model.invoke(prompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
      ),
    ]);

    const content = (result as any).content;
    console.log(`\n✅ Success in ${Date.now() - start}ms`);
    
    // Parse JSON
    const parsed = JSON.parse(content);
    console.log(`\nExtracted ${parsed.entities?.length || 0} Person entities:`);
    for (const entity of parsed.entities || []) {
      console.log(`  - ${entity.name}${entity.role ? ` (${entity.role})` : ''}`);
    }
  } catch (err: any) {
    console.log(`\n❌ Failed in ${Date.now() - start}ms: ${err.message}`);
  }
}

main();
