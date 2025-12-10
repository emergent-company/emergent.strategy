#!/usr/bin/env npx tsx
/**
 * Test the simplified entity extraction prompt
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

// Simplified schema (matches LLMEntitySchema)
const LLMEntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

const EntityExtractorOutputSchema = z.object({
  entities: z.array(LLMEntitySchema),
});

// Simplified prompt builder (matches the new entity.prompts.ts)
function buildSimplifiedPrompt(
  documentText: string,
  allowedTypes: string[]
): string {
  const systemPrompt = `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, provide:
1. name: Clear, descriptive name of the entity
2. type: Entity type from the allowed list
3. description: Brief description of what this entity represents

RULES:
- Extract ALL entities that match the allowed types
- Be thorough - don't miss important entities
- Use consistent naming
- Keep descriptions concise but informative`;

  let prompt = `${systemPrompt}

## Allowed Entity Types

Extract ONLY these types: ${allowedTypes.join(', ')}

`;

  for (const typeName of allowedTypes) {
    prompt += `- **${typeName}**\n`;
  }

  prompt += `
## Document

${documentText}

## Output Format

Return a JSON object with an "entities" array. Each entity must have:
- name (string): Entity name
- type (string): One of the allowed types above
- description (string, optional): Brief description

Example:
\`\`\`json
{
  "entities": [
    {"name": "John", "type": "Person", "description": "Author of the letter"},
    {"name": "Jerusalem", "type": "Place", "description": "Holy city"}
  ]
}
\`\`\`

Extract all entities now.`;

  return prompt;
}

const documentContent = `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever :
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
4. I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father.
5. And now I ask you, dear lady — not as though I were writing you a new commandment, but the one we have had from the beginning — that we love one another.
6. And this is love, that we walk according to his commandments; this is the commandment, just as you have heard from the beginning, so that you should walk in it.
7. For many deceivers have gone out into the world, those who do not confess the coming of Jesus Christ in the flesh. Such a one is the deceiver and the antichrist.
8. Watch yourselves, so that you may not lose what we have worked for, but may win a full reward.
9. Everyone who goes on ahead and does not abide in the teaching of Christ, does not have God. Whoever abides in the teaching has both the Father and the Son.
10. If anyone comes to you and does not bring this teaching, do not receive him into your house or give him any greeting,
11. for whoever greets him takes part in his wicked works.
12. Though I have much to write to you, I would rather not use paper and ink. Instead I hope to come to you and talk face to face, so that our joy may be complete.
13. The children of your elect sister greet you.`;

const allowedTypes = [
  'Angel',
  'Book',
  'Covenant',
  'Event',
  'Group',
  'Miracle',
  'Object',
  'Person',
  'Place',
  'Prophecy',
  'Quote',
];

async function main() {
  console.log('🔧 Simplified Entity Extraction Test');
  console.log(`   Model: ${modelName}`);
  console.log(`   Project: ${projectId}`);
  console.log(`   Location: ${location}`);

  const model = new ChatVertexAI({
    model: modelName,
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 4000,
  });

  const structuredModel = (model as any).withStructuredOutput(
    EntityExtractorOutputSchema,
    {
      name: 'extract_entities',
      method: 'function_calling',
    }
  );

  const prompt = buildSimplifiedPrompt(documentContent, allowedTypes);

  console.log(`\n📝 Prompt length: ${prompt.length} chars`);
  console.log(`   (Compare to old prompt which was ~25000+ chars)\n`);

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
    console.log(`   Entities extracted: ${result?.entities?.length || 0}`);

    if (result?.entities?.length > 0) {
      console.log('\n📋 Extracted Entities:');
      for (const entity of result.entities) {
        console.log(
          `   - ${entity.name} (${entity.type}): ${entity.description || 'N/A'}`
        );
      }
    }

    return true;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ Failed: ${e.message} (${elapsed}ms)`);
    if (e.cause) {
      console.log(`   Cause: ${e.cause}`);
    }
    if (e.stack) {
      console.log(`\n📜 Stack trace:\n${e.stack}`);
    }
    return false;
  }
}

main().catch(console.error);
