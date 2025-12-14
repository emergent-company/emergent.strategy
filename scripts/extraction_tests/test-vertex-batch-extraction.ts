#!/usr/bin/env npx tsx
/**
 * Test Vertex AI Batch Processing for Entity Extraction
 *
 * This script evaluates using Vertex AI's batch inference API to process
 * entire documents without chunking, leveraging:
 * - 50% cost reduction vs real-time inference
 * - Higher rate limits (up to 200,000 requests per batch)
 * - Gemini's 1M+ token context window for whole documents
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts [document-path]
 *   npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts --setup-bucket
 *   npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts --help
 *
 * Requirements:
 *   - GCS bucket: gs://emergent-batch-extraction/ (or configure via GCS_BUCKET env)
 *   - Service account: spec-server-dev-vertex-ai.json with Storage Admin permissions
 *
 * Environment Variables:
 *   - GCS_BUCKET: GCS bucket name (default: emergent-batch-extraction)
 *   - VERTEX_PROJECT: GCP project ID (default: spec-server-dev)
 *   - VERTEX_LOCATION: GCP region (default: us-central1)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleAuth } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // GCP settings
  projectId: process.env.VERTEX_PROJECT || 'spec-server-dev',
  location: process.env.VERTEX_LOCATION || 'us-central1',
  bucket: process.env.GCS_BUCKET || 'emergent-batch-extraction',

  // Model settings
  model: 'gemini-2.5-flash',
  temperature: 0.1,

  // Polling settings
  pollIntervalMs: 30_000, // 30 seconds
  maxPollAttempts: 120, // 1 hour max wait

  // Credentials
  credentialsPath: path.resolve(
    __dirname,
    '..',
    '..',
    'spec-server-dev-vertex-ai.json'
  ),
};

// Set credentials for Google Auth
process.env.GOOGLE_APPLICATION_CREDENTIALS = CONFIG.credentialsPath;

// =============================================================================
// Types
// =============================================================================

interface Entity {
  name: string;
  type: string;
  description?: string;
}

interface Relationship {
  source_ref: string;
  target_ref: string;
  type: string;
  description?: string;
}

interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
}

interface BatchJobStatus {
  name: string;
  state:
    | 'JOB_STATE_PENDING'
    | 'JOB_STATE_RUNNING'
    | 'JOB_STATE_SUCCEEDED'
    | 'JOB_STATE_FAILED'
    | string;
  error?: { message: string };
  outputInfo?: {
    gcsOutputDirectory: string;
  };
}

// =============================================================================
// Schemas for Structured Output
// =============================================================================

const ENTITY_SCHEMA = {
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
            description:
              'Type of entity (Person, Place, Thing, Concept, Event, etc.)',
          },
          description: {
            type: 'string',
            description: 'Brief description of the entity',
          },
        },
        required: ['name', 'type'],
      },
      description: 'List of extracted entities',
    },
  },
  required: ['entities'],
};

const RELATIONSHIP_SCHEMA = {
  type: 'object',
  properties: {
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_ref: { type: 'string', description: 'Name of source entity' },
          target_ref: { type: 'string', description: 'Name of target entity' },
          type: { type: 'string', description: 'Type of relationship' },
          description: {
            type: 'string',
            description: 'Description of the relationship',
          },
        },
        required: ['source_ref', 'target_ref', 'type'],
      },
      description: 'List of relationships between entities',
    },
  },
  required: ['relationships'],
};

// =============================================================================
// Prompts
// =============================================================================

const ENTITY_EXTRACTION_PROMPT = `You are an expert entity extractor. Analyze the following document and extract all notable entities.

For each entity, provide:
- name: The canonical name of the entity
- type: One of: Person, Place, Location, Organization, Thing, Concept, Event, Time, Document, or another appropriate type
- description: A brief description based on the document content

Focus on entities that are significant to understanding the document. Include people, places, objects, concepts, and events mentioned.

Document:
---
{DOCUMENT_CONTENT}
---

Extract all entities from this document.`;

const RELATIONSHIP_EXTRACTION_PROMPT = `You are an expert at identifying relationships between entities. Given the document and the list of entities below, identify all meaningful relationships between them.

For each relationship, provide:
- source_ref: Name of the source entity (must match an entity name exactly)
- target_ref: Name of the target entity (must match an entity name exactly)  
- type: The type of relationship (e.g., CREATED, LOCATED_IN, PARENT_OF, PART_OF, CAUSED, etc.)
- description: A brief description of the relationship

Entities found in document:
{ENTITY_LIST}

Document:
---
{DOCUMENT_CONTENT}
---

Identify all relationships between the entities listed above.`;

// =============================================================================
// Google Auth Helper
// =============================================================================

let authClient: GoogleAuth | null = null;

async function getAuthClient(): Promise<GoogleAuth> {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/devstorage.full_control',
      ],
    });
  }
  return authClient;
}

async function getAccessToken(): Promise<string> {
  const auth = await getAuthClient();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error('Failed to get access token');
  }
  return tokenResponse.token;
}

// =============================================================================
// GCS Operations
// =============================================================================

async function uploadToGcs(content: string, gcsPath: string): Promise<string> {
  const token = await getAccessToken();
  const bucket = CONFIG.bucket;
  const objectName = encodeURIComponent(gcsPath);

  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${objectName}`;

  console.log(`  Uploading to gs://${bucket}/${gcsPath}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: content,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GCS upload failed: ${response.status} ${error}`);
  }

  return `gs://${bucket}/${gcsPath}`;
}

async function downloadFromGcs(gcsUri: string): Promise<string> {
  const token = await getAccessToken();

  // Parse gs:// URI
  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid GCS URI: ${gcsUri}`);
  }

  const [, bucket, objectPath] = match;
  const objectName = encodeURIComponent(objectPath);

  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${objectName}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GCS download failed: ${response.status} ${error}`);
  }

  return response.text();
}

async function listGcsObjects(gcsPrefix: string): Promise<string[]> {
  const token = await getAccessToken();

  // Parse gs:// URI prefix
  const match = gcsPrefix.match(/^gs:\/\/([^/]+)\/(.*)$/);
  if (!match) {
    throw new Error(`Invalid GCS prefix: ${gcsPrefix}`);
  }

  const [, bucket, prefix] = match;

  const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(
    prefix
  )}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GCS list failed: ${response.status} ${error}`);
  }

  const data = (await response.json()) as { items?: Array<{ name: string }> };
  return (data.items || []).map((item) => `gs://${bucket}/${item.name}`);
}

// =============================================================================
// Batch Job Operations
// =============================================================================

function buildBatchRequest(prompt: string, schema: object): object {
  return {
    request: {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: CONFIG.temperature,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    },
  };
}

async function submitBatchJob(
  inputGcsUri: string,
  outputGcsPrefix: string
): Promise<string> {
  const token = await getAccessToken();

  const url = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/${CONFIG.location}/batchPredictionJobs`;

  const jobId = `extraction-${Date.now()}`;

  const body = {
    displayName: jobId,
    model: `publishers/google/models/${CONFIG.model}`,
    inputConfig: {
      instancesFormat: 'jsonl',
      gcsSource: {
        uris: [inputGcsUri],
      },
    },
    outputConfig: {
      predictionsFormat: 'jsonl',
      gcsDestination: {
        outputUriPrefix: outputGcsPrefix,
      },
    },
  };

  console.log(`  Submitting batch job: ${jobId}`);
  console.log(`  Input: ${inputGcsUri}`);
  console.log(`  Output prefix: ${outputGcsPrefix}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Batch job submission failed: ${response.status} ${error}`);
  }

  const result = (await response.json()) as { name: string };
  console.log(`  Job created: ${result.name}`);
  return result.name;
}

async function getJobStatus(jobName: string): Promise<BatchJobStatus> {
  const token = await getAccessToken();

  const url = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/${jobName}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Get job status failed: ${response.status} ${error}`);
  }

  return response.json() as Promise<BatchJobStatus>;
}

async function waitForJobCompletion(jobName: string): Promise<BatchJobStatus> {
  console.log(`\n  Waiting for job completion...`);

  for (let attempt = 0; attempt < CONFIG.maxPollAttempts; attempt++) {
    const status = await getJobStatus(jobName);

    console.log(`  [${new Date().toISOString()}] Status: ${status.state}`);

    if (status.state === 'JOB_STATE_SUCCEEDED') {
      return status;
    }

    if (status.state === 'JOB_STATE_FAILED') {
      throw new Error(
        `Batch job failed: ${status.error?.message || 'Unknown error'}`
      );
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, CONFIG.pollIntervalMs));
  }

  throw new Error('Batch job timed out waiting for completion');
}

// =============================================================================
// Extraction Pipeline
// =============================================================================

async function extractEntitiesWithBatch(
  documentContent: string
): Promise<Entity[]> {
  const jobId = `entities-${Date.now()}`;
  const inputPath = `input/${jobId}.jsonl`;
  const outputPrefix = `gs://${CONFIG.bucket}/output/${jobId}`;

  // Build the entity extraction prompt
  const prompt = ENTITY_EXTRACTION_PROMPT.replace(
    '{DOCUMENT_CONTENT}',
    documentContent
  );

  // Create JSONL input
  const jsonlLine = JSON.stringify(buildBatchRequest(prompt, ENTITY_SCHEMA));

  // Upload input to GCS
  const inputUri = await uploadToGcs(jsonlLine, inputPath);

  // Submit batch job
  const jobName = await submitBatchJob(inputUri, outputPrefix);

  // Wait for completion
  const status = await waitForJobCompletion(jobName);

  // Get output files
  const outputDir = status.outputInfo?.gcsOutputDirectory || outputPrefix;
  console.log(`  Output directory: ${outputDir}`);

  const outputFiles = await listGcsObjects(outputDir);
  console.log(`  Found ${outputFiles.length} output files`);

  // Download and parse results
  const entities: Entity[] = [];

  for (const file of outputFiles) {
    if (file.endsWith('.jsonl')) {
      console.log(`  Processing: ${file}`);
      const content = await downloadFromGcs(file);

      for (const line of content.split('\n').filter((l) => l.trim())) {
        try {
          const result = JSON.parse(line) as {
            response?: {
              candidates?: Array<{
                content?: {
                  parts?: Array<{ text?: string }>;
                };
              }>;
            };
          };

          // Extract the response text
          const responseText =
            result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText) {
            const parsed = JSON.parse(responseText) as { entities?: Entity[] };
            if (parsed.entities) {
              entities.push(...parsed.entities);
            }
          }
        } catch (e) {
          console.error(`  Error parsing line: ${e}`);
        }
      }
    }
  }

  return entities;
}

async function extractRelationshipsWithBatch(
  documentContent: string,
  entities: Entity[]
): Promise<Relationship[]> {
  const jobId = `relationships-${Date.now()}`;
  const inputPath = `input/${jobId}.jsonl`;
  const outputPrefix = `gs://${CONFIG.bucket}/output/${jobId}`;

  // Build entity list for the prompt
  const entityList = entities
    .map((e) => `- ${e.name} (${e.type}): ${e.description || 'N/A'}`)
    .join('\n');

  // Build the relationship extraction prompt
  const prompt = RELATIONSHIP_EXTRACTION_PROMPT.replace(
    '{DOCUMENT_CONTENT}',
    documentContent
  ).replace('{ENTITY_LIST}', entityList);

  // Create JSONL input
  const jsonlLine = JSON.stringify(
    buildBatchRequest(prompt, RELATIONSHIP_SCHEMA)
  );

  // Upload input to GCS
  const inputUri = await uploadToGcs(jsonlLine, inputPath);

  // Submit batch job
  const jobName = await submitBatchJob(inputUri, outputPrefix);

  // Wait for completion
  const status = await waitForJobCompletion(jobName);

  // Get output files
  const outputDir = status.outputInfo?.gcsOutputDirectory || outputPrefix;
  console.log(`  Output directory: ${outputDir}`);

  const outputFiles = await listGcsObjects(outputDir);
  console.log(`  Found ${outputFiles.length} output files`);

  // Download and parse results
  const relationships: Relationship[] = [];

  for (const file of outputFiles) {
    if (file.endsWith('.jsonl')) {
      console.log(`  Processing: ${file}`);
      const content = await downloadFromGcs(file);

      for (const line of content.split('\n').filter((l) => l.trim())) {
        try {
          const result = JSON.parse(line) as {
            response?: {
              candidates?: Array<{
                content?: {
                  parts?: Array<{ text?: string }>;
                };
              }>;
            };
          };

          // Extract the response text
          const responseText =
            result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText) {
            const parsed = JSON.parse(responseText) as {
              relationships?: Relationship[];
            };
            if (parsed.relationships) {
              relationships.push(...parsed.relationships);
            }
          }
        } catch (e) {
          console.error(`  Error parsing line: ${e}`);
        }
      }
    }
  }

  return relationships;
}

// =============================================================================
// CLI Commands
// =============================================================================

function showHelp() {
  console.log(`
Vertex AI Batch Extraction Test

USAGE:
  npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts [OPTIONS] [document-path]

OPTIONS:
  --help, -h         Show this help message
  --setup-bucket     Create the GCS bucket if it doesn't exist
  --check-bucket     Check if the GCS bucket exists and is accessible
  --dry-run          Prepare the batch job but don't submit it

ARGUMENTS:
  document-path      Path to document to extract from (default: test-data/bible/books/01_Genesis.md)

ENVIRONMENT VARIABLES:
  GCS_BUCKET         GCS bucket name (default: emergent-batch-extraction)
  VERTEX_PROJECT     GCP project ID (default: spec-server-dev)
  VERTEX_LOCATION    GCP region (default: us-central1)

EXAMPLES:
  # Run extraction on default document
  npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts

  # Run extraction on custom document  
  npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts ./my-document.md

  # Setup GCS bucket first
  npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts --setup-bucket

  # Check bucket accessibility
  npx tsx scripts/extraction_tests/test-vertex-batch-extraction.ts --check-bucket
`);
}

async function checkBucket(): Promise<boolean> {
  const token = await getAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${CONFIG.bucket}`;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      console.log(`✓ Bucket gs://${CONFIG.bucket} exists and is accessible`);
      return true;
    } else if (response.status === 404) {
      console.log(`✗ Bucket gs://${CONFIG.bucket} does not exist`);
      return false;
    } else {
      const error = await response.text();
      console.log(`✗ Error accessing bucket: ${response.status} ${error}`);
      return false;
    }
  } catch (e) {
    console.log(`✗ Error checking bucket: ${e}`);
    return false;
  }
}

async function setupBucket(): Promise<void> {
  const token = await getAccessToken();

  // First check if bucket exists
  const exists = await checkBucket();
  if (exists) {
    console.log('Bucket already exists, no setup needed');
    return;
  }

  console.log(`\nCreating bucket gs://${CONFIG.bucket}...`);

  const url = `https://storage.googleapis.com/storage/v1/b?project=${CONFIG.projectId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: CONFIG.bucket,
      location: CONFIG.location.toUpperCase().split('-').slice(0, 2).join('-'), // e.g., US-CENTRAL1 -> US
      storageClass: 'STANDARD',
    }),
  });

  if (response.ok) {
    console.log(`✓ Bucket gs://${CONFIG.bucket} created successfully`);
  } else {
    const error = await response.text();
    throw new Error(`Failed to create bucket: ${response.status} ${error}`);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--setup-bucket')) {
    await setupBucket();
    return;
  }

  if (args.includes('--check-bucket')) {
    await checkBucket();
    return;
  }

  const dryRun = args.includes('--dry-run');
  const documentPath =
    args.find((a) => !a.startsWith('-')) ||
    path.resolve(
      __dirname,
      '..',
      '..',
      'test-data',
      'bible',
      'books',
      '01_Genesis.md'
    );

  console.log('='.repeat(80));
  console.log('Vertex AI Batch Extraction Test');
  console.log('='.repeat(80));

  console.log(`\nConfiguration:`);
  console.log(`  Project: ${CONFIG.projectId}`);
  console.log(`  Location: ${CONFIG.location}`);
  console.log(`  Bucket: ${CONFIG.bucket}`);
  console.log(`  Model: ${CONFIG.model}`);
  console.log(`  Document: ${documentPath}`);
  if (dryRun) {
    console.log(`  Mode: DRY RUN (will not submit batch job)`);
  }

  // Read document
  if (!fs.existsSync(documentPath)) {
    console.error(`\nError: Document not found: ${documentPath}`);
    process.exit(1);
  }

  // Check bucket accessibility first (skip for dry-run)
  if (!dryRun) {
    console.log(`\nChecking GCS bucket...`);
    const bucketOk = await checkBucket();
    if (!bucketOk) {
      console.error(
        `\nError: GCS bucket not accessible. Run with --setup-bucket to create it.`
      );
      process.exit(1);
    }
  }

  const documentContent = fs.readFileSync(documentPath, 'utf-8');
  const charCount = documentContent.length;
  const wordCount = documentContent.split(/\s+/).length;
  const estimatedTokens = Math.ceil(wordCount * 1.3); // Rough estimate

  console.log(`\nDocument Stats:`);
  console.log(`  Characters: ${charCount.toLocaleString()}`);
  console.log(`  Words: ${wordCount.toLocaleString()}`);
  console.log(`  Estimated tokens: ${estimatedTokens.toLocaleString()}`);

  // Check if document fits in context (1M tokens for Gemini 2.5)
  if (estimatedTokens > 900_000) {
    console.warn(
      `\nWarning: Document may be too large for single-request processing`
    );
  }

  // Dry run: show what would be sent
  if (dryRun) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('DRY RUN: Sample Batch Request');
    console.log('='.repeat(80));

    const samplePrompt = ENTITY_EXTRACTION_PROMPT.replace(
      '{DOCUMENT_CONTENT}',
      documentContent.slice(0, 500) + '...[truncated]'
    );
    const sampleRequest = buildBatchRequest(samplePrompt, ENTITY_SCHEMA);

    console.log('\nJSONL request format (truncated):');
    console.log(JSON.stringify(sampleRequest, null, 2).slice(0, 1000) + '...');

    console.log(
      '\n✓ Dry run complete. Remove --dry-run to submit actual batch job.'
    );
    return;
  }

  const startTime = Date.now();

  // Step 1: Extract entities
  console.log(`\n${'='.repeat(80)}`);
  console.log('Step 1: Entity Extraction (Batch)');
  console.log('='.repeat(80));

  const entities = await extractEntitiesWithBatch(documentContent);

  console.log(`\n  Extracted ${entities.length} entities:`);
  for (const entity of entities.slice(0, 20)) {
    console.log(`    - ${entity.name} (${entity.type})`);
  }
  if (entities.length > 20) {
    console.log(`    ... and ${entities.length - 20} more`);
  }

  // Step 2: Extract relationships
  console.log(`\n${'='.repeat(80)}`);
  console.log('Step 2: Relationship Extraction (Batch)');
  console.log('='.repeat(80));

  const relationships = await extractRelationshipsWithBatch(
    documentContent,
    entities
  );

  console.log(`\n  Extracted ${relationships.length} relationships:`);
  for (const rel of relationships.slice(0, 20)) {
    console.log(`    - ${rel.source_ref} --[${rel.type}]--> ${rel.target_ref}`);
  }
  if (relationships.length > 20) {
    console.log(`    ... and ${relationships.length - 20} more`);
  }

  // Summary
  const totalTime = Date.now() - startTime;
  console.log(`\n${'='.repeat(80)}`);
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`  Total entities: ${entities.length}`);
  console.log(`  Total relationships: ${relationships.length}`);
  console.log(`  Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`  (Note: Batch jobs may have queue time before processing)`);

  // Output full results to JSON file
  const outputPath = path.resolve(__dirname, 'batch-extraction-results.json');
  const results: ExtractionResult = { entities, relationships };
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n  Full results saved to: ${outputPath}`);
}

main().catch((error) => {
  console.error('\nError:', error);
  process.exit(1);
});
