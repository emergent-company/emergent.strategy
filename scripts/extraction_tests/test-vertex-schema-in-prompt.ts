#!/usr/bin/env npx tsx
/**
 * Vertex AI Batch Extraction Test - Schema in Prompt
 *
 * Tests embedding schema directly in the prompt (like extraction jobs do)
 * instead of relying on responseSchema parameter.
 *
 * This approach matches how apps/server extraction works.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CREDENTIALS_FILE =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(process.cwd(), 'spec-server-dev-vertex-ai.json');
const GCS_BUCKET = process.env.GCS_BUCKET || 'emergent-batch-extraction';
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || 'spec-server-dev';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL_ID = 'gemini-2.5-flash';

// Test with Genesis (small sample)
const TEST_DOCUMENT = path.join(
  process.cwd(),
  'test-data/bible/books/01_Genesis.md'
);
const OUTPUT_DIR = path.join(__dirname, '.schema-prompt-test');

// ============================================================================
// Bible Schema Definitions (matching extraction job format)
// ============================================================================

const ENTITY_SCHEMAS = {
  Person: {
    description:
      'Biblical person (prophet, king, apostle, patriarch, etc.) with genealogical and biographical information',
    properties: {
      name: { type: 'string', description: 'Full name (required)' },
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Alternative names (e.g., Abram/Abraham)',
      },
      role: {
        type: 'string',
        description: 'Primary role (prophet, king, apostle, patriarch, judge)',
      },
      occupation: {
        type: 'string',
        description: 'Profession (shepherd, fisherman, tentmaker)',
      },
      tribe: { type: 'string', description: 'Tribe of Israel if applicable' },
      father: { type: 'string', description: "Father's name" },
      mother: { type: 'string', description: "Mother's name" },
      birth_location: { type: 'string', description: 'Place of birth' },
      death_location: { type: 'string', description: 'Place of death' },
      significance: {
        type: 'string',
        description: 'Why this person is important (1-2 sentences)',
      },
    },
    required: ['name'],
  },
  Place: {
    description:
      'Geographic location (city, region, mountain, river, sea, garden, etc.)',
    properties: {
      name: { type: 'string', description: 'Primary name (required)' },
      alternate_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Other names for this place',
      },
      place_type: {
        type: 'string',
        enum: [
          'city',
          'region',
          'country',
          'mountain',
          'river',
          'sea',
          'desert',
          'garden',
          'building',
          'landmark',
        ],
        description: 'Type of place',
      },
      region: { type: 'string', description: 'Parent region' },
      significance: { type: 'string', description: 'Biblical significance' },
    },
    required: ['name'],
  },
  Event: {
    description:
      'Biblical event (creation, miracle, battle, covenant, prophecy, etc.)',
    properties: {
      name: { type: 'string', description: 'Event name (required)' },
      event_type: {
        type: 'string',
        enum: [
          'creation',
          'miracle',
          'battle',
          'covenant',
          'judgment',
          'prophecy',
          'journey',
          'birth',
          'death',
          'other',
        ],
        description: 'Type of event',
      },
      location: { type: 'string', description: 'Where it occurred' },
      participants: {
        type: 'array',
        items: { type: 'string' },
        description: 'People involved',
      },
      description: { type: 'string', description: 'What happened' },
      theological_significance: {
        type: 'string',
        description: 'Theological meaning or importance',
      },
    },
    required: ['name'],
  },
  Group: {
    description:
      'Collection of people (tribe, nation, religious sect, family clan)',
    properties: {
      name: { type: 'string', description: 'Group name (required)' },
      group_type: {
        type: 'string',
        enum: ['tribe', 'nation', 'family_clan', 'other'],
        description: 'Type of group',
      },
      region: { type: 'string', description: 'Geographic region' },
      founder: { type: 'string', description: 'Founder or patriarch' },
      description: { type: 'string', description: 'Description of the group' },
    },
    required: ['name'],
  },
};

const RELATIONSHIP_SCHEMAS = {
  PARENT_OF: {
    description: 'Parent-child biological relationship',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [
      {
        source: 'Abraham',
        target: 'Isaac',
        evidence: 'Abraham fathered Isaac',
      },
    ],
  },
  CHILD_OF: {
    description: 'Child of parent',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [
      { source: 'Isaac', target: 'Abraham', evidence: 'Isaac, son of Abraham' },
    ],
  },
  MARRIED_TO: {
    description: 'Marriage relationship',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [
      {
        source: 'Abraham',
        target: 'Sarah',
        evidence: "Sarah was Abraham's wife",
      },
    ],
  },
  SIBLING_OF: {
    description: 'Brother or sister relationship',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [
      {
        source: 'Jacob',
        target: 'Esau',
        evidence: 'Jacob and Esau were twins',
      },
    ],
  },
  BORN_IN: {
    description: 'Person born in a place',
    source_types: ['Person'],
    target_types: ['Place'],
  },
  LIVED_IN: {
    description: 'Person lived/dwelt in a place',
    source_types: ['Person'],
    target_types: ['Place'],
  },
  TRAVELED_TO: {
    description: 'Person traveled to a place',
    source_types: ['Person'],
    target_types: ['Place'],
  },
  LOCATED_IN: {
    description: 'Place located within another place',
    source_types: ['Place'],
    target_types: ['Place'],
  },
  PARTICIPATES_IN: {
    description: 'Person participated in an event',
    source_types: ['Person'],
    target_types: ['Event'],
  },
  OCCURRED_AT: {
    description: 'Event occurred at a place',
    source_types: ['Event'],
    target_types: ['Place'],
  },
  ANCESTOR_OF: {
    description: 'Genealogical ancestor (grandparent, great-grandparent, etc.)',
    source_types: ['Person'],
    target_types: ['Person'],
  },
  MEMBER_OF: {
    description: 'Person is a member of a group',
    source_types: ['Person'],
    target_types: ['Group'],
  },
  FOUNDED: {
    description: 'Person founded a group or established a place',
    source_types: ['Person'],
    target_types: ['Group', 'Place'],
  },
};

// ============================================================================
// Prompt Builder (matching extraction job style)
// ============================================================================

function buildEntityExtractionPrompt(documentText: string): string {
  const typesToExtract = Object.keys(ENTITY_SCHEMAS);
  const TOP_LEVEL_FIELDS = ['name', 'description', 'type'];

  let prompt = `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, you MUST provide these four fields:
1. name: Clear, descriptive name of the entity (REQUIRED)
2. type: Entity type from the allowed list (REQUIRED)
3. description: Brief description of what this entity represents
4. properties: An object containing type-specific attributes

CRITICAL: Return a valid JSON object with an "entities" array.

## Entity Types and Their Properties

Extract ONLY these types: ${typesToExtract.join(', ')}

`;

  // Add type descriptions WITH property schemas
  for (const typeName of typesToExtract) {
    const schema = ENTITY_SCHEMAS[typeName as keyof typeof ENTITY_SCHEMAS];
    prompt += `### ${typeName}\n`;
    prompt += `${schema.description}\n`;

    const additionalProps = Object.entries(schema.properties).filter(
      ([propName]) => !TOP_LEVEL_FIELDS.includes(propName)
    );

    if (additionalProps.length > 0) {
      prompt += `**Properties** (stored in \`properties\` object):\n`;
      for (const [propName, propDef] of additionalProps) {
        const required = schema.required?.includes(propName)
          ? ' (required)'
          : '';
        prompt += `- \`${propName}\` (${propDef.type})${required}: ${propDef.description}\n`;
      }
    }
    prompt += '\n';
  }

  prompt += `## Document

${documentText}

## Output Format

Return ONLY a valid JSON object with this exact structure:
\`\`\`json
{
  "entities": [
    {
      "name": "Entity Name",
      "type": "Person|Place|Event|Group",
      "description": "Brief description",
      "properties": {
        "property1": "value1",
        "property2": "value2"
      }
    }
  ]
}
\`\`\`

Extract all entities now. Return ONLY the JSON object, no other text.`;

  return prompt;
}

function buildRelationshipExtractionPrompt(
  documentText: string,
  entities: any[]
): string {
  let prompt = `You are an expert at finding connections in knowledge graphs. Identify ALL meaningful relationships between the entities listed below.

For EACH relationship:
1. source: The source entity name (must match an entity from the list)
2. target: The target entity name (must match an entity from the list)
3. type: Relationship type from the available types below
4. description: Brief description of this specific relationship

CRITICAL: Return a valid JSON object with a "relationships" array.

## Available Relationship Types

`;

  // Add relationship type definitions
  for (const [typeName, schema] of Object.entries(RELATIONSHIP_SCHEMAS)) {
    prompt += `### ${typeName}\n`;
    prompt += `${schema.description}\n`;

    const sourceTypes = schema.source_types || [];
    const targetTypes = schema.target_types || [];
    if (sourceTypes.length > 0 || targetTypes.length > 0) {
      prompt += `**Valid types:** ${sourceTypes.join(
        ' or '
      )} → ${targetTypes.join(' or ')}\n`;
    }

    if (schema.examples && schema.examples.length > 0) {
      prompt += `**Example:** ${schema.examples[0].source} → ${schema.examples[0].target}\n`;
    }
    prompt += '\n';
  }

  // Add entities list
  prompt += `## Entities Found (use these exact names)

`;
  for (const entity of entities) {
    prompt += `- **${entity.name}** (${entity.type}): ${
      entity.description || ''
    }\n`;
  }

  prompt += `
## Document Context

${documentText}

## Output Format

Return ONLY a valid JSON object with this exact structure:
\`\`\`json
{
  "relationships": [
    {
      "source": "Source Entity Name",
      "target": "Target Entity Name",
      "type": "RELATIONSHIP_TYPE",
      "description": "Description of this relationship"
    }
  ]
}
\`\`\`

Find ALL relationships between the entities. Return ONLY the JSON object, no other text.`;

  return prompt;
}

// ============================================================================
// API Functions
// ============================================================================

async function getAccessToken(): Promise<string> {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));

  // Create JWT for service account auth
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };

  const { createSign } = await import('crypto');
  const signInput =
    Buffer.from(JSON.stringify(header)).toString('base64url') +
    '.' +
    Buffer.from(JSON.stringify(payload)).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = signInput + '.' + signature;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function callGemini(
  accessToken: string,
  prompt: string
): Promise<string> {
  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json', // Request JSON output
    },
  };

  console.log(`  Calling Gemini API (${MODEL_ID})...`);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('Vertex AI Schema-in-Prompt Test');
  console.log('='.repeat(80));

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load test document (use just the first chapter for quick test)
  console.log('\nLoading test document...');
  const fullDoc = fs.readFileSync(TEST_DOCUMENT, 'utf-8');

  // Extract just Genesis 1 for testing
  const genesis1Match = fullDoc.match(
    /# Genesis[\s\S]*?## Chapter 1[\s\S]*?(?=## Chapter 2|$)/
  );
  const testDoc = genesis1Match ? genesis1Match[0] : fullDoc.slice(0, 5000);
  console.log(`  Document size: ${testDoc.length} characters`);

  // Get access token
  console.log('\nAuthenticating...');
  const token = await getAccessToken();
  console.log('  ✓ Got access token');

  // Step 1: Entity Extraction
  console.log('\n' + '-'.repeat(80));
  console.log('Step 1: Entity Extraction (with schema in prompt)');
  console.log('-'.repeat(80));

  const entityPrompt = buildEntityExtractionPrompt(testDoc);
  console.log(`  Prompt size: ${entityPrompt.length} characters`);

  // Save prompt for inspection
  fs.writeFileSync(path.join(OUTPUT_DIR, 'entity-prompt.txt'), entityPrompt);
  console.log(
    `  Saved prompt to ${path.join(OUTPUT_DIR, 'entity-prompt.txt')}`
  );

  const entityResponse = await callGemini(token, entityPrompt);
  console.log(`  Response size: ${entityResponse.length} characters`);

  // Save raw response
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'entity-response-raw.txt'),
    entityResponse
  );

  // Parse entities
  let entities: any[] = [];
  try {
    // Try to extract JSON from response
    const jsonMatch = entityResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      entities = parsed.entities || [];
    }
  } catch (e) {
    console.log(`  ⚠ Failed to parse JSON: ${e}`);
  }

  console.log(`  ✓ Extracted ${entities.length} entities`);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'entities.json'),
    JSON.stringify(entities, null, 2)
  );

  // Show entity summary
  if (entities.length > 0) {
    const byType = new Map<string, number>();
    for (const e of entities) {
      byType.set(e.type, (byType.get(e.type) || 0) + 1);
    }
    console.log('\n  Entity type distribution:');
    for (const [type, count] of byType) {
      console.log(`    - ${type}: ${count}`);
    }

    console.log('\n  Sample entities:');
    for (const e of entities.slice(0, 5)) {
      console.log(
        `    - ${e.name} (${e.type}): ${
          e.description?.slice(0, 50) || 'no description'
        }...`
      );
      if (e.properties && Object.keys(e.properties).length > 0) {
        console.log(`      Properties: ${JSON.stringify(e.properties)}`);
      }
    }
  }

  // Step 2: Relationship Extraction
  console.log('\n' + '-'.repeat(80));
  console.log('Step 2: Relationship Extraction (with schema in prompt)');
  console.log('-'.repeat(80));

  if (entities.length < 2) {
    console.log('  ⚠ Not enough entities for relationship extraction');
    return;
  }

  const relPrompt = buildRelationshipExtractionPrompt(testDoc, entities);
  console.log(`  Prompt size: ${relPrompt.length} characters`);

  // Save prompt for inspection
  fs.writeFileSync(path.join(OUTPUT_DIR, 'relationship-prompt.txt'), relPrompt);

  const relResponse = await callGemini(token, relPrompt);
  console.log(`  Response size: ${relResponse.length} characters`);

  // Save raw response
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'relationship-response-raw.txt'),
    relResponse
  );

  // Parse relationships
  let relationships: any[] = [];
  try {
    const jsonMatch = relResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      relationships = parsed.relationships || [];
    }
  } catch (e) {
    console.log(`  ⚠ Failed to parse JSON: ${e}`);
  }

  console.log(`  ✓ Extracted ${relationships.length} relationships`);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'relationships.json'),
    JSON.stringify(relationships, null, 2)
  );

  // Show relationship summary
  if (relationships.length > 0) {
    const byType = new Map<string, number>();
    for (const r of relationships) {
      byType.set(r.type, (byType.get(r.type) || 0) + 1);
    }
    console.log('\n  Relationship type distribution:');
    for (const [type, count] of [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)) {
      console.log(`    - ${type}: ${count}`);
    }

    console.log('\n  Sample relationships:');
    for (const r of relationships.slice(0, 10)) {
      console.log(`    - ${r.source} --[${r.type}]--> ${r.target}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Entities: ${entities.length}`);
  console.log(`  Relationships: ${relationships.length}`);
  console.log(`  Output directory: ${OUTPUT_DIR}`);

  // Validate against schema
  console.log('\n  Schema Compliance Check:');
  const validTypes = new Set(Object.keys(ENTITY_SCHEMAS));
  const invalidEntities = entities.filter((e) => !validTypes.has(e.type));
  if (invalidEntities.length > 0) {
    console.log(`    ⚠ ${invalidEntities.length} entities with invalid types:`);
    for (const e of invalidEntities.slice(0, 5)) {
      console.log(`      - ${e.name}: type="${e.type}"`);
    }
  } else {
    console.log(`    ✓ All ${entities.length} entities have valid types`);
  }

  const validRelTypes = new Set(Object.keys(RELATIONSHIP_SCHEMAS));
  const invalidRels = relationships.filter((r) => !validRelTypes.has(r.type));
  if (invalidRels.length > 0) {
    console.log(
      `    ⚠ ${invalidRels.length} relationships with invalid types:`
    );
    for (const r of invalidRels.slice(0, 5)) {
      console.log(`      - ${r.source} --[${r.type}]--> ${r.target}`);
    }
  } else {
    console.log(
      `    ✓ All ${relationships.length} relationships have valid types`
    );
  }
}

main().catch(console.error);
