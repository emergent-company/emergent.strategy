#!/usr/bin/env npx tsx
/**
 * Test Extraction Job Script
 *
 * Runs extraction using the exact same input and schemas as the running
 * extraction jobs in the database. This helps isolate whether the issue
 * is with the LLM call itself or with the extraction worker.
 *
 * Usage:
 *   npx tsx scripts/test-extraction-job.ts
 *   npx tsx scripts/test-extraction-job.ts --type Person
 *   npx tsx scripts/test-extraction-job.ts --type Book
 *   npx tsx scripts/test-extraction-job.ts --all-types
 *
 * Environment:
 *   Uses the same Vertex AI credentials as the server.
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration (same as server)
const CONFIG = {
  projectId: process.env.GCP_PROJECT_ID || 'spec-server-dev',
  location: process.env.VERTEX_AI_LOCATION || 'europe-central2',
  model: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite',
  timeoutMs: 120_000, // 2 minutes (same as server)
};

// Document content from: 63_II_John.md (document_id: 32d3e85b-c9d5-4d89-8772-49a109b9a08c)
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

// Entity types from the extraction job config
const ENTITY_TYPES = [
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

// Exact schemas from the Bible Knowledge Graph template pack (object_type_schemas)
const OBJECT_TYPE_SCHEMAS: Record<string, any> = {
  Book: {
    type: 'object',
    required: ['name', 'testament'],
    properties: {
      name: {
        type: 'string',
        description:
          'Full book name (e.g., "Genesis", "Matthew", "1 Corinthians")',
      },
      author: {
        type: 'string',
        description:
          'Traditional or attributed author name (e.g., "Moses", "Paul") - will be linked to Person entity',
      },
      category: {
        enum: [
          'Law',
          'History',
          'Wisdom',
          'Major Prophets',
          'Minor Prophets',
          'Gospels',
          'Acts',
          'Pauline Epistles',
          'General Epistles',
          'Apocalyptic',
        ],
        type: 'string',
        description: 'Literary category',
      },
      testament: {
        enum: ['Old Testament', 'New Testament'],
        type: 'string',
        description: 'Testament classification',
      },
      chapter_count: {
        type: 'integer',
        description: 'Total number of chapters in this book',
      },
    },
  },
  Angel: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Name of the angel or type of spiritual being',
      },
      rank: {
        type: 'string',
        description:
          'Rank or classification (e.g., archangel, cherubim, seraphim)',
      },
      mission: {
        type: 'string',
        description: 'Mission or purpose of appearance',
      },
      appearances: {
        type: 'array',
        items: { type: 'string' },
        description: 'When/where the angel appeared',
      },
    },
  },
  Event: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description:
          'Event name or description (e.g., "Crossing of the Red Sea", "Crucifixion")',
      },
      type: {
        enum: [
          'miracle',
          'battle',
          'covenant',
          'judgment',
          'prophecy',
          'teaching',
          'journey',
          'birth',
          'death',
          'resurrection',
          'other',
        ],
        type: 'string',
        description: 'Category of event',
      },
      location: {
        type: 'string',
        description:
          'Where the event happened - place name (e.g., "Red Sea") - will be linked to Place entity',
      },
      description: {
        type: 'string',
        description: 'Brief description of what happened',
      },
      date_description: {
        type: 'string',
        description:
          'Textual description of when it occurred (e.g., "during the Exodus", "after three days")',
      },
      source_reference: {
        type: 'string',
        description:
          'Primary biblical reference (e.g., "Exodus 14", "Matthew 27")',
      },
      theological_significance: {
        type: 'string',
        description: 'Why this event matters theologically',
      },
    },
  },
  Group: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description:
          'Name of the group (e.g., "Israelites", "Pharisees", "Tribe of Judah")',
      },
      type: {
        enum: [
          'tribe',
          'nation',
          'religious sect',
          'military',
          'family clan',
          'political party',
          'other',
        ],
        type: 'string',
        description: 'Type of group',
      },
      leader: {
        type: 'string',
        description:
          'Leader or head - person name (e.g., "David") - will be linked to Person entity',
      },
      region: {
        type: 'string',
        description:
          'Geographic region - place name (e.g., "Judea") - will be linked to Place entity',
      },
      founded_by: {
        type: 'string',
        description:
          'Founder - person name (e.g., "Judah") - will be linked to Person entity',
      },
      description: {
        type: 'string',
        description:
          'Brief description of the group and its purpose or beliefs',
      },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Biblical references where mentioned',
      },
    },
  },
  Place: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Primary location name (e.g., "Jerusalem", "Bethlehem")',
      },
      type: {
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
        type: 'string',
        description: 'Type of location',
      },
      region: {
        type: 'string',
        description:
          'Parent region name (e.g., "Judea", "Galilee") - will be linked to Place entity',
      },
      country: {
        type: 'string',
        description:
          'Country or kingdom name (e.g., "Israel", "Roman Empire") - will be linked to Place entity',
      },
      significance: {
        type: 'string',
        description:
          'Why this location is important biblically (1-2 sentences)',
      },
      alternate_names: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Other names for this location (e.g., ["Zion", "City of David"] for Jerusalem)',
      },
      modern_location: {
        type: 'string',
        description: 'Modern day location or country',
      },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Biblical references where mentioned (e.g., ["Ruth 1", "Matthew 2"])',
      },
    },
  },
  Quote: {
    type: 'object',
    required: ['text'],
    properties: {
      text: {
        type: 'string',
        description: 'The quoted text or saying',
      },
      type: {
        enum: [
          'teaching',
          'commandment',
          'prophecy',
          'prayer',
          'dialogue',
          'proclamation',
        ],
        type: 'string',
        description: 'Type of quote',
      },
      context: {
        type: 'string',
        description: 'Situational context (when, where, why it was said)',
      },
      speaker: {
        type: 'string',
        description:
          'Who spoke these words - person name (e.g., "Jesus", "God") - will be linked to Person entity',
      },
      audience: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Who the quote was addressed to - names (e.g., ["Nicodemus"]) - will be linked to Person/Group entities',
      },
      source_reference: {
        type: 'string',
        description: 'Biblical reference (e.g., "John 3:16", "Genesis 1:3")',
      },
    },
  },
  Object: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Name of the object',
      },
      type: {
        type: 'string',
        description:
          'Type of object (e.g., artifact, building, weapon, vessel)',
      },
      owner: {
        type: 'string',
        description:
          'Who owns or possesses the object - person/group name - will be linked to Person/Group entity',
      },
      location: {
        type: 'string',
        description:
          'Where the object is located - place name - will be linked to Place entity',
      },
      description: {
        type: 'string',
        description: 'Physical description or purpose',
      },
    },
  },
  Person: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Full name of the person',
      },
      role: {
        type: 'string',
        description: 'Position, title, or role (e.g., prophet, king, apostle)',
      },
      tribe: {
        type: 'string',
        description:
          'Israelite tribe name (e.g., "Tribe of Judah") - will be linked to Group entity',
      },
      father: {
        type: 'string',
        description:
          'Father\'s name (e.g., "Abraham") - will be linked to Person entity',
      },
      mother: {
        type: 'string',
        description:
          'Mother\'s name (e.g., "Sarah") - will be linked to Person entity',
      },
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Alternative names (e.g., Saul/Paul, Simon/Peter)',
      },
      occupation: {
        type: 'string',
        description:
          'Profession or occupation (e.g., shepherd, fisherman, tax collector)',
      },
      significance: {
        type: 'string',
        description: 'Why this person is important biblically (1-2 sentences)',
      },
      birth_location: {
        type: 'string',
        description:
          'Place of birth name (e.g., "Bethlehem") - will be linked to Place entity',
      },
      death_location: {
        type: 'string',
        description:
          'Place of death name (e.g., "Jerusalem") - will be linked to Place entity',
      },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Biblical references where mentioned (e.g., ["Genesis 12", "Genesis 22"])',
      },
    },
  },
  Miracle: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Name or description of the miracle',
      },
      type: {
        type: 'string',
        description: 'Type of miracle (e.g., healing, nature, resurrection)',
      },
      location: {
        type: 'string',
        description:
          'Where the miracle occurred - place name - will be linked to Place entity',
      },
    },
  },
  Covenant: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'Name of the covenant',
      },
      sign: {
        type: 'string',
        description: 'Physical sign or symbol of the covenant',
      },
      terms: {
        type: 'string',
        description: 'Terms or conditions of the covenant',
      },
    },
  },
  Prophecy: {
    type: 'object',
    required: ['text'],
    properties: {
      text: {
        type: 'string',
        description: 'The prophetic text or message',
      },
      prophet: {
        type: 'string',
        description: 'Who delivered the prophecy',
      },
      subject: {
        type: 'string',
        description: 'Subject or topic of the prophecy',
      },
      fulfillment_reference: {
        type: 'string',
        description: 'Reference to where/how the prophecy was fulfilled',
      },
    },
  },
};

// Extraction prompts from the template pack
const EXTRACTION_PROMPTS: Record<string, { system: string; user: string }> = {
  Book: {
    system:
      'Extract the Book entity for this document. A Book is one of the 66 books of the Bible.',
    user: `Extract the Book entity. Return:
- name: Exact book name from the document title
- testament: "Old Testament" or "New Testament"
- category: Literary category
- author: Author's name (will be linked to Person entity)
- chapter_count: Total chapters if determinable

Example:
{
  "name": "Genesis",
  "testament": "Old Testament",
  "category": "Law",
  "author": "Moses",
  "chapter_count": 50
}

Extract ONE Book entity per document based on the document title/heading.`,
  },
  Person: {
    system:
      'Extract all people mentioned in the biblical text with their roles, occupations, tribal affiliations, and associated locations. For references to other entities (places, tribes, family), use the ENTITY NAME which will be resolved to canonical_id by the system.',
    user: `Identify each person in the text. Return:
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

Example:
{
  "name": "Isaac",
  "father": "Abraham",
  "mother": "Sarah",
  "birth_location": "Canaan",
  "role": "patriarch",
  "significance": "Son of Abraham, father of Jacob and Esau, central figure in covenant",
  "source_references": ["Genesis 21", "Genesis 22", "Genesis 26"]
}

IMPORTANT: Use entity NAMES (not IDs) for references. The system will automatically resolve names to canonical entity IDs.`,
  },
  Covenant: {
    system:
      'Extract covenants, agreements, or treaties mentioned in the text. Parties should be represented as HAS_PARTY relationships, not embedded in properties.',
    user: 'Identify covenants or agreements. Return the name, terms, and any sign or symbol associated with it. Do NOT include a parties array - parties will be linked via explicit HAS_PARTY relationships.',
  },
  // Add other prompts as needed for testing
};

/**
 * Sanitize schema to remove internal fields (same as server)
 */
