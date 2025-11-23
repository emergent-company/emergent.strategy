#!/usr/bin/env tsx
/**
 * Consolidate zitadel.env into Infisical
 * Adds missing Zitadel variables from zitadel.env to Infisical /workspace folder
 * 
 * Usage:
 *   npm run consolidate-zitadel
 *   npm run consolidate-zitadel -- --dry-run
 */

import { InfisicalSDK } from '@infisical/sdk';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Configuration
const INFISICAL_API_URL = process.env.INFISICAL_SITE_URL || 'https://infiscal.kucharz.net';
const INFISICAL_CLIENT_ID = process.env.INFISICAL_CLIENT_ID || '';
const INFISICAL_CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET || '';
const PROJECT_ID = process.env.INFISICAL_PROJECT_ID || '';
const ENVIRONMENT = 'dev';
const FOLDER_PATH = '/workspace';

// Missing variables from zitadel.env that need to be added to Infisical
const MISSING_ZITADEL_VARS = [
  { key: 'ZITADEL_LOG_LEVEL', value: 'debug' },
  { key: 'ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_USERNAME', value: 'zitadel-admin-sa' },
  { key: 'ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINE_NAME', value: 'Bootstrap Admin Service Account' },
  { key: 'ZITADEL_FIRSTINSTANCE_ORG_MACHINE_MACHINEKEY_TYPE', value: '1' },
  { key: 'ZITADEL_FIRSTINSTANCE_PATPATH', value: '/machinekey/pat.txt' },
  { key: 'ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE', value: '2030-12-31T23:59:59Z' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🔧 Consolidating zitadel.env into Infisical');
  console.log('==========================================\n');
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Folder: ${FOLDER_PATH}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // Validate configuration
  if (!INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET || !PROJECT_ID) {
    console.error('❌ Missing required configuration:');
    if (!INFISICAL_CLIENT_ID) console.error('  - INFISICAL_CLIENT_ID');
    if (!INFISICAL_CLIENT_SECRET) console.error('  - INFISICAL_CLIENT_SECRET');
    if (!PROJECT_ID) console.error('  - INFISICAL_PROJECT_ID');
    console.error('\nMake sure these are set in .env.local');
    process.exit(1);
  }

  if (dryRun) {
    console.log('📋 Would add the following missing variables:\n');
    for (const secret of MISSING_ZITADEL_VARS) {
      console.log(`   ${secret.key} = ${secret.value}`);
    }
    console.log(`\n✅ Dry run complete. Run without --dry-run to apply changes.`);
    console.log('\n📝 After running this script:');
    console.log('   1. Remove env_file: ./zitadel.env from docker-compose.yml');
    console.log('   2. All Zitadel config will come from Infisical sidecar');
    return;
  }

  // Initialize SDK client
  let client: InfisicalSDK;
  
  try {
    client = new InfisicalSDK({
      siteUrl: INFISICAL_API_URL,
    });
    
    await client.auth().universalAuth.login({
      clientId: INFISICAL_CLIENT_ID,
      clientSecret: INFISICAL_CLIENT_SECRET,
    });
    
    console.log('✓ Authenticated with Infisical\n');
  } catch (error) {
    console.error(`❌ Failed to authenticate:`, error);
    process.exit(1);
  }

  // Add missing secrets
  console.log('📝 Adding missing Zitadel variables...\n');
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const secret of MISSING_ZITADEL_VARS) {
    try {
      // Try to create the secret
      await client.secrets().createSecret(secret.key, {
        projectId: PROJECT_ID,
        environment: ENVIRONMENT,
        secretValue: secret.value,
        secretPath: FOLDER_PATH,
        type: 'shared',
      });
      console.log(`   ✓ Created: ${secret.key} = ${secret.value}`);
      successCount++;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('already exists')) {
        console.log(`   ℹ Skipped (already exists): ${secret.key}`);
        skipCount++;
      } else {
        console.error(`   ✗ Failed: ${secret.key}: ${errorMsg}`);
        failCount++;
      }
    }
  }

  console.log(`\n==========================================`);
  console.log(`✅ Created: ${successCount}`);
  console.log(`ℹ  Skipped: ${skipCount}`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount}`);
  }
  
  const totalSecrets = successCount + skipCount;
  if (totalSecrets > 0) {
    console.log(`\n📊 Total Zitadel variables now in Infisical: ${totalSecrets + 31} (31 existing + ${totalSecrets} new)`);
  }
  
  console.log('\n📝 Next steps:');
  console.log('   1. Remove "- ./zitadel.env" from docker-compose.yml');
  console.log('   2. Restart infisical-secrets container');
  console.log('   3. Restart zitadel container');
  console.log('   4. All Zitadel config will now come from Infisical!');
}

main().catch(console.error);
