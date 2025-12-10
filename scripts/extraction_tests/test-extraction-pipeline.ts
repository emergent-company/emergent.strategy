#!/usr/bin/env npx tsx
/**
 * Test the full extraction pipeline via the server
 * This simulates what happens when a document extraction job is triggered
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import { z } from 'zod';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set credentials
const credPath = path.resolve(__dirname, '..', '..', 'spec-server-dev-vertex-ai.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

// Import from the actual source files (compile first if needed)
const projectId = 'spec-server-dev';
const location = 'europe-central2';
const modelName = 'gemini-2.5-flash-lite';

// LLMEntitySchema from state.ts
const LLMEntitySchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

const EntityExtractorOutputSchema = z.object({
  entities: z.array(LLMEntitySchema),
});

// Use the actual buildEntityExtractionPrompt logic
function buildEntityExtractionPrompt(
  documentText: string,
  objectSchemas: Record<string, any>,
  allowedTypes?: string[]
): string {
  const typesToExtract = allowedTypes || Object.keys(objectSchemas);
  
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

Extract ONLY these types: ${typesToExtract.join(', ')}

`;

  for (const typeName of typesToExtract) {
    const schema = objectSchemas[typeName];
    if (schema?.description) {
      prompt += `- **${typeName}**: ${schema.description}\n`;
    } else {
      prompt += `- **${typeName}**\n`;
    }
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

// Simulated object schemas (similar to what the template pack provides)
const objectSchemas: Record<string, any> = {
  Person: { description: 'A human individual' },
  Place: { description: 'A location or geographic entity' },
  Event: { description: 'A notable occurrence or happening' },
  Book: { description: 'A written work or scripture' },
  Quote: { description: 'A significant statement or teaching' },
  Group: { description: 'A collection of people' },
  Object: { description: 'A physical or abstract thing' },
  Covenant: { description: 'A divine agreement or promise' },
  Prophecy: { description: 'A prediction or divine revelation' },
  Miracle: { description: 'A supernatural event' },
  Angel: { description: 'A celestial being or messenger' },
};

// Longer test document (similar to what caused issues before)
const documentContent = `# I John - Chapter 1

1. That which was from the beginning, which we have heard, which we have seen with our eyes, which we looked upon and have touched with our hands, concerning the word of life—
2. the life was made manifest, and we have seen it, and testify to it and proclaim to you the eternal life, which was with the Father and was made manifest to us—
3. that which we have seen and heard we proclaim also to you, so that you too may have fellowship with us; and indeed our fellowship is with the Father and with his Son Jesus Christ.
4. And we are writing these things so that our joy may be complete.
5. This is the message we have heard from him and proclaim to you, that God is light, and in him is no darkness at all.
6. If we say we have fellowship with him while we walk in darkness, we lie and do not practice the truth.
7. But if we walk in the light, as he is in the light, we have fellowship with one another, and the blood of Jesus his Son cleanses us from all sin.
8. If we say we have no sin, we deceive ourselves, and the truth is not in us.
9. If we confess our sins, he is faithful and just to forgive us our sins and to cleanse us from all unrighteousness.
10. If we say we have not sinned, we make him a liar, and his word is not in us.

# I John - Chapter 2

1. My little children, I am writing these things to you so that you may not sin. But if anyone does sin, we have an advocate with the Father, Jesus Christ the righteous.
2. He is the propitiation for our sins, and not for ours only but also for the sins of the whole world.
3. And by this we know that we have come to know him, if we keep his commandments.
4. Whoever says "I know him" but does not keep his commandments is a liar, and the truth is not in him,
5. but whoever keeps his word, in him truly the love of God is perfected. By this we may know that we are in him:
6. whoever says he abides in him ought to walk in the same way in which he walked.`;

async function main() {
  console.log('🔧 Full Extraction Pipeline Test');
  console.log(`   Model: ${modelName}`);
  console.log(`   Project: ${projectId}`);
  console.log(`   Location: ${location}`);
  console.log(`   Document length: ${documentContent.length} chars`);
  
  const model = new ChatVertexAI({
    model: modelName,
    authOptions: { projectId },
    location,
    temperature: 0.1,
    maxOutputTokens: 8000,
  });

  const structuredModel = (model as any).withStructuredOutput(EntityExtractorOutputSchema, {
    name: 'extract_entities',
    method: 'function_calling',
  });

  const prompt = buildEntityExtractionPrompt(
    documentContent,
    objectSchemas,
    Object.keys(objectSchemas)
  );

  console.log(`\n📝 Prompt length: ${prompt.length} chars\n`);

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
    
    // Group by type
    if (result?.entities?.length > 0) {
      const byType: Record<string, any[]> = {};
      for (const entity of result.entities) {
        if (!byType[entity.type]) byType[entity.type] = [];
        byType[entity.type].push(entity);
      }
      
      console.log('\n📋 Entities by Type:');
      for (const [type, entities] of Object.entries(byType)) {
        console.log(`\n   ${type} (${entities.length}):`);
        for (const e of entities) {
          console.log(`     - ${e.name}: ${e.description || 'N/A'}`);
        }
      }
    }

    return true;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    console.log(`❌ Failed: ${e.message} (${elapsed}ms)`);
    if (e.stack) console.log(e.stack);
    return false;
  }
}

main().catch(console.error);
