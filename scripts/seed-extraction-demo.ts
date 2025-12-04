#!/usr/bin/env tsx
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

const DEFAULT_TEMPLATE_PACK_ID = '1f6f6267-0d2c-4e2f-9fdb-7f0481219775';
const DEFAULT_SEED_USER_ID = '00000000-0000-0000-0000-000000000001';

const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[seed-extraction] Loaded environment from ${envPath}`);
} else {
  console.warn(
    '[seed-extraction] No .env file found at project root – proceeding with process env values only'
  );
}

// Validate required environment variables with helpful error messages
validateEnvVars(DB_REQUIREMENTS);

// Use validated env vars with no fallbacks
const pool = new Pool(getDbConfig());

const orgName = process.env.EXTRACTION_SEED_ORG_NAME || 'Extraction Demo Org';
const projectName =
  process.env.EXTRACTION_SEED_PROJECT_NAME || 'Extraction Demo Project';
const templatePackId =
  process.env.EXTRACTION_SEED_PACK_ID || DEFAULT_TEMPLATE_PACK_ID;
const templatePackName =
  process.env.EXTRACTION_SEED_PACK_NAME || 'Extraction Demo Pack';
const templatePackVersion = process.env.EXTRACTION_SEED_PACK_VERSION || '1.0.0';
const seedUserId = process.env.EXTRACTION_SEED_USER_ID || DEFAULT_SEED_USER_ID;

const baseTypes = [
  {
    type: 'Person',
    description: 'Individual person extracted from unstructured text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Full name of the person' },
        title: { type: 'string', description: 'Job title or role' },
        company: {
          type: 'string',
          description: 'Organization the person is associated with',
        },
        location: {
          type: 'string',
          description: 'Primary location for the person',
        },
      },
    },
    extraction: {
      system:
        'Extract all people mentioned in the text with their role, organization, and location when available.',
      user: 'Identify each person in the text. Return their name, title, company, and location if present.',
    },
  },
  {
    type: 'Organization',
    description: 'Company or group referenced in the text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Organization name' },
        industry: { type: 'string', description: 'Primary industry or sector' },
        headquarters: { type: 'string', description: 'Headquarters location' },
      },
    },
    extraction: {
      system:
        'Extract organizations mentioned in the text and capture their key attributes.',
      user: 'List each organization in the passage. Include the organization name, industry, and headquarters if available.',
    },
  },
  {
    type: 'Location',
    description: 'Geographic location referenced in the text',
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Location name' },
        country: {
          type: 'string',
          description: 'Country where the location resides',
        },
        region: {
          type: 'string',
          description: 'Region or state for the location',
        },
      },
    },
    extraction: {
      system: 'Extract all notable locations mentioned in the text.',
      user: 'Identify every location referenced and return its name, country, and region when the text provides them.',
    },
  },
];

const sampleDocument = {
  filename: 'extraction-demo.md',
  mimeType: 'text/markdown',
  content: `Spec Corp recently acquired Horizon Analytics, expanding its AI offerings.\n\nJane Rivera (Chief Strategy Officer at Spec Corp) will lead the integration effort from the San Francisco office.\n\nMeanwhile, Horizon Analytics CEO Daniel Cho will continue operating the Boston research hub to accelerate new product development.`,
};

async function ensureOrg(client: PoolClient): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM kb.orgs WHERE name = $1 LIMIT 1',
    [orgName]
  );
  if (existing.rowCount) {
    console.log(`• Reusing existing org “${orgName}”`);
    return existing.rows[0].id;
  }
  const inserted = await client.query<{ id: string }>(
    'INSERT INTO kb.orgs(name) VALUES($1) RETURNING id',
    [orgName]
  );
  console.log(`• Created org “${orgName}”`);
  return inserted.rows[0].id;
}

async function ensureProject(
  client: PoolClient,
  orgId: string
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM kb.projects WHERE organization_id = $1 AND name = $2 LIMIT 1',
    [orgId, projectName]
  );
  if (existing.rowCount) {
    console.log(`• Reusing existing project “${projectName}”`);
    return existing.rows[0].id;
  }
  const inserted = await client.query<{ id: string }>(
    'INSERT INTO kb.projects(organization_id, name) VALUES($1, $2) RETURNING id',
    [orgId, projectName]
  );
  console.log(`• Created project “${projectName}”`);
  return inserted.rows[0].id;
}

async function upsertTemplatePack(client: PoolClient): Promise<void> {
  const objectTypeSchemas: Record<string, unknown> = {};
  const extractionPrompts: Record<string, unknown> = {};
  const uiConfigs: Record<string, unknown> = {};

  for (const type of baseTypes) {
    objectTypeSchemas[type.type] = {
      ...type.schema,
      description: type.description, // Include description at schema level for API access
    };
    extractionPrompts[type.type] = type.extraction;
    uiConfigs[type.type] = {
      icon:
        type.type === 'Person'
          ? 'lucide--user'
          : type.type === 'Organization'
          ? 'lucide--building-2'
          : 'lucide--map-pin',
      color:
        type.type === 'Person'
          ? 'primary'
          : type.type === 'Organization'
          ? 'accent'
          : 'info',
    };
  }

  const existing = await client.query(
    'SELECT id FROM kb.graph_template_packs WHERE id = $1',
    [templatePackId]
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE kb.graph_template_packs
             SET name = $1,
                 version = $2,
                 description = $3,
                 author = $4,
                 object_type_schemas = $5::jsonb,
                 relationship_type_schemas = '{}'::jsonb,
                 ui_configs = $6::jsonb,
                 extraction_prompts = $7::jsonb,
                 updated_at = now(),
                 deprecated_at = NULL
             WHERE id = $8`,
      [
        templatePackName,
        templatePackVersion,
        'Seeded extraction demo pack with Person/Organization/Location types.',
        'Spec Server Seed Script',
        JSON.stringify(objectTypeSchemas),
        JSON.stringify(uiConfigs),
        JSON.stringify(extractionPrompts),
        templatePackId,
      ]
    );
    console.log('• Updated existing extraction template pack');
  } else {
    await client.query(
      `INSERT INTO kb.graph_template_packs (
                id, name, version, description, author,
                object_type_schemas, relationship_type_schemas,
                ui_configs, extraction_prompts, published_at, source
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, '{}'::jsonb, $7::jsonb, $8::jsonb, now(), $9)`,
      [
        templatePackId,
        templatePackName,
        templatePackVersion,
        'Seeded extraction demo pack with Person/Organization/Location types.',
        'Spec Server Seed Script',
        JSON.stringify(objectTypeSchemas),
        JSON.stringify(uiConfigs),
        JSON.stringify(extractionPrompts),
        'system', // Mark as built-in/system template pack
      ]
    );
    console.log('• Created extraction template pack');
  }
}

