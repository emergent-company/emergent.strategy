#!/usr/bin/env npx tsx
/**
 * Vertex AI Batch Extraction Test - Bible Schema
 *
 * Tests batch prediction API for extracting entities and relationships
 * from the complete Bible using the project's Bible knowledge graph schema.
 *
 * Features:
 * - Async/background mode with job state persistence
 * - Status checking for running jobs
 * - Bible-specific entity types (Person, Place, Event, Book, Quote, Group, etc.)
 * - Bible-specific relationship types
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts [options] [document]
 *
 * Options:
 *   --help          Show help
 *   --dry-run       Show what would be done without executing
 *   --check-bucket  Check if GCS bucket is accessible
 *   --status        Check status of running/completed jobs
 *   --start         Start extraction (default if no status flag)
 *   --results       Download and show results for completed jobs
 *   --job-id=ID     Specify job ID for status/results (uses latest if not specified)
 */

import * as fs from 'fs';
import * as path from 'path';

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

const DEFAULT_DOCUMENT = path.join(
  process.cwd(),
  'test-data/bible/complete-bible.md'
);
const STATE_FILE = path.join(
  process.cwd(),
  'scripts/extraction_tests/.bible-extraction-state.json'
);
const RESULTS_FILE = path.join(process.cwd(), 'bible-extraction-results.json');

// ============================================================================
// Bible Schema Definitions
// ============================================================================

