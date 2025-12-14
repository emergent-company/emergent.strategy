#!/usr/bin/env npx tsx
/**
 * Vertex AI Extraction Test - Schema in Prompt (v2)
 * 
 * Tests embedding schema directly in the prompt with a larger document.
 * This version processes Genesis 1-5 (genealogies) to validate person/relationship extraction.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CREDENTIALS_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
  path.join(process.cwd(), 'spec-server-dev-vertex-ai.json');
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || 'spec-server-dev';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL_ID = 'gemini-2.5-flash';

const OUTPUT_DIR = path.join(__dirname, '.schema-prompt-test-v2');

// ============================================================================
// Bible Schema Definitions
// ============================================================================

const ENTITY_SCHEMAS: Record<string, any> = {
  Person: {
    description: 'Biblical person (prophet, king, apostle, patriarch, etc.) with genealogical and biographical information',
    properties: {
      aliases: { type: 'array', description: 'Alternative names (e.g., Abram/Abraham)' },
      role: { type: 'string', description: 'Primary role (prophet, king, apostle, patriarch, judge)' },
      occupation: { type: 'string', description: 'Profession (shepherd, fisherman, tentmaker)' },
      tribe: { type: 'string', description: 'Tribe of Israel if applicable' },
      father: { type: 'string', description: "Father's name" },
      mother: { type: 'string', description: "Mother's name" },
      spouse: { type: 'string', description: "Spouse's name" },
      children: { type: 'array', description: 'Names of children' },
      age_at_death: { type: 'number', description: 'Age when they died' },
      birth_location: { type: 'string', description: 'Place of birth' },
      death_location: { type: 'string', description: 'Place of death' },
      significance: { type: 'string', description: 'Why this person is important (1-2 sentences)' },
    },
    required: ['name'],
  },
  Place: {
    description: 'Geographic location (city, region, mountain, river, sea, garden, etc.)',
    properties: {
      alternate_names: { type: 'array', description: 'Other names for this place' },
      place_type: { type: 'string', enum: ['city', 'region', 'country', 'mountain', 'river', 'sea', 'desert', 'garden', 'building', 'landmark'], description: 'Type of place' },
      region: { type: 'string', description: 'Parent region' },
      significance: { type: 'string', description: 'Biblical significance' },
    },
    required: ['name'],
  },
  Event: {
    description: 'Biblical event (creation, miracle, battle, covenant, etc.)',
    properties: {
      event_type: { type: 'string', enum: ['creation', 'miracle', 'battle', 'covenant', 'judgment', 'prophecy', 'journey', 'birth', 'death', 'other'], description: 'Type of event' },
      location: { type: 'string', description: 'Where it occurred' },
      participants: { type: 'array', description: 'People involved' },
      description: { type: 'string', description: 'What happened' },
      theological_significance: { type: 'string', description: 'Theological meaning or importance' },
    },
    required: ['name'],
  },
  Group: {
    description: 'Collection of people (tribe, nation, religious sect, family clan)',
    properties: {
      group_type: { type: 'string', enum: ['tribe', 'nation', 'family_clan', 'other'], description: 'Type of group' },
      region: { type: 'string', description: 'Geographic region' },
      founder: { type: 'string', description: 'Founder or patriarch' },
      description: { type: 'string', description: 'Description of the group' },
    },
    required: ['name'],
  },
};

const RELATIONSHIP_SCHEMAS: Record<string, any> = {
  PARENT_OF: {
    description: 'Parent-child biological relationship (X is parent of Y)',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [{ source: 'Adam', target: 'Cain', evidence: 'Adam fathered Cain' }],
  },
  CHILD_OF: {
    description: 'Child of parent (X is child of Y)',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [{ source: 'Cain', target: 'Adam', evidence: 'Cain, son of Adam' }],
  },
  MARRIED_TO: {
    description: 'Marriage relationship (X is married to Y)',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [{ source: 'Adam', target: 'Eve', evidence: 'Eve was Adam\'s wife' }],
  },
  SIBLING_OF: {
    description: 'Brother or sister relationship (X is sibling of Y)',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [{ source: 'Cain', target: 'Abel', evidence: 'Cain and Abel were brothers' }],
  },
  ANCESTOR_OF: {
    description: 'Genealogical ancestor - grandparent or more distant (X is ancestor of Y)',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [{ source: 'Adam', target: 'Noah', evidence: 'Adam was Noah\'s distant ancestor' }],
  },
  DESCENDANT_OF: {
    description: 'Genealogical descendant (X is descendant of Y)',
    source_types: ['Person'],
    target_types: ['Person'],
  },
  BORN_IN: {
    description: 'Person born in a place (X was born in Y)',
    source_types: ['Person'],
    target_types: ['Place'],
  },
  LIVED_IN: {
    description: 'Person lived/dwelt in a place (X lived in Y)',
    source_types: ['Person'],
    target_types: ['Place'],
  },
  TRAVELED_TO: {
    description: 'Person traveled to a place (X traveled to Y)',
    source_types: ['Person'],
    target_types: ['Place'],
  },
  LOCATED_IN: {
    description: 'Place located within another place (X is located in Y)',
    source_types: ['Place'],
    target_types: ['Place'],
  },
  PARTICIPATES_IN: {
    description: 'Person participated in an event (X participated in Y)',
    source_types: ['Person'],
    target_types: ['Event'],
  },
  OCCURRED_AT: {
    description: 'Event occurred at a place (X occurred at Y)',
    source_types: ['Event'],
    target_types: ['Place'],
  },
  MEMBER_OF: {
    description: 'Person is a member of a group (X is member of Y)',
    source_types: ['Person'],
    target_types: ['Group'],
  },
  FOUNDED: {
    description: 'Person founded a group or established a place (X founded Y)',
    source_types: ['Person'],
    target_types: ['Group', 'Place'],
  },
  KILLED: {
    description: 'Person killed another person (X killed Y)',
    source_types: ['Person'],
    target_types: ['Person'],
    examples: [{ source: 'Cain', target: 'Abel', evidence: 'Cain killed his brother Abel' }],
  },
};

// ============================================================================
// Prompt Builder
// ============================================================================

function buildEntityExtractionPrompt(documentText: string): string {
  const typesToExtract = Object.keys(ENTITY_SCHEMAS);
  
  let prompt = `You are an expert knowledge graph builder. Extract ALL entities from the document.

For EACH entity, provide these fields:
1. name: Clear, descriptive name (REQUIRED)
2. type: Entity type from the list below (REQUIRED)
3. description: Brief description of what this entity represents
4. properties: An object with type-specific attributes from the document

IMPORTANT RULES:
- Extract EVERY person mentioned by name, even if only mentioned once
- Extract ALL places mentioned (cities, lands, rivers, etc.)
- Extract significant events (creation, covenant, curse, blessing, etc.)
- For genealogies: capture ALL parent-child relationships in the properties
- Include aliases/alternate names when applicable

## Entity Types and Their Properties

Extract ONLY these types: ${typesToExtract.join(', ')}

`;

  // Add type descriptions WITH property schemas
  for (const [typeName, schema] of Object.entries(ENTITY_SCHEMAS)) {
    prompt += `### ${typeName}\n`;
    prompt += `${schema.description}\n`;
    
    if (schema.properties) {
      prompt += `**Properties:**\n`;
      for (const [propName, propDef] of Object.entries(schema.properties as Record<string, any>)) {
        prompt += `- \`${propName}\` (${propDef.type}): ${propDef.description}\n`;
      }
    }
    prompt += '\n';
  }
  
  prompt += `## Document

${documentText}

## Output Format

Return ONLY a valid JSON object:
\`\`\`json
{
  "entities": [
    {
      "name": "Adam",
      "type": "Person",
      "description": "The first man created by God",
      "properties": {
        "spouse": "Eve",
        "children": ["Cain", "Abel", "Seth"],
        "age_at_death": 930,
        "significance": "The first human being, ancestor of all humanity"
      }
    }
  ]
}
\`\`\`

Extract ALL entities now. Return ONLY the JSON object.`;

  return prompt;
}

function buildRelationshipExtractionPrompt(documentText: string, entities: any[]): string {
  let prompt = `You are an expert at finding connections in knowledge graphs. Identify ALL relationships between the entities listed below.

CRITICAL RULES:
- Create a relationship for EVERY family connection mentioned (parent-child, spouse, siblings)
- Use PARENT_OF for "X fathered Y" or "X was father of Y"
- Use CHILD_OF for "Y was born to X" or "Y, son/daughter of X"
- Use SIBLING_OF for brothers and sisters
- Use MARRIED_TO for spouses
- For genealogies: if A fathered B who fathered C, create: A->PARENT_OF->B AND B->PARENT_OF->C
- Extract EVERY relationship, even if it seems redundant

## Available Relationship Types

`;

  // Add relationship type definitions
  for (const [typeName, schema] of Object.entries(RELATIONSHIP_SCHEMAS)) {
    prompt += `### ${typeName}\n`;
    prompt += `${schema.description}\n`;
    
    const sourceTypes = schema.source_types || [];
    const targetTypes = schema.target_types || [];
    if (sourceTypes.length > 0 || targetTypes.length > 0) {
      prompt += `**Valid types:** ${sourceTypes.join(' or ')} → ${targetTypes.join(' or ')}\n`;
    }
    
    if (schema.examples?.length > 0) {
      prompt += `**Example:** ${schema.examples[0].source} → ${schema.examples[0].target}\n`;
    }
    prompt += '\n';
  }

  // Add entities list
  prompt += `## Entities (use these exact names)

`;
  const personEntities = entities.filter(e => e.type === 'Person');
  const otherEntities = entities.filter(e => e.type !== 'Person');
  
  prompt += `### People (${personEntities.length})\n`;
  for (const entity of personEntities) {
    const props = entity.properties || {};
    const extra = props.father ? ` - son/daughter of ${props.father}` : '';
    prompt += `- **${entity.name}**${extra}\n`;
  }
  
  prompt += `\n### Places, Events, Groups (${otherEntities.length})\n`;
  for (const entity of otherEntities) {
    prompt += `- **${entity.name}** (${entity.type})\n`;
  }

  prompt += `
## Document Context

${documentText.slice(0, 20000)}

## Output Format

Return ONLY a valid JSON object:
\`\`\`json
{
  "relationships": [
    {
      "source": "Adam",
      "target": "Cain",
      "type": "PARENT_OF",
      "description": "Adam fathered Cain"
    }
  ]
}
\`\`\`

Find ALL relationships. Return ONLY the JSON object.`;

  return prompt;
}

// ============================================================================
// API Functions
// ============================================================================

async function getAccessToken(): Promise<string> {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  
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
  const signInput = Buffer.from(JSON.stringify(header)).toString('base64url') + '.' +
                   Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const sign = createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = signInput + '.' + signature;
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function callGemini(accessToken: string, prompt: string): Promise<string> {
  const endpoint = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${MODEL_ID}:generateContent`;
  
  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
    },
  };
  
  console.log(`  Calling Gemini API (${MODEL_ID})...`);
  const startTime = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  console.log(`  ✓ API call completed in ${duration}s`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const inputFile = process.argv[2] || '/root/emergent/test-data/bible/books/01_Genesis.md';
  const maxChars = parseInt(process.argv[3] || '30000');
  
  console.log('='.repeat(80));
  console.log('Vertex AI Schema-in-Prompt Test (v2)');
  console.log('='.repeat(80));
  
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Load test document
  console.log(`\nLoading: ${inputFile}`);
  let docText = fs.readFileSync(inputFile, 'utf-8');
  
  // Truncate if needed
  if (docText.length > maxChars) {
    console.log(`  Truncating from ${docText.length} to ${maxChars} characters`);
    docText = docText.slice(0, maxChars);
  }
  console.log(`  Document size: ${docText.length} characters`);
  
  // Get access token
  console.log('\nAuthenticating...');
  const token = await getAccessToken();
  console.log('  ✓ Got access token');
  
  // Step 1: Entity Extraction
  console.log('\n' + '-'.repeat(80));
  console.log('Step 1: Entity Extraction');
  console.log('-'.repeat(80));
  
  const entityPrompt = buildEntityExtractionPrompt(docText);
  console.log(`  Prompt size: ${entityPrompt.length} characters`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'entity-prompt.txt'), entityPrompt);
  
  const entityResponse = await callGemini(token, entityPrompt);
  console.log(`  Response size: ${entityResponse.length} characters`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'entity-response-raw.txt'), entityResponse);
  
  // Parse entities
  let entities: any[] = [];
  try {
    const jsonMatch = entityResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      entities = parsed.entities || [];
    }
  } catch (e) {
    console.log(`  ⚠ Failed to parse JSON: ${e}`);
  }
  
  console.log(`  ✓ Extracted ${entities.length} entities`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'entities.json'), JSON.stringify(entities, null, 2));
  
  // Show entity summary
  const byType = new Map<string, number>();
  for (const e of entities) {
    byType.set(e.type, (byType.get(e.type) || 0) + 1);
  }
  console.log('\n  Entity type distribution:');
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    - ${type}: ${count}`);
  }
  
  // Show sample people with properties
  console.log('\n  Sample Person entities:');
  const people = entities.filter(e => e.type === 'Person').slice(0, 8);
  for (const p of people) {
    const props = p.properties || {};
    let details = [];
    if (props.father) details.push(`father: ${props.father}`);
    if (props.spouse) details.push(`spouse: ${props.spouse}`);
    if (props.children?.length) details.push(`children: ${props.children.join(', ')}`);
    if (props.age_at_death) details.push(`died at ${props.age_at_death}`);
    console.log(`    - ${p.name}: ${details.join(', ') || '(no properties)'}`);
  }
  
  // Step 2: Relationship Extraction
  console.log('\n' + '-'.repeat(80));
  console.log('Step 2: Relationship Extraction');
  console.log('-'.repeat(80));
  
  if (entities.length < 2) {
    console.log('  ⚠ Not enough entities for relationship extraction');
    return;
  }
  
  const relPrompt = buildRelationshipExtractionPrompt(docText, entities);
  console.log(`  Prompt size: ${relPrompt.length} characters`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'relationship-prompt.txt'), relPrompt);
  
  const relResponse = await callGemini(token, relPrompt);
  console.log(`  Response size: ${relResponse.length} characters`);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'relationship-response-raw.txt'), relResponse);
  
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
  fs.writeFileSync(path.join(OUTPUT_DIR, 'relationships.json'), JSON.stringify(relationships, null, 2));
  
  // Show relationship summary
  const relByType = new Map<string, number>();
  for (const r of relationships) {
    relByType.set(r.type, (relByType.get(r.type) || 0) + 1);
  }
  console.log('\n  Relationship type distribution:');
  for (const [type, count] of [...relByType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    - ${type}: ${count}`);
  }
  
  // Show family relationships
  console.log('\n  Sample family relationships:');
  const familyRels = relationships.filter(r => 
    ['PARENT_OF', 'CHILD_OF', 'MARRIED_TO', 'SIBLING_OF'].includes(r.type)
  ).slice(0, 15);
  for (const r of familyRels) {
    console.log(`    - ${r.source} --[${r.type}]--> ${r.target}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Document: ${path.basename(inputFile)} (${docText.length} chars)`);
  console.log(`  Entities: ${entities.length}`);
  console.log(`  Relationships: ${relationships.length}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  
  // Validate against schema
  console.log('\n  Schema Compliance:');
  const validTypes = new Set(Object.keys(ENTITY_SCHEMAS));
  const invalidEntities = entities.filter(e => !validTypes.has(e.type));
  console.log(`    Entity types: ${invalidEntities.length === 0 ? '✓ All valid' : `⚠ ${invalidEntities.length} invalid`}`);
  
  const validRelTypes = new Set(Object.keys(RELATIONSHIP_SCHEMAS));
  const invalidRels = relationships.filter(r => !validRelTypes.has(r.type));
  console.log(`    Relationship types: ${invalidRels.length === 0 ? '✓ All valid' : `⚠ ${invalidRels.length} invalid`}`);
  
  // Check for genealogy coverage
  const parentOfCount = relationships.filter(r => r.type === 'PARENT_OF').length;
  const personCount = entities.filter(e => e.type === 'Person').length;
  console.log(`\n  Genealogy coverage:`);
  console.log(`    People: ${personCount}`);
  console.log(`    PARENT_OF relationships: ${parentOfCount}`);
  console.log(`    Ratio: ${(parentOfCount / Math.max(personCount, 1)).toFixed(1)} relationships per person`);
}

main().catch(console.error);