function sanitizeSchema(schema: any): any {
  if (typeof schema !== 'object' || schema === null) return schema;
  if (Array.isArray(schema)) return schema.map((i) => sanitizeSchema(i));

  const newSchema: any = {};
  const allowedKeys = [
    'type',
    'description',
    'enum',
    'items',
    'properties',
    'required',
  ];

  for (const key in schema) {
    if (key.startsWith('_')) continue;
    if (['title', 'default', 'format'].includes(key)) continue;

    if (allowedKeys.includes(key)) {
      newSchema[key] = sanitizeSchema(schema[key]);
    }
  }
  return newSchema;
}

/**
 * Build the extraction prompt (same logic as server)
 */
function buildExtractionPrompt(
  typeName: string,
  documentContent: string,
  objectSchema: any
): string {
  const prompts = EXTRACTION_PROMPTS[typeName];
  const userPrompt =
    prompts?.user || `Extract ${typeName} entities from the document.`;

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
      for (const [propName, propDef] of Object.entries(
        objectSchema.properties as Record<string, any>
      )) {
        if (propName.startsWith('_')) continue;

        const required = objectSchema.required?.includes(propName)
          ? ' (required)'
          : '';
        const description = propDef.description || '';
        const typeInfo = propDef.type ? ` [${propDef.type}]` : '';
        const enumInfo = propDef.enum
          ? ` (options: ${propDef.enum.join(', ')})`
          : '';
        prompt += `  - ${propName}${required}${typeInfo}${enumInfo}: ${description}\n`;
      }
      prompt += '\n';
    }
  }

  prompt += `${userPrompt}

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

/**
 * Helper to wrap a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${operationName} timed out after ${timeoutMs}ms. The LLM API may be unresponsive.`
        )
      );
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Run extraction for a single type (same as server logic)
 */