async function ensureTemplateAssignment(
  client: PoolClient,
  tenantId: string,
  orgId: string,
  projectId: string
): Promise<void> {
  const existing = await client.query(
    'SELECT id FROM kb.project_template_packs WHERE project_id = $1 AND template_pack_id = $2',
    [projectId, templatePackId]
  );
  if (existing.rowCount) {
    console.log('• Template pack already assigned to project');
    return;
  }
  await client.query(
    `INSERT INTO kb.project_template_packs (
            project_id, template_pack_id,
            installed_by, active, customizations
        ) VALUES ($1, $2, $3, true, '{}'::jsonb)`,
    [projectId, templatePackId, seedUserId]
  );
  console.log('• Assigned template pack to project');
}

async function ensureProjectTypes(
  client: PoolClient,
  tenantId: string,
  orgId: string,
  projectId: string
): Promise<void> {
  for (const type of baseTypes) {
    const existing = await client.query(
      'SELECT id FROM kb.project_object_type_registry WHERE project_id = $1 AND type_name = $2',
      [projectId, type.type]
    );
    if (existing.rowCount) {
      await client.query(
        `UPDATE kb.project_object_type_registry
                 SET json_schema = $1::jsonb,
                     extraction_config = $2::jsonb,
                     description = $3,
                     updated_at = now()
                 WHERE id = $4`,
        [
          JSON.stringify(type.schema),
          JSON.stringify({ prompt: type.extraction }),
          type.description,
          existing.rows[0].id,
        ]
      );
      console.log(`• Updated object type ${type.type}`);
    } else {
      await client.query(
        `INSERT INTO kb.project_object_type_registry (
                    project_id, type_name, source,
                    template_pack_id, json_schema, ui_config, extraction_config,
                    enabled, created_by, description
                ) VALUES ($1, $2, 'template', $3, $4::jsonb, '{}'::jsonb, $5::jsonb, true, $6, $7)`,
        [
          projectId,
          type.type,
          templatePackId,
          JSON.stringify(type.schema),
          JSON.stringify({ prompt: type.extraction }),
          seedUserId,
          type.description,
        ]
      );
      console.log(`• Registered object type ${type.type}`);
    }
  }
}

