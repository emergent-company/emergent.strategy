/**
 * Test the improved entity extraction prompt with Vertex AI
 * with detailed debugging output.
 */

import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';

// Vertex AI config
const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'spec-server-dev';
const location = process.env.VERTEX_AI_LOCATION || 'europe-central2';
const model = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite';

console.log(`\n${'='.repeat(80)}`);
console.log('IMPROVED PROMPT TEST (DEBUG) - Vertex AI');
console.log(`${'='.repeat(80)}`);

// Simpler test document
const testDocument = `
Abram was seventy-five years old when he set out from Harran. 
He took his wife Sarai and his nephew Lot to the land of Canaan.
`;

// Simplified prompt
const prompt = `Extract all entities from this text as a JSON array.

For each entity provide:
- name: The entity's name
- type: Person or Location
- description: Brief description
- properties: Object with attributes like age, role, region, etc. MUST NOT be empty.

IMPORTANT: The properties field MUST contain relevant attributes. Never return empty properties {}.

Text:
${testDocument}

Call extract_entities with the entities you find.`;

// Minimal schema
const entitySchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
          properties: {
            type: 'object',
            additionalProperties: {},
          },
        },
        required: ['name', 'type'],
      },
    },
  },
  required: ['entities'],
};

async function test() {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: location,
  });

  const functionDeclaration = {
    name: 'extract_entities',
    description: 'Extract entities from document',
    parametersJsonSchema: entitySchema,
  };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 4000,
        tools: [{ functionDeclarations: [functionDeclaration as any] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['extract_entities'],
          },
        },
      },
    });

    console.log('\n=== RAW RESPONSE ===');
    console.log('Candidates:', JSON.stringify(response.candidates, null, 2));
    console.log('\nFunction Calls:', JSON.stringify(response.functionCalls, null, 2));
    console.log('\nText:', response.text);
    console.log('\nFinish reason:', response.candidates?.[0]?.finishReason);
    console.log('Token usage:', JSON.stringify(response.usageMetadata));

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const args = functionCalls[0].args as any;
      console.log('\n=== PARSED ARGS ===');
      console.log(JSON.stringify(args, null, 2));
      
      if (args?.entities) {
        console.log('\n=== ENTITIES ANALYSIS ===');
        for (const entity of args.entities) {
          const hasProps = entity.properties && Object.keys(entity.properties).length > 0;
          console.log(`${entity.name} (${entity.type}): properties=${hasProps ? 'YES' : 'EMPTY'}`);
          if (hasProps) {
            console.log(`  ${JSON.stringify(entity.properties)}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('ERROR:', error);
  }
}

test().catch(console.error);
