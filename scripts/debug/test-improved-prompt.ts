/**
 * Test the improved entity extraction prompt with Vertex AI
 * to verify properties are now being populated.
 */

import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';

// Vertex AI config
const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'spec-server-dev';
const location = process.env.VERTEX_AI_LOCATION || 'europe-central2';
const model = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite';

console.log(`\n${'='.repeat(80)}`);
console.log('IMPROVED PROMPT TEST - Vertex AI');
console.log(`${'='.repeat(80)}`);
console.log(`Project: ${projectId}`);
console.log(`Location: ${location}`);
console.log(`Model: ${model}`);
console.log(`${'='.repeat(80)}\n`);

// Test document
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

// Improved prompt (matching our updated prompts file)
const improvedPrompt = `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, you MUST provide these four fields:
1. name: Clear, descriptive name of the entity (REQUIRED, top-level field)
2. type: Entity type from the allowed list (REQUIRED, top-level field)
3. description: Brief description of what this entity represents (top-level field)
4. properties: An object containing type-specific attributes (CRITICAL - see below)

CRITICAL INSTRUCTIONS FOR PROPERTIES:
- The "properties" field is an object that MUST contain type-specific attributes extracted from the document
- For Person entities: include role, occupation, title, father, mother, tribe, age, significance, etc.
- For Location entities: include region, country, location_type, significance, etc.
- For Event entities: include date, location, participants, outcome, etc.
- For Organization entities: include type, purpose, members, location, etc.
- NEVER return an empty properties object {} if there is ANY relevant information in the document
- Extract ALL attributes mentioned or implied in the text for each entity
- The properties object should NOT contain name, type, or description - those are top-level fields

RULES:
- Extract ALL entities that match the allowed types
- Be thorough - don't miss important entities
- Use consistent naming
- Keep descriptions concise but informative
- Only include properties that are explicitly mentioned or clearly implied in the document
- Do NOT guess or fabricate property values

## Entity Types and Their Properties

Extract ONLY these types: Person, Location, Event, Group

### Person
A human individual mentioned in the text
**Additional Properties** (stored in \`properties\` object):
- \`role\` (string): Their role or title
- \`age\` (string): Their age if mentioned
- \`father\` (string): Father's name
- \`tribe\` (string): Tribe or family
- \`significance\` (string): Why they are important

### Location
A geographical place
**Additional Properties** (stored in \`properties\` object):
- \`location_type\` (string): city, country, region, etc.
- \`region\` (string): Larger geographical region
- \`significance\` (string): Why this place is important

## Document

${testDocument}

## Instructions

Call the extract_entities function with the entities you find. For each entity:
- name: Entity name (REQUIRED top-level field)
- type: One of the allowed types above (REQUIRED top-level field)
- description: Brief description (top-level field)
- properties: Object with type-specific attributes (CRITICAL - must not be empty if attributes exist)

CRITICAL: The "properties" object MUST contain type-specific attributes extracted from the document.
- For Person: include role, occupation, father, mother, tribe, age, significance, etc.
- For Location: include region, country, location_type, significance, etc.
- For Event: include date, location, participants, outcome, etc.
- NEVER return empty properties {} if the document mentions ANY attributes for the entity.

Example of what each entity should look like:
{
  "name": "Moses",
  "type": "Person",
  "description": "Leader who brought the Israelites out of Egypt",
  "properties": {
    "role": "prophet and leader",
    "tribe": "Levi",
    "significance": "Received the Ten Commandments"
  }
}

Extract all entities now by calling the extract_entities function.`;

// Schema for function calling
const entitySchema = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the entity' },
          type: { type: 'string', description: 'Type of entity' },
          description: { type: 'string', description: 'Brief description' },
          properties: {
            type: 'object',
            description: 'Type-specific properties as key-value pairs',
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
    description: 'Extract entities from the document',
    parametersJsonSchema: entitySchema,
  };

  console.log('Testing with improved prompt...\n');

  try {
    const response = await ai.models.generateContent({
      model,
      contents: improvedPrompt,
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

    console.log('✅ Response received');
    console.log(`Finish reason: ${response.candidates?.[0]?.finishReason}`);
    console.log(`Token usage: ${JSON.stringify(response.usageMetadata)}`);

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const result = functionCalls[0].args as any;
      
      console.log('\n' + '─'.repeat(60));
      console.log('EXTRACTED ENTITIES');
      console.log('─'.repeat(60));
      
      if (result?.entities) {
        let entitiesWithProps = 0;
        
        for (const entity of result.entities) {
          const hasProps = entity.properties && Object.keys(entity.properties).length > 0;
          if (hasProps) entitiesWithProps++;
          
          console.log(`\n📌 ${entity.name} (${entity.type})`);
          console.log(`   Description: ${entity.description || '(none)'}`);
          console.log(`   Properties: ${hasProps ? JSON.stringify(entity.properties) : '❌ EMPTY'}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total entities: ${result.entities.length}`);
        console.log(`With properties: ${entitiesWithProps} (${Math.round((entitiesWithProps / result.entities.length) * 100)}%)`);
        
        if (entitiesWithProps === result.entities.length) {
          console.log('\n✅ SUCCESS: All entities have properties populated!');
        } else if (entitiesWithProps > 0) {
          console.log(`\n⚠️ PARTIAL: ${result.entities.length - entitiesWithProps} entities still have empty properties`);
        } else {
          console.log('\n❌ FAILED: No entities have properties populated');
        }
      }
    } else {
      console.log('❌ No function calls in response');
      console.log('Response text:', response.text);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

test().catch(console.error);
