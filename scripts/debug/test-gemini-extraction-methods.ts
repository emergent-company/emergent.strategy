/**
 * Test script to compare responseSchema vs function_calling methods
 * for entity extraction with properties field.
 *
 * The issue: Entity extraction returns entities with empty `properties` field.
 * This script tests both methods side-by-side to identify the root cause.
 *
 * Run with: npx ts-node scripts/debug/test-gemini-extraction-methods.ts
 */

import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';

// Get credentials from environment - support both API key and Vertex AI
const apiKey = process.env.GOOGLE_API_KEY;
const projectId =
  process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.VERTEX_AI_LOCATION || 'europe-central2';
const model = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite';

// Force Vertex AI mode if --vertex-ai flag is passed
const forceVertexAI = process.argv.includes('--vertex-ai');

// Determine which mode to use - prefer Vertex AI if project ID is set
const useVertexAI = forceVertexAI || (projectId ? true : false);

if (!apiKey && !projectId) {
  console.error(
    'Missing GOOGLE_API_KEY or GCP_PROJECT_ID environment variable'
  );
  process.exit(1);
}

if (forceVertexAI && !projectId) {
  console.error(
    '--vertex-ai flag requires GCP_PROJECT_ID environment variable'
  );
  process.exit(1);
}

console.log(`\n${'='.repeat(80)}`);
console.log('GEMINI EXTRACTION METHOD COMPARISON TEST');
console.log(`${'='.repeat(80)}`);
console.log(`Mode: ${useVertexAI ? 'Vertex AI' : 'Google AI Studio'}`);
if (useVertexAI) {
  console.log(`Project: ${projectId}`);
  console.log(`Location: ${location}`);
} else {
  console.log(`API Key: ${apiKey?.substring(0, 10)}...`);
}
console.log(`Model: ${model}`);
console.log(`${'='.repeat(80)}\n`);

// Test document - simple text with clear entities that should have properties
const testDocument = `
Genesis 12:1-3 (NIV)
The Call of Abram

The LORD had said to Abram, "Go from your country, your people and your father's 
household to the land I will show you.

I will make you into a great nation, and I will bless you; I will make your name great,
and you will be a blessing. I will bless those who bless you, and whoever curses you 
I will curse; and all peoples on earth will be blessed through you."

Abram was seventy-five years old when he set out from Harran. He took his wife Sarai, 
his nephew Lot, all the possessions they had accumulated and the people they had acquired 
in Harran, and they set out for the land of Canaan.
`;

// Schema for entities - matching what we use in extraction
const entitySchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the entity' },
          type: {
            type: 'string',
            description: 'Type of entity (Person, Location, Event, etc.)',
          },
          description: {
            type: 'string',
            description: 'Brief description of the entity',
          },
          properties: {
            type: 'object',
            description: 'Type-specific properties as key-value pairs',
            additionalProperties: {}, // Allow any properties
          },
        },
        required: ['name', 'type'],
      },
    },
  },
  required: ['entities'],
};

// Same schema but for function calling (using Google's Schema type)
const functionCallingSchema = {
  type: Type.OBJECT,
  properties: {
    entities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Name of the entity' },
          type: {
            type: Type.STRING,
            description: 'Type of entity (Person, Location, Event, etc.)',
          },
          description: {
            type: Type.STRING,
            description: 'Brief description of the entity',
          },
          properties: {
            type: Type.OBJECT,
            description: 'Type-specific properties as key-value pairs',
            // Note: Google's Schema type doesn't have additionalProperties
          },
        },
        required: ['name', 'type'],
      },
    },
  },
  required: ['entities'],
};

const systemPrompt = `You are an expert entity extractor. Extract all entities from the given text.

For each entity, provide:
- name: The entity's name
- type: The entity type (Person, Location, Event, Group, Concept)
- description: A brief description
- properties: Type-specific properties as key-value pairs

For Person entities, include properties like:
- role: Their role or title
- age: Their age if mentioned
- relationships: Key relationships (e.g., "wife of Abram")

For Location entities, include properties like:
- location_type: city, country, region, etc.
- significance: Why this place is important

Extract ALL entities you can find in the text.`;

