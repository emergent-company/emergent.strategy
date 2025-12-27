#!/usr/bin/env tsx
/**
 * Seed Email Templates
 *
 * Populates kb.email_templates with default templates from apps/server/templates/email/
 *
 * Usage: npx tsx scripts/seed-email-templates.ts [--force] [--dry-run]
 */

import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

const cwd = process.cwd();
const envFiles = [
  process.env.DOTENV_PATH || path.resolve(cwd, '.env'),
  path.resolve(cwd, '.env.local'),
];
for (const envPath of envFiles) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[seed-email-templates] Loaded environment from ${envPath}`);
  }
}
console.log();

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

const TEMPLATES_DIR = path.resolve(
  process.cwd(),
  'apps/server/templates/email'
);

interface TemplateVariable {
  name: string;
  type: 'string' | 'url' | 'date' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
}

interface TemplateDefinition {
  name: string;
  description: string;
  filename: string;
  subjectTemplate: string;
  variables: TemplateVariable[];
  sampleData: Record<string, any>;
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    name: 'invitation',
    description:
      'Email sent when a user is invited to join an organization. Includes invite link and optional custom message.',
    filename: 'invitation.mjml.hbs',
    subjectTemplate: "You've been invited to join {{organizationName}}",
    variables: [
      {
        name: 'recipientName',
        type: 'string',
        description: 'Name of the person being invited',
        required: false,
      },
      {
        name: 'inviterName',
        type: 'string',
        description: 'Name of the person sending the invite',
        required: true,
      },
      {
        name: 'organizationName',
        type: 'string',
        description: 'Name of the organization',
        required: true,
      },
      {
        name: 'inviteUrl',
        type: 'url',
        description: 'URL to accept the invitation',
        required: true,
      },
      {
        name: 'message',
        type: 'string',
        description: 'Custom message from inviter',
        required: false,
      },
      {
        name: 'expiresAt',
        type: 'date',
        description: 'Invitation expiration date',
        required: false,
      },
    ],
    sampleData: {
      recipientName: 'John Doe',
      inviterName: 'Jane Smith',
      organizationName: 'Acme Corp',
      inviteUrl: 'https://app.emergent.dev/invite/abc123',
      message: 'Looking forward to having you on the team!',
      expiresAt: '2025-01-31',
    },
  },
  {
    name: 'welcome',
    description:
      'Welcome email sent on first login. Introduces the platform features and provides a link to the dashboard.',
    filename: 'welcome.mjml.hbs',
    subjectTemplate: 'Welcome to Emergent!',
    variables: [
      {
        name: 'recipientName',
        type: 'string',
        description: 'Name of the user (can be empty)',
        required: false,
      },
      {
        name: 'dashboardUrl',
        type: 'url',
        description: 'URL to the main dashboard',
        required: true,
      },
      {
        name: 'organizationName',
        type: 'string',
        description: "Name of the user's organization",
        required: false,
      },
    ],
    sampleData: {
      recipientName: 'John Doe',
      dashboardUrl: 'https://app.emergent.dev/dashboard',
      organizationName: 'Acme Corp',
    },
  },
  {
    name: 'release-notification',
    description:
      'Email sent to notify users of new platform releases. Includes changelog with features, improvements, bug fixes, and breaking changes.',
    filename: 'release-notification.mjml.hbs',
    subjectTemplate: 'Emergent {{version}} Released',
    variables: [
      {
        name: 'version',
        type: 'string',
        description: 'Release version (e.g., "v2024.12.19")',
        required: true,
      },
      {
        name: 'releaseDate',
        type: 'string',
        description: 'Date of the release (formatted string)',
        required: true,
      },
      {
        name: 'releaseUrl',
        type: 'url',
        description: 'URL to view the full release notes',
        required: true,
      },
      {
        name: 'changelog',
        type: 'object',
        description:
          'Object containing categorized changes: features, improvements, bugFixes, breakingChanges (each an array of {title, description})',
        required: true,
      },
      {
        name: 'commitCount',
        type: 'string',
        description: 'Number of commits in this release',
        required: true,
      },
      {
        name: 'fromCommit',
        type: 'string',
        description: 'Short SHA of the starting commit',
        required: true,
      },
      {
        name: 'toCommit',
        type: 'string',
        description: 'Short SHA of the ending commit',
        required: true,
      },
      {
        name: 'recipientName',
        type: 'string',
        description: 'Name of the recipient',
        required: false,
      },
      {
        name: 'summary',
        type: 'string',
        description: 'Brief summary paragraph from LLM',
        required: false,
      },
    ],
    sampleData: {
      version: 'v2024.12.19',
      releaseDate: 'December 19, 2024',
      releaseUrl: 'https://app.emergent.dev/releases/v2024.12.19',
      changelog: {
        features: [
          {
            title: 'Email Template Management',
            description:
              'Superadmins can now customize email templates from the admin UI',
          },
          {
            title: 'Dark Mode Support',
            description: 'Added dark mode theme toggle in user preferences',
          },
        ],
        improvements: [
          {
            title: 'Faster Document Processing',
            description: 'Improved extraction pipeline performance by 40%',
          },
        ],
        bugFixes: [
          {
            title: 'Fixed Login Redirect',
            description:
              'Users are now correctly redirected after authentication',
          },
        ],
        breakingChanges: [],
      },
      commitCount: '47',
      fromCommit: 'abc1234',
      toCommit: 'def5678',
      recipientName: 'John Doe',
      summary:
        'This release focuses on admin customization features and performance improvements.',
    },
  },
];

function buildPool(): Pool {
  validateEnvVars(DB_REQUIREMENTS);
  const dbConfig = getDbConfig();

  return new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
  });
}

function readTemplateFile(filename: string): string {
  const filePath = path.join(TEMPLATES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

async function templateExists(
  pool: Pool,
  name: string
): Promise<{ exists: boolean; isCustomized: boolean; id?: string }> {
  const result = await pool.query(
    `SELECT id, is_customized FROM kb.email_templates WHERE name = $1`,
    [name]
  );
  if (result.rows.length === 0) {
    return { exists: false, isCustomized: false };
  }
  return {
    exists: true,
    isCustomized: result.rows[0].is_customized,
    id: result.rows[0].id,
  };
}

async function upsertTemplate(
  pool: Pool,
  template: TemplateDefinition,
  mjmlContent: string,
  forceUpdate: boolean
): Promise<{ action: 'created' | 'updated' | 'skipped'; id?: string }> {
  const existing = await templateExists(pool, template.name);

  if (existing.exists && existing.isCustomized && !forceUpdate) {
    console.log(
      `  ⚠️  Skipping "${template.name}" (customized, use --force to overwrite)`
    );
    return { action: 'skipped', id: existing.id };
  }

  if (existing.exists) {
    await pool.query(
      `
      UPDATE kb.email_templates
      SET description = $2,
          subject_template = $3,
          mjml_content = $4,
          variables = $5,
          sample_data = $6,
          is_customized = false,
          updated_at = NOW()
      WHERE name = $1
    `,
      [
        template.name,
        template.description,
        template.subjectTemplate,
        mjmlContent,
        JSON.stringify(template.variables),
        JSON.stringify(template.sampleData),
      ]
    );

    const versionResult = await pool.query(
      `
      INSERT INTO kb.email_template_versions (
        template_id,
        version_number,
        subject_template,
        mjml_content,
        variables,
        sample_data,
        change_summary
      )
      SELECT
        id,
        COALESCE((SELECT MAX(version_number) FROM kb.email_template_versions WHERE template_id = et.id), 0) + 1,
        $2,
        $3,
        $4,
        $5,
        'Reset from file-based template via seed script'
      FROM kb.email_templates et
      WHERE et.name = $1
      RETURNING id
    `,
      [
        template.name,
        template.subjectTemplate,
        mjmlContent,
        JSON.stringify(template.variables),
        JSON.stringify(template.sampleData),
      ]
    );

    if (versionResult.rows.length > 0) {
      await pool.query(
        `UPDATE kb.email_templates SET current_version_id = $2 WHERE name = $1`,
        [template.name, versionResult.rows[0].id]
      );
    }

    console.log(`  ✅ Updated "${template.name}"`);
    return { action: 'updated', id: existing.id };
  }

  const insertResult = await pool.query(
    `
    INSERT INTO kb.email_templates (
      name,
      description,
      subject_template,
      mjml_content,
      variables,
      sample_data,
      is_customized
    )
    VALUES ($1, $2, $3, $4, $5, $6, false)
    RETURNING id
  `,
    [
      template.name,
      template.description,
      template.subjectTemplate,
      mjmlContent,
      JSON.stringify(template.variables),
      JSON.stringify(template.sampleData),
    ]
  );

  const templateId = insertResult.rows[0].id;

  const versionResult = await pool.query(
    `
    INSERT INTO kb.email_template_versions (
      template_id,
      version_number,
      subject_template,
      mjml_content,
      variables,
      sample_data,
      change_summary
    )
    VALUES ($1, 1, $2, $3, $4, $5, 'Initial template from seed script')
    RETURNING id
  `,
    [
      templateId,
      template.subjectTemplate,
      mjmlContent,
      JSON.stringify(template.variables),
      JSON.stringify(template.sampleData),
    ]
  );

  await pool.query(
    `UPDATE kb.email_templates SET current_version_id = $2 WHERE id = $1`,
    [templateId, versionResult.rows[0].id]
  );

  console.log(`  ✅ Created "${template.name}"`);
  return { action: 'created', id: templateId };
}

async function main() {
  console.log('=== Email Template Seeding ===\n');
  console.log('Configuration:');
  console.log(`  Templates directory: ${TEMPLATES_DIR}`);
  console.log(`  Force overwrite: ${force ? 'YES' : 'NO'}`);
  console.log(`  Dry run: ${dryRun ? 'YES' : 'NO'}`);
  console.log();

  if (!fs.existsSync(TEMPLATES_DIR)) {
    console.error(`Error: Templates directory not found: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  console.log('Verifying template files...');
  for (const template of TEMPLATE_DEFINITIONS) {
    const filePath = path.join(TEMPLATES_DIR, template.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: Template file not found: ${filePath}`);
      process.exit(1);
    }
    console.log(`  ✓ ${template.filename}`);
  }
  console.log();

  if (dryRun) {
    console.log('DRY RUN - Templates that would be seeded:\n');
    for (const template of TEMPLATE_DEFINITIONS) {
      const mjmlContent = readTemplateFile(template.filename);
      console.log(`  ${template.name}`);
      console.log(`    Description: ${template.description}`);
      console.log(`    Subject: ${template.subjectTemplate}`);
      console.log(`    Variables: ${template.variables.length}`);
      console.log(`    MJML size: ${mjmlContent.length} bytes`);
      console.log();
    }
    console.log('No database changes made (dry run mode)');
    return;
  }

  console.log('Connecting to database...');
  const pool = buildPool();

  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'kb'
        AND table_name = 'email_templates'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.error(
        'Error: kb.email_templates table does not exist. Run migrations first.'
      );
      console.error('  npm run db:migrate');
      process.exit(1);
    }
    console.log('  ✓ Connected\n');

    console.log('Seeding templates...');
    const results = { created: 0, updated: 0, skipped: 0 };

    for (const template of TEMPLATE_DEFINITIONS) {
      const mjmlContent = readTemplateFile(template.filename);
      const result = await upsertTemplate(pool, template, mjmlContent, force);
      results[result.action]++;
    }

    console.log('\n=== Summary ===\n');
    console.log(`  Created: ${results.created}`);
    console.log(`  Updated: ${results.updated}`);
    console.log(`  Skipped: ${results.skipped}`);
    console.log();

    if (results.created + results.updated > 0) {
      console.log('✓ Email templates seeded successfully!');
    } else if (results.skipped > 0) {
      console.log('⚠️  Some templates were skipped (already customized).');
      console.log('   Use --force to overwrite customized templates.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
