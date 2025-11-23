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

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Configuration
const INFISICAL_API_URL = process.env.INFISICAL_SITE_URL || 'https://infiscal.kucharz.net';

// Universal Auth credentials (machine identity)
const INFISICAL_CLIENT_ID = process.env.INFISICAL_CLIENT_ID || '';
const INFISICAL_CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET || '';

// Project ID (get from Infisical dashboard URL or API)
const PROJECT_ID = process.env.INFISICAL_PROJECT_ID || '';

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
  console.log('\n📋 Planning migration for DEVELOPMENT environment');
  const devSecrets = parseEnvFile('.env');
  
  // Add docker secrets
  const dockerSecrets = parseEnvFile('docker/.env');
  const dockerOnlySecrets = dockerSecrets.map(s => ({ ...s, folder: 'docker' }));
  devSecrets.push(...dockerOnlySecrets);
  
  plans.push({
    environment: 'dev',
    secrets: devSecrets,
  });
  console.log(`   Found ${devSecrets.length} secrets across ${new Set(devSecrets.map(s => s.folder)).size} folders`);

  // Staging environment (.env.staging)
  if (fs.existsSync('.env.staging')) {
    console.log('\n📋 Planning migration for STAGING environment');
    const stagingSecrets = parseEnvFile('.env.staging');
    plans.push({
      environment: 'staging',
      secrets: stagingSecrets,
    });
    console.log(`   Found ${stagingSecrets.length} secrets across ${new Set(stagingSecrets.map(s => s.folder)).size} folders`);
  }

  // Production environment (.env.production)
  if (fs.existsSync('.env.production')) {
    console.log('\n📋 Planning migration for PRODUCTION environment');
    const productionSecrets = parseEnvFile('.env.production');
    plans.push({
      environment: 'production',
      secrets: productionSecrets,
    });
    console.log(`   Found ${productionSecrets.length} secrets across ${new Set(productionSecrets.map(s => s.folder)).size} folders`);
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
 * Execute migration using Infisical SDK with Universal Auth
 */
async function executeMigration(plans: MigrationPlan[], dryRun: boolean): Promise<void> {
  console.log(`\n${dryRun ? '🔍 DRY RUN MODE' : '🚀 EXECUTING MIGRATION'}`);
  console.log(`API URL: ${INFISICAL_API_URL}`);
  console.log(`Project ID: ${PROJECT_ID}\n`);

  // Validate credentials
  if (!dryRun && (!INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET || !PROJECT_ID)) {
    console.error('❌ Missing required environment variables:');
    if (!INFISICAL_CLIENT_ID) console.error('   - INFISICAL_CLIENT_ID');
    if (!INFISICAL_CLIENT_SECRET) console.error('   - INFISICAL_CLIENT_SECRET');
    if (!PROJECT_ID) console.error('   - INFISICAL_PROJECT_ID');
    return;
  }

  // Initialize SDK client with Universal Auth
  let client: InfisicalSDK;
  
  if (!dryRun) {
    try {
      client = new InfisicalSDK({
        siteUrl: INFISICAL_API_URL,
      });
      
      // Authenticate using Universal Auth
      await client.auth().universalAuth.login({
        clientId: INFISICAL_CLIENT_ID,
        clientSecret: INFISICAL_CLIENT_SECRET,
      });
      
      console.log('✓ Authenticated with Infisical using Universal Auth\n');
    } catch (error) {
      console.error(`❌ Failed to authenticate with Infisical:`, error);
      return;
    }
  }

  for (const plan of plans) {
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

    // Group secrets by folder
    const secretsByFolder = plan.secrets.reduce((acc, secret) => {
      if (!acc[secret.folder]) acc[secret.folder] = [];
      acc[secret.folder].push(secret);
      return acc;
    }, {} as Record<string, Secret[]>);

    let totalSuccess = 0;
    let totalFailed = 0;

    // Create folders first
    console.log(`\n   📂 Creating folders...`);
    for (const [folderName] of Object.entries(secretsByFolder)) {
      const folderPath = FOLDERS[folderName as keyof typeof FOLDERS];
      try {
        await client!.folders().create({
          name: folderName,
          path: '/',
          projectId: PROJECT_ID,
          environment: plan.environment,
        });
        console.log(`   ✓ Created folder: ${folderPath}`);
      } catch (error: any) {
        if (error?.message?.includes('already exists')) {
          console.log(`   ℹ Folder already exists: ${folderPath}`);
        } else {
          console.error(`   ✗ Failed to create folder ${folderPath}: ${error?.message || String(error)}`);
        }
      }
    }

    // Push secrets by folder
    for (const [folderName, secrets] of Object.entries(secretsByFolder)) {
      const folderPath = FOLDERS[folderName as keyof typeof FOLDERS];
      console.log(`\n   📁 Pushing secrets to: ${folderPath}`);

      for (const secret of secrets) {
        try {
          // Use the secrets().createSecret() method with correct parameters
          await client!.secrets().createSecret(secret.key, {
            projectId: PROJECT_ID,
            environment: plan.environment,
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
  if (!INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET) {
    console.error('❌ Universal Auth credentials not configured');
    console.log('\nPlease set environment variables:');
    console.log('  INFISICAL_CLIENT_ID       (from machine identity)');
    console.log('  INFISICAL_CLIENT_SECRET   (from machine identity)');
    console.log('\nTo get credentials:');
    console.log('1. Go to https://infiscal.kucharz.net');
    console.log('2. Organization Settings > Access Control > Machine Identities');
    console.log('3. Create or select an identity');
    console.log('4. Configure Universal Auth and copy Client ID/Secret');
    console.log('5. Grant the identity access to "emergent" project (all environments)');
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
