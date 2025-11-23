#!/usr/bin/env tsx
/**
 * Migrate secrets from .env files to Infisical using SDK
 * 
 * Project: Emergent
 * 
 * Usage:
 *   npm run migrate-secrets -- --env=dev
 *   npm run migrate-secrets:dry-run -- --env=dev
 */

import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { InfisicalSDK } from '@infisical/sdk';

// Configuration
const INFISICAL_API_URL = process.env.INFISICAL_SITE_URL || 'https://infiscal.kucharz.net';

// Service tokens for each environment
const SERVICE_TOKENS = {
  dev: process.env.INFISICAL_TOKEN_DEV || '',
  staging: process.env.INFISICAL_TOKEN_STAGING || '',
  production: process.env.INFISICAL_TOKEN_PRODUCTION || '',
};

// Infisical folder structure
const FOLDERS = {
  workspace: '/workspace',
  server: '/server',
  admin: '/admin',
  docker: '/docker',
};

// Variables to exclude from migration (Infisical bootstrap credentials)
const EXCLUDED_VARS = [
  'INFISICAL_TOKEN',
  'INFISICAL_TOKEN_DEV',
  'INFISICAL_TOKEN_STAGING',
  'INFISICAL_TOKEN_PRODUCTION',
  'INFISICAL_SITE_URL',
];

interface Secret {
  key: string;
  value: string;
  folder: string;
}

interface MigrationPlan {
  environment: string;
  serviceToken: string;
  secrets: Secret[];
}

/**
 * Categorize variable by folder
 */
function categorizeVar(key: string): string {
  // Admin variables (VITE_* prefix)
  if (key.startsWith('VITE_')) {
    return 'admin';
  }
  
  // Docker/Zitadel variables
  if (key.startsWith('ZITADEL_') || key.startsWith('COMPOSE_') || key === 'DB_CONTAINER_NAME') {
    return 'docker';
  }
  
  // Server variables (database, APIs, secrets)
  if (key.startsWith('POSTGRES_') || key.includes('SECRET') || key.includes('API_KEY') || 
      key.endsWith('_TOKEN') || key.startsWith('DATABASE_') || key === 'GOOGLE_APPLICATION_CREDENTIALS' ||
      key.includes('VERTEX_') || key.includes('LANGSMITH_') || key.includes('CLICKUP_')) {
    return 'server';
  }
  
  // Workspace variables (everything else - shared config)
  return 'workspace';
}

/**
 * Parse .env file and categorize secrets by folder
 */
function parseEnvFile(filePath: string): Secret[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  File not found: ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = dotenv.parse(content);
  const secrets: Secret[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    // Skip excluded variables
    if (EXCLUDED_VARS.includes(key)) {
      console.log(`   ⊘ Skipping bootstrap variable: ${key}`);
      continue;
    }

    const folder = categorizeVar(key);

    secrets.push({
      key,
      value,
      folder,
    });
  }

  return secrets;
}

/**
 * Create migration plan from environment files
 */
function createMigrationPlan(): MigrationPlan[] {
  const plans: MigrationPlan[] = [];

  // Development environment (.env)
  if (SERVICE_TOKENS.dev) {
    console.log('\n📋 Planning migration for DEVELOPMENT environment');
    const secrets = parseEnvFile('.env');
    
    // Add docker secrets
    const dockerSecrets = parseEnvFile('docker/.env');
    const dockerOnlySecrets = dockerSecrets.map(s => ({ ...s, folder: 'docker' }));
    secrets.push(...dockerOnlySecrets);
    
    plans.push({
      environment: 'dev',
      serviceToken: SERVICE_TOKENS.dev,
      secrets,
    });
    console.log(`   Found ${secrets.length} secrets across ${new Set(secrets.map(s => s.folder)).size} folders`);
  }

  // Staging environment (.env.staging)
  if (SERVICE_TOKENS.staging) {
    console.log('\n📋 Planning migration for STAGING environment');
    const secrets = parseEnvFile('.env.staging');
    plans.push({
      environment: 'staging',
      serviceToken: SERVICE_TOKENS.staging,
      secrets,
    });
    console.log(`   Found ${secrets.length} secrets across ${new Set(secrets.map(s => s.folder)).size} folders`);
  }

  // Production environment (.env.production)
  if (SERVICE_TOKENS.production) {
    console.log('\n📋 Planning migration for PRODUCTION environment');
    const secrets = parseEnvFile('.env.production');
    plans.push({
      environment: 'production',
      serviceToken: SERVICE_TOKENS.production,
      secrets,
    });
    console.log(`   Found ${secrets.length} secrets across ${new Set(secrets.map(s => s.folder)).size} folders`);
  }

  return plans;
}

/**
 * Display migration summary
 */