const ENTITY_TYPES = {
  Person: {
    description:
      'Biblical person (prophet, king, apostle, etc.) with genealogical and biographical information',
    properties: {
      name: { type: 'string', description: 'Full name (required)' },
      aliases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Alternative names',
      },
      role: {
        type: 'string',
        description: 'Position/title (prophet, king, apostle)',
      },
      occupation: {
        type: 'string',
        description: 'Profession (shepherd, fisherman)',
      },
      tribe: { type: 'string', description: 'Tribe of Israel if applicable' },
      father: { type: 'string', description: "Father's name" },
      mother: { type: 'string', description: "Mother's name" },
      birth_location: { type: 'string', description: 'Place of birth' },
      death_location: { type: 'string', description: 'Place of death' },
      significance: {
        type: 'string',
        description: 'Why important (1-2 sentences)',
      },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Biblical references',
      },
    },
    required: ['name'],
  },
  Place: {
    description:
      'Geographic location (city, region, mountain, river, sea, etc.)',
    properties: {
      name: { type: 'string', description: 'Primary name (required)' },
      alternate_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Other names',
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
      country: { type: 'string', description: 'Country/kingdom' },
      modern_location: { type: 'string', description: 'Modern location' },
      significance: { type: 'string', description: 'Biblical significance' },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Biblical references',
      },
    },
    required: ['name'],
  },
  Event: {
    description:
      'Biblical event (miracle, battle, covenant, prophecy fulfillment, etc.)',
    properties: {
      name: { type: 'string', description: 'Event name (required)' },
      event_type: {
        type: 'string',
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
        description: 'Type of event',
      },
      date_description: {
        type: 'string',
        description: 'When it occurred (textual)',
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
        description: 'Theological meaning',
      },
      source_reference: { type: 'string', description: 'Biblical reference' },
    },
    required: ['name'],
  },
  Group: {
    description:
      'Collection of people (tribe, nation, religious sect, family clan, etc.)',
    properties: {
      name: { type: 'string', description: 'Group name (required)' },
      group_type: {
        type: 'string',
        enum: [
          'tribe',
          'nation',
          'religious_sect',
          'military',
          'family_clan',
          'political_party',
          'other',
        ],
        description: 'Type of group',
      },
      region: { type: 'string', description: 'Geographic region' },
      leader: { type: 'string', description: 'Leader name' },
      founded_by: { type: 'string', description: 'Founder name' },
      description: { type: 'string', description: 'Description' },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Biblical references',
      },
    },
    required: ['name'],
  },
  Quote: {
    description: 'Significant spoken words or teachings',
    properties: {
      text: { type: 'string', description: 'Quoted text (required)' },
      speaker: { type: 'string', description: 'Who spoke it' },
      audience: {
        type: 'array',
        items: { type: 'string' },
        description: 'Who was addressed',
      },
      context: { type: 'string', description: 'Situational context' },
      source_reference: {
        type: 'string',
        description: 'Biblical reference (e.g., John 3:16)',
      },
      quote_type: {
        type: 'string',
        enum: [
          'teaching',
          'commandment',
          'prophecy',
          'prayer',
          'dialogue',
          'proclamation',
        ],
        description: 'Type of quote',
      },
    },
    required: ['text'],
  },
  Object: {
    description:
      'Significant biblical object (Ark of the Covenant, tablets, etc.)',
    properties: {
      name: { type: 'string', description: 'Object name (required)' },
      object_type: {
        type: 'string',
        enum: ['artifact', 'building', 'weapon', 'vessel', 'clothing', 'other'],
        description: 'Type of object',
      },
      description: { type: 'string', description: 'Description' },
      owner: { type: 'string', description: 'Owner name' },
      location: { type: 'string', description: 'Where located' },
      significance: { type: 'string', description: 'Biblical significance' },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Biblical references',
      },
    },
    required: ['name'],
  },
  Covenant: {
    description: 'Divine covenant or agreement',
    properties: {
      name: { type: 'string', description: 'Covenant name (required)' },
      parties: {
        type: 'array',
        items: { type: 'string' },
        description: 'Parties to the covenant',
      },
      terms: { type: 'string', description: 'Terms/conditions' },
      sign: { type: 'string', description: 'Physical sign/symbol' },
      promises: {
        type: 'array',
        items: { type: 'string' },
        description: 'Promises made',
      },
      source_reference: { type: 'string', description: 'Biblical reference' },
    },
    required: ['name'],
  },
  Prophecy: {
    description: 'Prophetic statement or prediction',
    properties: {
      text: { type: 'string', description: 'Prophecy text (required)' },
      prophet: { type: 'string', description: 'Who delivered it' },
      subject: { type: 'string', description: 'What/who it concerns' },
      fulfilled: {
        type: 'boolean',
        description: 'Whether fulfilled in Scripture',
      },
      fulfillment_reference: {
        type: 'string',
        description: 'Where fulfilled',
      },
      source_reference: { type: 'string', description: 'Where prophesied' },
    },
    required: ['text'],
  },
  Miracle: {
    description: 'Supernatural event or sign',
    properties: {
      name: { type: 'string', description: 'Miracle name (required)' },
      miracle_type: {
        type: 'string',
        enum: [
          'healing',
          'nature',
          'resurrection',
          'provision',
          'judgment',
          'other',
        ],
        description: 'Type of miracle',
      },
      performer: { type: 'string', description: 'Who performed it' },
      beneficiary: { type: 'string', description: 'Who benefited' },
      location: { type: 'string', description: 'Where it occurred' },
      description: { type: 'string', description: 'What happened' },
      source_reference: { type: 'string', description: 'Biblical reference' },
    },
    required: ['name'],
  },
  Angel: {
    description: 'Angelic being',
    properties: {
      name: { type: 'string', description: 'Angel name (required)' },
      rank: {
        type: 'string',
        enum: ['archangel', 'cherubim', 'seraphim', 'angel', 'other'],
        description: 'Angelic rank',
      },
      mission: { type: 'string', description: 'Primary mission/role' },
      appearances: {
        type: 'array',
        items: { type: 'string' },
        description: 'Notable appearances',
      },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'Biblical references',
      },
    },
    required: ['name'],
  },
};

