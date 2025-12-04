#!/usr/bin/env npx tsx
/**
 * Debug: Show EXACTLY what is sent to Vertex AI (prompt + schema)
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set credentials
const credPath = path.resolve(__dirname, '..', 'spec-server-dev-vertex-ai.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;

// Document content from: 63_II_John.md
const DOCUMENT_CONTENT = `# II John

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
13. The children of your elect sister greet you.
`;

// Exact Person schema from Bible pack (same as test-extraction-job.ts)
const PERSON_SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Full name of the person' },
    role: { type: 'string', description: 'Position, title, or role (e.g., prophet, king, apostle)' },
    tribe: { type: 'string', description: 'Israelite tribe name (e.g., "Tribe of Judah") - will be linked to Group entity' },
    father: { type: 'string', description: "Father's name (e.g., \"Abraham\") - will be linked to Person entity" },
    mother: { type: 'string', description: "Mother's name (e.g., \"Sarah\") - will be linked to Person entity" },
    aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names (e.g., Saul/Paul, Simon/Peter)' },
    occupation: { type: 'string', description: 'Profession or occupation (e.g., shepherd, fisherman, tax collector)' },
    significance: { type: 'string', description: 'Why this person is important biblically (1-2 sentences)' },
    birth_location: { type: 'string', description: 'Place of birth name (e.g., "Bethlehem") - will be linked to Place entity' },
    death_location: { type: 'string', description: 'Place of death name (e.g., "Jerusalem") - will be linked to Place entity' },
    source_references: { type: 'array', items: { type: 'string' }, description: 'Biblical references where mentioned (e.g., ["Genesis 12", "Genesis 22"])' },
  },
};

// Build the exact prompt from test-extraction-job.ts
function buildExtractionPrompt(typeName: string, documentContent: string, objectSchema: any): string {
  let prompt = `You are an expert entity extraction system. Your task is to analyze the provided document and extract structured entities according to the schema definitions that follow.

Extract entities that match the defined types. For each entity:
- Provide a clear, descriptive name
- Include all relevant properties from the schema
- Assign appropriate confidence scores (0.0-1.0)
- Identify relationships between entities

Return your response as a valid JSON array matching the expected schema format.

**Entity Type to Extract:** ${typeName}

`;

  // Add schema information
  if (objectSchema) {
    if (objectSchema.description) {
      prompt += `**Description:** ${objectSchema.description}\n\n`;
    }

    if (objectSchema.properties) {
      prompt += '**Schema Definition:**\nProperties:\n';
      for (const [propName, propDef] of Object.entries(objectSchema.properties as Record<string, any>)) {
        if (propName.startsWith('_')) continue;
        const required = objectSchema.required?.includes(propName) ? ' (required)' : '';
        const description = propDef.description || '';
        const typeInfo = propDef.type ? ` [${propDef.type}]` : '';
        const enumInfo = propDef.enum ? ` (options: ${propDef.enum.join(', ')})` : '';
        prompt += `  - ${propName}${required}${typeInfo}${enumInfo}: ${description}\n`;
      }
      prompt += '\n';
    }
  }

  prompt += `Identify each person in the text. Return:
- name: Person's primary name
- aliases: Array of alternative names if mentioned
- role: Their role or title (e.g., prophet, king, apostle)
- occupation: Their profession if mentioned
- tribe: Name of their tribe (e.g., "Tribe of Judah")
- birth_location: Name of birthplace (e.g., "Bethlehem")
- death_location: Name of place where they died
- father: Father's name (e.g., "Abraham")
- mother: Mother's name (e.g., "Sarah")
- significance: Brief description of why they're important
- source_references: Array of chapter references where they appear

**Instructions:**
- Extract ALL ${typeName} entities found in the document
- For each entity, provide a confidence score (0.0-1.0)
- Include the original text snippet that supports the extraction
- If no ${typeName} entities are found, return an empty array

**Document Content:**

${documentContent}

**Output:** Return a JSON object with an "entities" array containing the extracted ${typeName} entities.`;

  return prompt;
}

// Build the JSON schema for structured output
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

const prompt = buildExtractionPrompt('Person', DOCUMENT_CONTENT, PERSON_SCHEMA);

console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║                    EXACT VERTEX AI CALL DEBUG                               ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝');

console.log('\n════════════════════════════════════════════════════════════════════════════');
console.log('1. MODEL CONFIGURATION');
console.log('════════════════════════════════════════════════════════════════════════════');
console.log(JSON.stringify({
  model: 'gemini-2.5-flash-lite',
  project: 'spec-server-dev',
  location: 'europe-central2',
  temperature: 1.0,
  maxOutputTokens: 65535,
}, null, 2));

console.log('\n════════════════════════════════════════════════════════════════════════════');
console.log('2. JSON SCHEMA (for withStructuredOutput)');
console.log('════════════════════════════════════════════════════════════════════════════');
console.log(JSON.stringify(jsonSchema, null, 2));

console.log('\n════════════════════════════════════════════════════════════════════════════');
console.log('3. PROMPT TEXT');
console.log('════════════════════════════════════════════════════════════════════════════');
console.log(prompt);

console.log('\n════════════════════════════════════════════════════════════════════════════');
console.log('4. STATS');
console.log('════════════════════════════════════════════════════════════════════════════');
console.log(`Prompt length: ${prompt.length} chars`);
console.log(`JSON Schema length: ${JSON.stringify(jsonSchema).length} chars`);
console.log(`Document length: ${DOCUMENT_CONTENT.length} chars`);

// Now actually try the call
console.log('\n════════════════════════════════════════════════════════════════════════════');
console.log('5. MAKING ACTUAL API CALL...');
console.log('════════════════════════════════════════════════════════════════════════════');

const model = new ChatVertexAI({
  model: 'gemini-2.5-flash-lite',
  authOptions: { projectId: 'spec-server-dev' },
  location: 'europe-central2',
  temperature: 1.0,
  maxOutputTokens: 65535,
});

const structuredModel = model.withStructuredOutput(jsonSchema, {
  name: 'extract_person',
});

const start = Date.now();
console.log(`Started at: ${new Date().toISOString()}`);

try {
  const result = await Promise.race([
    structuredModel.invoke(prompt),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout after 60s')), 60000)
    ),
  ]);
  console.log(`\n✅ SUCCESS in ${Date.now() - start}ms`);
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (err: any) {
  console.log(`\n❌ FAILED in ${Date.now() - start}ms`);
  console.log('Error:', err.message);
  if (err.stack) {
    console.log('Stack:', err.stack.split('\n').slice(0, 5).join('\n'));
  }
}