async function runExtractionForType(
  typeName: string,
  documentContent: string
): Promise<{
  success: boolean;
  entities: any[];
  error?: string;
  durationMs: number;
}> {
  const startTime = Date.now();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Extracting: ${typeName}`);
  console.log(`${'─'.repeat(60)}`);

  const objectSchema = OBJECT_TYPE_SCHEMAS[typeName];
  if (!objectSchema) {
    return {
      success: false,
      entities: [],
      error: `Unknown type: ${typeName}`,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Initialize ChatVertexAI (same as server)
    const model = new ChatVertexAI({
      model: CONFIG.model,
      authOptions: {
        projectId: CONFIG.projectId,
      },
      location: CONFIG.location,
      temperature: 1.0,
      maxOutputTokens: 65535,
    });

    // Sanitize schema (same as server)
    const sanitizedSchema = sanitizeSchema(objectSchema);

    // Create array schema for extraction (same as server)
    const jsonSchema = {
      type: 'object',
      properties: {
        entities: {
          type: 'array',
          items: sanitizedSchema,
        },
      },
      required: ['entities'],
    };

    // Create structured output model (same as server)
    const structuredModel = model.withStructuredOutput(jsonSchema, {
      name: `extract_${typeName.toLowerCase()}`,
    });

    // Build prompt (same as server)
    const prompt = buildExtractionPrompt(
      typeName,
      documentContent,
      objectSchema
    );

    console.log(`Prompt length: ${prompt.length} chars`);
    console.log(`Sending request to Vertex AI...`);

    const callStartTime = Date.now();

    // Make the LLM call with timeout (same as server)
    const result: any = await withTimeout(
      structuredModel.invoke(prompt, {
        tags: ['test-extraction-job', typeName],
        metadata: {
          type: typeName,
          test: true,
        },
      }),
      CONFIG.timeoutMs,
      `LLM extraction for ${typeName}`
    );

    const callDuration = Date.now() - callStartTime;
    console.log(`LLM call completed in ${callDuration}ms`);

    const entities = result.entities || [];
    console.log(`Extracted ${entities.length} ${typeName} entities`);

    if (entities.length > 0) {
      for (const entity of entities) {
        const name =
          entity.name || entity.text || JSON.stringify(entity).substring(0, 50);
        console.log(`  • ${name}`);
      }
    }

    return {
      success: true,
      entities,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Extraction failed: ${errorMessage}`);

    // Provide helpful error context (same as server)
    if (errorMessage.includes('timed out')) {
      console.error(
        '   The LLM API is not responding. Check if Vertex AI is accessible.'
      );
    } else if (
      errorMessage.includes('500') ||
      errorMessage.includes('Internal')
    ) {
      console.error(
        '   Google API returned an internal error. This may be a transient issue.'
      );
    } else if (errorMessage.includes('Invalid JSON payload')) {
      console.error(
        '   Schema validation error - the schema may contain unsupported features.'
      );
    }

    return {
      success: false,
      entities: [],
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Extraction Job Test (Same Input as Running Jobs)       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  // Set credentials
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    const defaultPath = path.resolve(
      __dirname,
      '..',
      'spec-server-dev-vertex-ai.json'
    );
    process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultPath;
    console.log(`\nCredentials: ${defaultPath}`);
  } else {
    console.log(`\nCredentials: ${credPath}`);
  }

  console.log(`Project: ${CONFIG.projectId}`);
  console.log(`Location: ${CONFIG.location}`);
  console.log(`Model: ${CONFIG.model}`);
  console.log(`Timeout: ${CONFIG.timeoutMs}ms`);

  // Parse command line arguments
  const args = process.argv.slice(2);
  let typesToTest: string[] = ['Person']; // Default to Person (simplest type)

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      typesToTest = [args[i + 1]];
      i++;
    } else if (args[i] === '--all-types') {
      typesToTest = ENTITY_TYPES;
    } else if (args[i] === '--help') {
      console.log(`
Usage: npx tsx scripts/test-extraction-job.ts [options]

Options:
  --type <type>   Extract only this type (${ENTITY_TYPES.join(', ')})
  --all-types     Extract all 11 entity types (warning: slow!)
  --help          Show this help message

Examples:
  npx tsx scripts/test-extraction-job.ts                  # Test Person extraction
  npx tsx scripts/test-extraction-job.ts --type Book      # Test Book extraction
  npx tsx scripts/test-extraction-job.ts --type Covenant  # Test Covenant extraction
  npx tsx scripts/test-extraction-job.ts --all-types      # Test all types

Document: II John (63_II_John.md) - ${DOCUMENT_CONTENT.length} chars
This is the same document used by the running extraction jobs.
`);
      process.exit(0);
    }
  }

  console.log(`\nDocument: II John (${DOCUMENT_CONTENT.length} chars)`);
  console.log(`Types to extract: ${typesToTest.join(', ')}`);

  const results: {
    type: string;
    success: boolean;
    entities: number;
    durationMs: number;
    error?: string;
  }[] = [];

  for (const typeName of typesToTest) {
    const result = await runExtractionForType(typeName, DOCUMENT_CONTENT);
    results.push({
      type: typeName,
      success: result.success,
      entities: result.entities.length,
      durationMs: result.durationMs,
      error: result.error,
    });
  }

  // Print summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const allSuccess = results.every((r) => r.success);
  const totalEntities = results.reduce((sum, r) => sum + r.entities, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const errorInfo = result.error
      ? ` (${result.error.substring(0, 40)}...)`
      : '';
    console.log(
      `${status} ${result.type.padEnd(12)} ${result.entities} entities in ${
        result.durationMs
      }ms${errorInfo}`
    );
  }

  console.log('─'.repeat(60));
  console.log(`Total: ${totalEntities} entities in ${totalDuration}ms`);
  console.log(`Status: ${allSuccess ? '✅ ALL PASSED' : '❌ SOME FAILED'}`);

  process.exit(allSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