const RELATIONSHIP_TYPES = [
  // Family relationships
  'PARENT_OF',
  'CHILD_OF',
  'MARRIED_TO',
  'SIBLING_OF',
  'DESCENDED_FROM',
  'ANCESTOR_OF',

  // Geographic relationships
  'BORN_IN',
  'DIED_IN',
  'LIVED_IN',
  'TRAVELED_TO',
  'LOCATED_IN',
  'REGION_OF',

  // Event relationships
  'PARTICIPATES_IN',
  'WITNESSES',
  'OCCURS_IN',
  'CAUSED_BY',
  'RESULTS_IN',

  // Group relationships
  'MEMBER_OF',
  'LEADER_OF',
  'FOUNDED_BY',
  'BELONGS_TO',

  // Action relationships
  'PERFORMS_MIRACLE',
  'MAKES_COVENANT',
  'FULFILLS',
  'PROPHESIED_BY',
  'SPEAKS',
  'TEACHES',
  'HEALS',
  'JUDGES',
  'BLESSES',
  'CURSES',

  // Object relationships
  'OWNS',
  'CREATED',
  'DESTROYED',
  'CONTAINS',

  // Reference relationships
  'APPEARS_IN',
  'MENTIONED_IN',
  'FIRST_MENTIONED_IN',
  'ADDRESSED_TO',

  // Spiritual relationships
  'WORSHIPS',
  'SERVES',
  'OPPOSES',
  'TEMPTS',
  'DELIVERS',
  'SAVES',
];

// ============================================================================
// Utility Functions
// ============================================================================

interface Credentials {
  client_email: string;
  private_key: string;
  project_id: string;
}

let credentials: Credentials;

function loadCredentials(): Credentials {
  if (!credentials) {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      console.error(`Credentials file not found: ${CREDENTIALS_FILE}`);
      process.exit(1);
    }
    credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  }
  return credentials;
}

async function getAccessToken(): Promise<string> {
  const creds = loadCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.client_email,
    sub: creds.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };

  const { createSign } = await import('crypto');
  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(creds.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// ============================================================================
// GCS Operations
// ============================================================================

async function checkBucket(token: string): Promise<boolean> {
  const url = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok;
}

async function uploadToGCS(
  token: string,
  objectName: string,
  content: string
): Promise<string> {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${encodeURIComponent(
    objectName
  )}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: content,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status} ${error}`);
  }

  return `gs://${GCS_BUCKET}/${objectName}`;
}

async function downloadFromGCS(
  token: string,
  objectName: string
): Promise<string> {
  const url = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o/${encodeURIComponent(
    objectName
  )}?alt=media`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  return response.text();
}

async function listGCSObjects(
  token: string,
  prefix: string
): Promise<string[]> {
  const url = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o?prefix=${encodeURIComponent(
    prefix
  )}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await response.json()) as { items?: { name: string }[] };
  return (data.items || []).map((item) => item.name);
}

// ============================================================================
// Vertex AI Batch Operations
// ============================================================================

interface BatchJobResponse {
  name: string;
  state: string;
  outputInfo?: {
    gcsOutputDirectory: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

async function submitBatchJob(
  token: string,
  displayName: string,
  inputUri: string,
  outputPrefix: string,
  systemPrompt: string,
  responseSchema: object
): Promise<string> {
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/batchPredictionJobs`;

  const requestBody = {
    displayName,
    model: `publishers/google/models/${MODEL_ID}`,
    inputConfig: {
      instancesFormat: 'jsonl',
      gcsSource: { uris: [inputUri] },
    },
    outputConfig: {
      predictionsFormat: 'jsonl',
      gcsDestination: { outputUriPrefix: outputPrefix },
    },
    instanceConfig: {
      includedFields: ['request'],
    },
    modelParameters: {
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema,
      },
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Job submission failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { name: string };
  return data.name; // Full job resource name
}

async function getJobStatus(
  token: string,
  jobName: string
): Promise<BatchJobResponse> {
  const url = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/${jobName}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json() as Promise<BatchJobResponse>;
}

// ============================================================================
// State Management
// ============================================================================

interface ExtractionState {
  documentPath: string;
  documentSize: number;
  startedAt: string;
  entityJob?: {
    name: string;
    inputUri: string;
    outputPrefix: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    outputDir?: string;
  };
  relationshipJob?: {
    name: string;
    inputUri: string;
    outputPrefix: string;
    status: string;
    startedAt: string;
    completedAt?: string;
    outputDir?: string;
  };
  results?: {
    entitiesFile?: string;
    relationshipsFile?: string;
    completedAt?: string;
  };
}

function loadState(): ExtractionState | null {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return null;
}

function saveState(state: ExtractionState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearState(): void {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

// ============================================================================
// Schema Generation for Vertex AI
// ============================================================================

function generateEntitySchema(): object {
  const entityProperties: Record<string, object> = {};

  for (const [typeName, typeDef] of Object.entries(ENTITY_TYPES)) {
    const props: Record<string, object> = {
      type: {
        type: 'string',
        enum: [typeName],
        description: `Entity type: ${typeName}`,
      },
    };

    for (const [propName, propDef] of Object.entries(typeDef.properties)) {
      props[propName] = propDef;
    }

    entityProperties[typeName] = {
      type: 'object',
      properties: props,
      required: ['type', ...typeDef.required],
    };
  }

  return {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: Object.keys(ENTITY_TYPES),
              description: 'Entity type',
            },
            name: { type: 'string', description: 'Entity name' },
            properties: {
              type: 'object',
              description: 'Type-specific properties',
            },
          },
          required: ['type', 'name'],
        },
        description: 'Extracted entities',
      },
    },
    required: ['entities'],
  };
}