async function ensureDocument(
  client: PoolClient,
  orgId: string,
  projectId: string
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM kb.documents WHERE project_id = $1 AND filename = $2 LIMIT 1',
    [projectId, sampleDocument.filename]
  );
  if (existing.rowCount) {
    const docId = existing.rows[0].id;
    await client.query(
      'UPDATE kb.documents SET content = $1, mime_type = $2, updated_at = now() WHERE id = $3',
      [sampleDocument.content, sampleDocument.mimeType, docId]
    );
    await client.query(
      `INSERT INTO kb.chunks (document_id, chunk_index, text)
             VALUES ($1, 0, $2)
             ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
      [docId, sampleDocument.content]
    );
    console.log('• Updated existing seed document');
    return docId;
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO kb.documents (organization_id, project_id, filename, mime_type, content)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
    [
      orgId,
      projectId,
      sampleDocument.filename,
      sampleDocument.mimeType,
      sampleDocument.content,
    ]
  );
  const docId = inserted.rows[0].id;
  await client.query(
    `INSERT INTO kb.chunks (document_id, chunk_index, text)
         VALUES ($1, 0, $2)
         ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
    [docId, sampleDocument.content]
  );
  console.log('• Created seed document and chunk');
  return docId;
}

async function ensurePendingJob(
  client: PoolClient,
  tenantId: string,
  orgId: string,
  projectId: string,
  documentId: string
): Promise<void> {
  const existing = await client.query(
    'SELECT id FROM kb.object_extraction_jobs WHERE project_id = $1 AND document_id = $2 AND status = $3 LIMIT 1',
    [projectId, documentId, 'pending']
  );
  if (existing.rowCount) {
    console.log('• Pending extraction job already exists for seed document');
    return;
  }
  await client.query(
    `INSERT INTO kb.object_extraction_jobs (
            organization_id, project_id, document_id,
            job_type, status, enabled_types, extraction_config,
            created_by, source_type, source_id, source_metadata
        ) VALUES ($1, $2, $3, 'full_extraction', 'pending', $4::text[], $5::jsonb, $6, 'DOCUMENT', $7, '{}'::jsonb)`,
    [
      orgId,
      projectId,
      documentId,
      baseTypes.map((t) => t.type),
      JSON.stringify({ allowed_types: baseTypes.map((t) => t.type) }),
      seedUserId,
      documentId,
    ]
  );
  console.log('• Created pending extraction job for seed document');
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orgId = await ensureOrg(client);
    const projectId = await ensureProject(client, orgId);
    const tenantId = process.env.EXTRACTION_SEED_TENANT_ID || orgId;

    await upsertTemplatePack(client);
    await ensureTemplateAssignment(client, tenantId, orgId, projectId);
    await ensureProjectTypes(client, tenantId, orgId, projectId);
    const documentId = await ensureDocument(client, orgId, projectId);
    // Skip job creation - manual extraction can be triggered from UI
    // await ensurePendingJob(client, tenantId, orgId, projectId, documentId);

    await client.query('COMMIT');
    console.log('\n✅ Extraction demo seed completed successfully');
    console.log(`   Org ID: ${orgId}`);
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Template Pack ID: ${templatePackId}`);
    console.log(`   Document ID: ${documentId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Uncaught seed error:', error);
  process.exit(1);
});