async function testResponseSchema(ai: GoogleGenAI): Promise<any> {
  console.log('\n' + '─'.repeat(80));
  console.log('TEST 1: responseSchema Method (JSON mode)');
  console.log('─'.repeat(80));

  const prompt = `${systemPrompt}\n\nDocument:\n${testDocument}`;

  console.log('\nSchema being sent:');
  console.log(JSON.stringify(entitySchema, null, 2));

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
        responseSchema: entitySchema as any,
      },
    });

    console.log('\n✅ Response received');
    console.log(`Finish reason: ${response.candidates?.[0]?.finishReason}`);
    console.log(`Token usage: ${JSON.stringify(response.usageMetadata)}`);

    const text = response.text;
    console.log('\nRaw response text:');
    console.log(text);

    try {
      const parsed = JSON.parse(text || '{}');
      console.log('\nParsed entities:');
      if (parsed.entities) {
        for (const entity of parsed.entities) {
          console.log(`\n  📌 ${entity.name} (${entity.type})`);
          console.log(`     Description: ${entity.description || '(none)'}`);
          console.log(
            `     Properties: ${JSON.stringify(entity.properties || {})}`
          );
        }
      }
      return parsed;
    } catch (e) {
      console.error('Failed to parse response as JSON:', e);
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function testFunctionCalling(ai: GoogleGenAI): Promise<any> {
  console.log('\n' + '─'.repeat(80));
  console.log('TEST 2: Function Calling Method');
  console.log('─'.repeat(80));

  const prompt = `${systemPrompt}\n\nDocument:\n${testDocument}`;

  const functionDeclaration = {
    name: 'extract_entities',
    description: 'Extract entities from the document',
    parameters: functionCallingSchema,
  };

  console.log('\nFunction declaration being sent:');
  console.log(JSON.stringify(functionDeclaration, null, 2));

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 8000,
        tools: [{ functionDeclarations: [functionDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['extract_entities'],
          },
        },
      },
    });

    console.log('\n✅ Response received');
    console.log(`Finish reason: ${response.candidates?.[0]?.finishReason}`);
    console.log(`Token usage: ${JSON.stringify(response.usageMetadata)}`);

    const functionCalls = response.functionCalls;
    console.log(`\nFunction calls: ${functionCalls?.length || 0}`);

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      console.log(`Function name: ${call.name}`);
      console.log('\nRaw function args:');
      console.log(JSON.stringify(call.args, null, 2));

      const result = call.args as any;
      if (result?.entities) {
        console.log('\nParsed entities:');
        for (const entity of result.entities) {
          console.log(`\n  📌 ${entity.name} (${entity.type})`);
          console.log(`     Description: ${entity.description || '(none)'}`);
          console.log(
            `     Properties: ${JSON.stringify(entity.properties || {})}`
          );
        }
      }
      return result;
    } else {
      console.log('\nNo function calls in response');
      console.log('Response text:', response.text);
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function testFunctionCallingWithJsonSchema(
  ai: GoogleGenAI
): Promise<any> {
  console.log('\n' + '─'.repeat(80));
  console.log(
    'TEST 3: Function Calling with parametersJsonSchema (supports additionalProperties)'
  );
  console.log('─'.repeat(80));

  const prompt = `${systemPrompt}\n\nDocument:\n${testDocument}`;

  // Using parametersJsonSchema instead of parameters - this supports additionalProperties
  const functionDeclaration = {
    name: 'extract_entities',
    description: 'Extract entities from the document',
    parametersJsonSchema: entitySchema, // Use raw JSON schema
  };

  console.log('\nFunction declaration with parametersJsonSchema:');
  console.log(JSON.stringify(functionDeclaration, null, 2));

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 8000,
        tools: [{ functionDeclarations: [functionDeclaration as any] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['extract_entities'],
          },
        },
      },
    });

    console.log('\n✅ Response received');
    console.log(`Finish reason: ${response.candidates?.[0]?.finishReason}`);
    console.log(`Token usage: ${JSON.stringify(response.usageMetadata)}`);

    const functionCalls = response.functionCalls;
    console.log(`\nFunction calls: ${functionCalls?.length || 0}`);

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      console.log(`Function name: ${call.name}`);
      console.log('\nRaw function args:');
      console.log(JSON.stringify(call.args, null, 2));

      const result = call.args as any;
      if (result?.entities) {
        console.log('\nParsed entities:');
        for (const entity of result.entities) {
          console.log(`\n  📌 ${entity.name} (${entity.type})`);
          console.log(`     Description: ${entity.description || '(none)'}`);
          console.log(
            `     Properties: ${JSON.stringify(entity.properties || {})}`
          );
        }
      }
      return result;
    } else {
      console.log('\nNo function calls in response');
      console.log('Response text:', response.text);
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function testResponseSchemaWithExplicitProperties(
  ai: GoogleGenAI
): Promise<any> {
  console.log('\n' + '─'.repeat(80));
  console.log(
    'TEST 4: responseSchema with EXPLICIT property definitions (no additionalProperties)'
  );
  console.log('─'.repeat(80));

  // Define explicit properties instead of using additionalProperties
  const explicitSchema = {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the entity' },
            type: {
              type: 'string',
              description: 'Type of entity (Person, Location, Event, etc.)',
            },
            description: {
              type: 'string',
              description: 'Brief description of the entity',
            },
            properties: {
              type: 'object',
              description: 'Type-specific properties',
              properties: {
                role: {
                  type: 'string',
                  description: 'Role or title (for Person)',
                },
                age: {
                  type: 'string',
                  description: 'Age if mentioned (for Person)',
                },
                relationships: {
                  type: 'string',
                  description: 'Key relationships (for Person)',
                },
                location_type: {
                  type: 'string',
                  description: 'Type of location (city, country, etc.)',
                },
                significance: {
                  type: 'string',
                  description: 'Why this place is important',
                },
              },
            },
          },
          required: ['name', 'type'],
        },
      },
    },
    required: ['entities'],
  };

  const prompt = `${systemPrompt}\n\nDocument:\n${testDocument}`;

  console.log('\nSchema with explicit properties:');
  console.log(JSON.stringify(explicitSchema, null, 2));

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.1,
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
        responseSchema: explicitSchema as any,
      },
    });

    console.log('\n✅ Response received');
    console.log(`Finish reason: ${response.candidates?.[0]?.finishReason}`);
    console.log(`Token usage: ${JSON.stringify(response.usageMetadata)}`);

    const text = response.text;
    console.log('\nRaw response text:');
    console.log(text);

    try {
      const parsed = JSON.parse(text || '{}');
      console.log('\nParsed entities:');
      if (parsed.entities) {
        for (const entity of parsed.entities) {
          console.log(`\n  📌 ${entity.name} (${entity.type})`);
          console.log(`     Description: ${entity.description || '(none)'}`);
          console.log(
            `     Properties: ${JSON.stringify(entity.properties || {})}`
          );
        }
      }
      return parsed;
    } catch (e) {
      console.error('Failed to parse response as JSON:', e);
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function main() {
  // Initialize based on available credentials
  const ai = useVertexAI
    ? new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location: location,
      })
    : new GoogleGenAI({ apiKey: apiKey! });

  console.log(
    `Mode: ${useVertexAI ? 'Vertex AI' : 'Google AI Studio (API Key)'}`
  );
  if (useVertexAI) {
    console.log(`Project: ${projectId}`);
    console.log(`Location: ${location}`);
  }
  console.log(`Model: ${model}`);

  // Run all tests
  const results: Record<string, any> = {};

  results['responseSchema'] = await testResponseSchema(ai);
  results['functionCalling'] = await testFunctionCalling(ai);
  results['functionCallingJsonSchema'] =
    await testFunctionCallingWithJsonSchema(ai);
  results['responseSchemaExplicit'] =
    await testResponseSchemaWithExplicitProperties(ai);

  // Summary comparison
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(80));

  for (const [method, result] of Object.entries(results)) {
    console.log(`\n${method}:`);
    if (!result?.entities) {
      console.log('  ❌ No entities extracted');
      continue;
    }

    const entities = result.entities;
    const withProps = entities.filter(
      (e: any) => e.properties && Object.keys(e.properties).length > 0
    );
    const withDesc = entities.filter(
      (e: any) => e.description && e.description.length > 0
    );

    console.log(`  Total entities: ${entities.length}`);
    console.log(
      `  With properties: ${withProps.length} (${Math.round(
        (withProps.length / entities.length) * 100
      )}%)`
    );
    console.log(
      `  With description: ${withDesc.length} (${Math.round(
        (withDesc.length / entities.length) * 100
      )}%)`
    );

    if (withProps.length > 0) {
      console.log(`  ✅ Properties ARE being populated!`);
      console.log(`  Sample: ${JSON.stringify(withProps[0].properties)}`);
    } else {
      console.log(`  ⚠️ Properties are EMPTY`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