function generateRelationshipSchema(): object {
  return {
    type: 'object',
    properties: {
      relationships: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Source entity name' },
            source_type: {
              type: 'string',
              enum: Object.keys(ENTITY_TYPES),
              description: 'Source entity type',
            },
            target: { type: 'string', description: 'Target entity name' },
            target_type: {
              type: 'string',
              enum: Object.keys(ENTITY_TYPES),
              description: 'Target entity type',
            },
            type: {
              type: 'string',
              enum: RELATIONSHIP_TYPES,
              description: 'Relationship type',
            },
            description: {
              type: 'string',
              description: 'Brief description of the relationship',
            },
            source_reference: {
              type: 'string',
              description: 'Biblical reference',
            },
          },
          required: ['source', 'target', 'type'],
        },
        description: 'Extracted relationships',
      },
    },
    required: ['relationships'],
  };
}

// ============================================================================
// Main Operations
// ============================================================================

async function startExtraction(documentPath: string): Promise<void> {
  console.log(
    '================================================================================'
  );
  console.log('Bible Knowledge Graph Extraction - Starting');
  console.log(
    '================================================================================\n'
  );

  const token = await getAccessToken();

  // Check bucket
  console.log('Checking GCS bucket...');
  if (!(await checkBucket(token))) {
    console.error(`✗ Bucket gs://${GCS_BUCKET} not accessible`);
    process.exit(1);
  }
  console.log(`✓ Bucket gs://${GCS_BUCKET} accessible\n`);

  // Load document
  if (!fs.existsSync(documentPath)) {
    console.error(`Document not found: ${documentPath}`);
    process.exit(1);
  }

  const documentContent = fs.readFileSync(documentPath, 'utf-8');
  const wordCount = documentContent.split(/\s+/).length;
  const charCount = documentContent.length;
  const estimatedTokens = Math.ceil(charCount / 3.5);

  console.log(`Document: ${documentPath}`);
  console.log(`  Characters: ${charCount.toLocaleString()}`);
  console.log(`  Words: ${wordCount.toLocaleString()}`);
  console.log(`  Estimated tokens: ${estimatedTokens.toLocaleString()}\n`);

  // Initialize state
  const timestamp = Date.now();
  const state: ExtractionState = {
    documentPath,
    documentSize: charCount,
    startedAt: new Date().toISOString(),
  };

  // Prepare entity extraction
  console.log(
    '================================================================================'
  );
  console.log('Step 1: Entity Extraction');
  console.log(
    '================================================================================'
  );

  const entitySystemPrompt = `You are an expert biblical scholar and knowledge graph extraction specialist.
Extract all entities from the provided biblical text according to the schema.

Entity types to extract:
${Object.entries(ENTITY_TYPES)
  .map(([name, def]) => `- ${name}: ${def.description}`)
  .join('\n')}

Guidelines:
- Extract ALL significant entities, not just the main characters
- Include both major and minor biblical figures
- Extract places at all scales (cities, regions, countries, landmarks)
- Extract events including miracles, battles, covenants, and key moments
- Include significant quotes, especially teachings and prophecies
- Be thorough but accurate - only extract what is explicitly mentioned
- Use standardized names (e.g., "Abraham" not "Abram" unless specifically discussing that period)
- Include source_references where possible`;

  const entityInputContent = JSON.stringify({
    request: {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Extract all entities from this biblical text:\n\n${documentContent}`,
            },
          ],
        },
      ],
    },
  });

  const entityInputPath = `input/bible-entities-${timestamp}.jsonl`;
  console.log(`  Uploading input to gs://${GCS_BUCKET}/${entityInputPath}...`);
  const entityInputUri = await uploadToGCS(
    token,
    entityInputPath,
    entityInputContent
  );
  console.log(`  ✓ Uploaded`);

  const entityOutputPrefix = `gs://${GCS_BUCKET}/output/bible-entities-${timestamp}`;
  console.log(`  Submitting batch job...`);

  const entityJobName = await submitBatchJob(
    token,
    `bible-entities-${timestamp}`,
    entityInputUri,
    entityOutputPrefix,
    entitySystemPrompt,
    generateEntitySchema()
  );

  console.log(`  ✓ Job submitted: ${entityJobName}`);
  state.entityJob = {
    name: entityJobName,
    inputUri: entityInputUri,
    outputPrefix: entityOutputPrefix,
    status: 'JOB_STATE_PENDING',
    startedAt: new Date().toISOString(),
  };

  // Prepare relationship extraction
  console.log(
    '\n================================================================================'
  );
  console.log('Step 2: Relationship Extraction');
  console.log(
    '================================================================================'
  );

  const relationshipSystemPrompt = `You are an expert biblical scholar and knowledge graph extraction specialist.
Extract all relationships between entities from the provided biblical text.

Relationship types to extract:
${RELATIONSHIP_TYPES.map((t) => `- ${t}`).join('\n')}

Guidelines:
- Extract explicit relationships stated in the text
- Include family relationships (parent/child, marriage, siblings)
- Include geographic relationships (born in, died in, traveled to)
- Include event participation (witnesses, performs, participates in)
- Include group memberships and leadership
- Include spiritual relationships (worships, serves, blesses, curses)
- Be thorough - a single verse may contain multiple relationships
- Include source_reference for each relationship when possible`;

  const relationshipInputContent = JSON.stringify({
    request: {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Extract all relationships from this biblical text:\n\n${documentContent}`,
            },
          ],
        },
      ],
    },
  });

  const relationshipInputPath = `input/bible-relationships-${timestamp}.jsonl`;
  console.log(
    `  Uploading input to gs://${GCS_BUCKET}/${relationshipInputPath}...`
  );
  const relationshipInputUri = await uploadToGCS(
    token,
    relationshipInputPath,
    relationshipInputContent
  );
  console.log(`  ✓ Uploaded`);

  const relationshipOutputPrefix = `gs://${GCS_BUCKET}/output/bible-relationships-${timestamp}`;
  console.log(`  Submitting batch job...`);

  const relationshipJobName = await submitBatchJob(
    token,
    `bible-relationships-${timestamp}`,
    relationshipInputUri,
    relationshipOutputPrefix,
    relationshipSystemPrompt,
    generateRelationshipSchema()
  );

  console.log(`  ✓ Job submitted: ${relationshipJobName}`);
  state.relationshipJob = {
    name: relationshipJobName,
    inputUri: relationshipInputUri,
    outputPrefix: relationshipOutputPrefix,
    status: 'JOB_STATE_PENDING',
    startedAt: new Date().toISOString(),
  };

  // Save state
  saveState(state);
  console.log(`\n✓ State saved to ${STATE_FILE}`);

  console.log(
    '\n================================================================================'
  );
  console.log('Jobs Submitted Successfully');
  console.log(
    '================================================================================'
  );
  console.log('\nBoth extraction jobs are now running in the background.');
  console.log('Use the following commands to check progress:\n');
  console.log(
    '  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts --status'
  );
  console.log(
    '  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts --results\n'
  );
}

async function checkStatus(): Promise<void> {
  const state = loadState();
  if (!state) {
    console.log('No extraction job found. Start one with:');
    console.log(
      '  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts --start'
    );
    return;
  }

  console.log(
    '================================================================================'
  );
  console.log('Bible Knowledge Graph Extraction - Status');
  console.log(
    '================================================================================\n'
  );

  console.log(`Document: ${state.documentPath}`);
  console.log(`Size: ${state.documentSize.toLocaleString()} characters`);
  console.log(`Started: ${state.startedAt}\n`);

  const token = await getAccessToken();

  // Check entity job
  if (state.entityJob) {
    console.log('Entity Extraction Job:');
    console.log(`  Job: ${state.entityJob.name.split('/').pop()}`);

    const entityStatus = await getJobStatus(token, state.entityJob.name);
    state.entityJob.status = entityStatus.state;

    const statusIcon =
      entityStatus.state === 'JOB_STATE_SUCCEEDED'
        ? '✓'
        : entityStatus.state === 'JOB_STATE_FAILED'
        ? '✗'
        : '⏳';
    console.log(`  Status: ${statusIcon} ${entityStatus.state}`);

    if (entityStatus.outputInfo?.gcsOutputDirectory) {
      state.entityJob.outputDir = entityStatus.outputInfo.gcsOutputDirectory;
      console.log(`  Output: ${entityStatus.outputInfo.gcsOutputDirectory}`);
    }
    if (entityStatus.error) {
      console.log(`  Error: ${entityStatus.error.message}`);
    }
    if (
      entityStatus.state === 'JOB_STATE_SUCCEEDED' &&
      !state.entityJob.completedAt
    ) {
      state.entityJob.completedAt = new Date().toISOString();
    }
    console.log();
  }

  // Check relationship job
  if (state.relationshipJob) {
    console.log('Relationship Extraction Job:');
    console.log(`  Job: ${state.relationshipJob.name.split('/').pop()}`);

    const relStatus = await getJobStatus(token, state.relationshipJob.name);
    state.relationshipJob.status = relStatus.state;

    const statusIcon =
      relStatus.state === 'JOB_STATE_SUCCEEDED'
        ? '✓'
        : relStatus.state === 'JOB_STATE_FAILED'
        ? '✗'
        : '⏳';
    console.log(`  Status: ${statusIcon} ${relStatus.state}`);

    if (relStatus.outputInfo?.gcsOutputDirectory) {
      state.relationshipJob.outputDir = relStatus.outputInfo.gcsOutputDirectory;
      console.log(`  Output: ${relStatus.outputInfo.gcsOutputDirectory}`);
    }
    if (relStatus.error) {
      console.log(`  Error: ${relStatus.error.message}`);
    }
    if (
      relStatus.state === 'JOB_STATE_SUCCEEDED' &&
      !state.relationshipJob.completedAt
    ) {
      state.relationshipJob.completedAt = new Date().toISOString();
    }
    console.log();
  }

  // Save updated state
  saveState(state);

  // Summary
  const entityDone = state.entityJob?.status === 'JOB_STATE_SUCCEEDED';
  const relDone = state.relationshipJob?.status === 'JOB_STATE_SUCCEEDED';

  if (entityDone && relDone) {
    console.log(
      '================================================================================'
    );
    console.log(
      'Both jobs completed! Run --results to download and process results.'
    );
    console.log(
      '================================================================================'
    );
  } else if (
    state.entityJob?.status === 'JOB_STATE_FAILED' ||
    state.relationshipJob?.status === 'JOB_STATE_FAILED'
  ) {
    console.log(
      '================================================================================'
    );
    console.log('One or more jobs failed. Check error messages above.');
    console.log(
      '================================================================================'
    );
  } else {
    console.log(
      '================================================================================'
    );
    console.log('Jobs still running. Check again in a few minutes.');
    console.log(
      '================================================================================'
    );
  }
}

async function downloadResults(): Promise<void> {
  const state = loadState();
  if (!state) {
    console.log('No extraction job found.');
    return;
  }

  console.log(
    '================================================================================'
  );
  console.log('Bible Knowledge Graph Extraction - Results');
  console.log(
    '================================================================================\n'
  );

  const token = await getAccessToken();

  // First check/update status
  if (state.entityJob) {
    const entityStatus = await getJobStatus(token, state.entityJob.name);
    state.entityJob.status = entityStatus.state;
    if (entityStatus.outputInfo?.gcsOutputDirectory) {
      state.entityJob.outputDir = entityStatus.outputInfo.gcsOutputDirectory;
    }
  }
  if (state.relationshipJob) {
    const relStatus = await getJobStatus(token, state.relationshipJob.name);
    state.relationshipJob.status = relStatus.state;
    if (relStatus.outputInfo?.gcsOutputDirectory) {
      state.relationshipJob.outputDir = relStatus.outputInfo.gcsOutputDirectory;
    }
  }

  const entityDone = state.entityJob?.status === 'JOB_STATE_SUCCEEDED';
  const relDone = state.relationshipJob?.status === 'JOB_STATE_SUCCEEDED';

  if (!entityDone || !relDone) {
    console.log('Jobs not yet complete:');
    console.log(`  Entity job: ${state.entityJob?.status || 'not started'}`);
    console.log(
      `  Relationship job: ${state.relationshipJob?.status || 'not started'}`
    );
    console.log('\nRun --status for more details.');
    return;
  }

  // Download entity results
  console.log('Downloading entity results...');
  const entityOutputDir = state.entityJob!.outputDir!;
  const entityPrefix = entityOutputDir.replace(`gs://${GCS_BUCKET}/`, '');
  const entityFiles = await listGCSObjects(token, entityPrefix);
  const entityPredFile = entityFiles.find((f) => f.includes('predictions'));

  const entities: object[] = [];
  if (entityPredFile) {
    const entityData = await downloadFromGCS(token, entityPredFile);
    for (const line of entityData.split('\n').filter((l) => l.trim())) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = parsed.response.candidates[0].content.parts[0].text;
          const extracted = JSON.parse(text);
          entities.push(...(extracted.entities || []));
        }
      } catch (err) {
        // Try regex extraction as fallback
        const entityPattern =
          /\{\s*"type"\s*:\s*"(\w+)"\s*,\s*"name"\s*:\s*"([^"]+)"[^}]*\}/g;
        let match;
        while ((match = entityPattern.exec(line)) !== null) {
          entities.push({ type: match[1], name: match[2] });
        }
      }
    }
  }
  console.log(`  ✓ Downloaded ${entities.length} entities`);

  // Download relationship results
  console.log('Downloading relationship results...');
  const relOutputDir = state.relationshipJob!.outputDir!;
  const relPrefix = relOutputDir.replace(`gs://${GCS_BUCKET}/`, '');
  const relFiles = await listGCSObjects(token, relPrefix);
  const relPredFile = relFiles.find((f) => f.includes('predictions'));

  const relationships: object[] = [];
  if (relPredFile) {
    const relData = await downloadFromGCS(token, relPredFile);
    for (const line of relData.split('\n').filter((l) => l.trim())) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = parsed.response.candidates[0].content.parts[0].text;
          const extracted = JSON.parse(text);
          relationships.push(...(extracted.relationships || []));
        }
      } catch (err) {
        // Try regex extraction as fallback
        const relPattern =
          /\{\s*"source"\s*:\s*"([^"]+)"\s*,\s*(?:"source_type"\s*:\s*"[^"]*"\s*,\s*)?"target"\s*:\s*"([^"]+)"\s*,\s*(?:"target_type"\s*:\s*"[^"]*"\s*,\s*)?"type"\s*:\s*"([^"]+)"[^}]*\}/g;
        let match;
        while ((match = relPattern.exec(line)) !== null) {
          relationships.push({
            source: match[1],
            target: match[2],
            type: match[3],
          });
        }
      }
    }
  }
  console.log(`  ✓ Downloaded ${relationships.length} relationships`);

  // Compile results
  const results = {
    metadata: {
      document: state.documentPath,
      documentSize: state.documentSize,
      model: MODEL_ID,
      startedAt: state.startedAt,
      completedAt: new Date().toISOString(),
      entityJobId: state.entityJob?.name.split('/').pop(),
      relationshipJobId: state.relationshipJob?.name.split('/').pop(),
    },
    entities,
    relationships,
    summary: {
      totalEntities: entities.length,
      totalRelationships: relationships.length,
      entityTypes: [
        ...new Set(entities.map((e: any) => e.type).filter(Boolean)),
      ],
      relationshipTypes: [
        ...new Set(relationships.map((r: any) => r.type).filter(Boolean)),
      ],
    },
  };

  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

  console.log(
    '\n================================================================================'
  );
  console.log('EXTRACTION COMPLETE');
  console.log(
    '================================================================================'
  );
  console.log(`\nResults saved to: ${RESULTS_FILE}`);
  console.log('\nSummary:');
  console.log(`  Entities: ${results.summary.totalEntities}`);
  console.log(`  Relationships: ${results.summary.totalRelationships}`);
  console.log(`  Entity types: ${results.summary.entityTypes.length}`);
  console.log(
    `  Relationship types: ${results.summary.relationshipTypes.length}`
  );

  console.log('\nEntity types found:');
  for (const type of results.summary.entityTypes.slice(0, 15)) {
    const count = entities.filter((e: any) => e.type === type).length;
    console.log(`  - ${type}: ${count}`);
  }

  console.log('\nSample relationships:');
  for (const rel of relationships.slice(0, 10) as any[]) {
    console.log(`  ${rel.source} --[${rel.type}]--> ${rel.target}`);
  }

  // Clear state file
  clearState();
  console.log('\n✓ State file cleared.');
}