function displaySummary(plans: MigrationPlan[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('MIGRATION SUMMARY - Project: emergent');
  console.log('='.repeat(80));

  for (const plan of plans) {
    console.log(`\n${plan.environment.toUpperCase()} Environment:`);
    console.log(`  Service Token: ${plan.serviceToken ? '✓ Configured' : '✗ Missing'}`);
    console.log(`  Total Secrets: ${plan.secrets.length}`);
    
    const byFolder = plan.secrets.reduce((acc, s) => {
      acc[s.folder] = (acc[s.folder] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('  By Folder:');
    for (const [folder, count] of Object.entries(byFolder)) {
      console.log(`    ${FOLDERS[folder as keyof typeof FOLDERS]}: ${count} secrets`);
    }
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Execute migration using Infisical SDK
 */
async function executeMigration(plans: MigrationPlan[], dryRun: boolean): Promise<void> {
  console.log(`\n${dryRun ? '🔍 DRY RUN MODE' : '🚀 EXECUTING MIGRATION'}`);
  console.log(`API URL: ${INFISICAL_API_URL}`);
  console.log(`Project: emergent\n`);

  for (const plan of plans) {
    if (!plan.serviceToken) {
      console.error(`❌ No service token configured for ${plan.environment} environment`);
      continue;
    }

    console.log(`\n📦 Migrating ${plan.environment.toUpperCase()} environment (${plan.secrets.length} secrets)`);

    if (dryRun) {
      // Group secrets by folder for display
      const secretsByFolder = plan.secrets.reduce((acc, secret) => {
        if (!acc[secret.folder]) acc[secret.folder] = [];
        acc[secret.folder].push(secret);
        return acc;
      }, {} as Record<string, Secret[]>);

      for (const [folderName, secrets] of Object.entries(secretsByFolder)) {
        console.log(`\n   📁 Folder: ${FOLDERS[folderName as keyof typeof FOLDERS]}`);
        for (const secret of secrets) {
          console.log(`   [DRY RUN] Would push: ${secret.key}`);
        }
      }
      console.log(`\n   ✅ Would migrate: ${plan.secrets.length} secrets`);
      continue;
    }

    // Initialize SDK client for this environment
    let client: InfisicalSDK;
    try {
      client = new InfisicalSDK({
        siteUrl: INFISICAL_API_URL,
        auth: {
          serviceToken: plan.serviceToken,
        },
      });
    } catch (error) {
      console.error(`❌ Failed to initialize Infisical SDK:`, error);
      continue;
    }

    // Group secrets by folder
    const secretsByFolder = plan.secrets.reduce((acc, secret) => {
      if (!acc[secret.folder]) acc[secret.folder] = [];
      acc[secret.folder].push(secret);
      return acc;
    }, {} as Record<string, Secret[]>);

    let totalSuccess = 0;
    let totalFailed = 0;

    // Push secrets by folder
    for (const [folderName, secrets] of Object.entries(secretsByFolder)) {
      const folderPath = FOLDERS[folderName as keyof typeof FOLDERS];
      console.log(`\n   📁 Folder: ${folderPath}`);

      for (const secret of secrets) {
        try {
          await client.createSecret({
            secretName: secret.key,
            secretValue: secret.value,
            secretPath: folderPath,
            type: 'shared',
          });
          console.log(`   ✓ ${secret.key}`);
          totalSuccess++;
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          console.error(`   ✗ ${secret.key}: ${errorMsg}`);
          totalFailed++;
        }
      }
    }

    console.log(`\n   ✅ Success: ${totalSuccess}, ❌ Failed: ${totalFailed}`);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const specificEnv = args.find(arg => arg.startsWith('--env='))?.split('=')[1];

  console.log('🔐 Infisical Secret Migration Tool - Project: Emergent');
  console.log('='.repeat(80));

  // Validate configuration
  const hasAnyToken = SERVICE_TOKENS.dev || SERVICE_TOKENS.staging || SERVICE_TOKENS.production;
  if (!hasAnyToken) {
    console.error('❌ No Infisical service tokens configured');
    console.log('\nPlease set environment variables:');
    console.log('  INFISICAL_TOKEN_DEV       (for dev environment)');
    console.log('  INFISICAL_TOKEN_STAGING   (for staging environment)');
    console.log('  INFISICAL_TOKEN_PRODUCTION (for production environment)');
    console.log('\nTo get service tokens:');
    console.log('1. Go to https://infiscal.kucharz.net');
    console.log('2. Open project "emergent"');
    console.log('3. Go to Settings > Service Tokens');
    console.log('4. Create a token for each environment (dev/staging/production)');
    console.log('5. Copy the tokens and export them as environment variables');
    process.exit(1);
  }

  // Create migration plan
  let plans = createMigrationPlan();

  // Filter by specific environment if requested
  if (specificEnv) {
    plans = plans.filter(p => p.environment === specificEnv);
    if (plans.length === 0) {
      console.error(`❌ No plan found for environment: ${specificEnv}`);
      process.exit(1);
    }
  }

  // Display summary
  displaySummary(plans);

  // Confirm before proceeding (unless dry run)
  if (!dryRun) {
    console.log('\n⚠️  This will push secrets to your Infisical instance.');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Execute migration
  await executeMigration(plans, dryRun);

  console.log('\n✨ Migration complete!');
  
  if (dryRun) {
    console.log('\n💡 Run without --dry-run to actually migrate secrets');
  } else {
    console.log('\n💡 Next steps:');
    console.log('   1. Verify secrets in Infisical dashboard: https://infiscal.kucharz.net/project/emergent/secrets');
    console.log('   2. Test SDK integration with migrated secrets');
    console.log('   3. Update .env.example with Infisical bootstrap template');
  }
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