function showHelp(): void {
  console.log(`
Bible Knowledge Graph Extraction - Vertex AI Batch API

Usage:
  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts [options] [document]

Options:
  --help          Show this help message
  --start         Start extraction (default if no other flag)
  --status        Check status of running jobs
  --results       Download and display results
  --check-bucket  Check if GCS bucket is accessible
  --dry-run       Show configuration without executing

Arguments:
  document        Path to document (default: test-data/bible/complete-bible.md)

Examples:
  # Start extraction on the complete Bible
  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts --start

  # Check job status
  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts --status

  # Download results when complete
  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts --results

  # Start extraction on a specific document
  npx tsx scripts/extraction_tests/test-vertex-batch-bible.ts ./my-document.md

Environment Variables:
  GOOGLE_APPLICATION_CREDENTIALS  Path to service account JSON
  GCS_BUCKET                      GCS bucket name (default: emergent-batch-extraction)
  VERTEX_PROJECT                  GCP project ID (default: spec-server-dev)
  VERTEX_LOCATION                 GCP region (default: us-central1)
`);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse flags
  const flags = {
    help: args.includes('--help') || args.includes('-h'),
    start: args.includes('--start'),
    status: args.includes('--status'),
    results: args.includes('--results'),
    checkBucket: args.includes('--check-bucket'),
    dryRun: args.includes('--dry-run'),
  };

  // Find document argument (non-flag argument)
  const documentArg = args.find(
    (a) => !a.startsWith('--') && !a.startsWith('-')
  );
  const documentPath = documentArg || DEFAULT_DOCUMENT;

  if (flags.help) {
    showHelp();
    return;
  }

  if (flags.checkBucket) {
    const token = await getAccessToken();
    const accessible = await checkBucket(token);
    if (accessible) {
      console.log(`✓ Bucket gs://${GCS_BUCKET} is accessible`);
    } else {
      console.log(`✗ Bucket gs://${GCS_BUCKET} is not accessible`);
      process.exit(1);
    }
    return;
  }

  if (flags.dryRun) {
    console.log('Configuration:');
    console.log(`  Project: ${VERTEX_PROJECT}`);
    console.log(`  Location: ${VERTEX_LOCATION}`);
    console.log(`  Bucket: ${GCS_BUCKET}`);
    console.log(`  Model: ${MODEL_ID}`);
    console.log(`  Document: ${documentPath}`);
    console.log(`  State file: ${STATE_FILE}`);
    console.log(`  Results file: ${RESULTS_FILE}`);
    console.log(`\nEntity types: ${Object.keys(ENTITY_TYPES).join(', ')}`);
    console.log(`Relationship types: ${RELATIONSHIP_TYPES.length} types`);
    return;
  }

  if (flags.status) {
    await checkStatus();
    return;
  }

  if (flags.results) {
    await downloadResults();
    return;
  }

  // Default: start extraction
  await startExtraction(documentPath);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
