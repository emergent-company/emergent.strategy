#!/usr/bin/env tsx
/**
 * Add missing Zitadel ADMIN secrets to Infisical
 * Also fix the POSTGRES_PORT from 5437 to 5432
 * 
 * Usage:
 *   npm run fix-zitadel-secrets
 *   npm run fix-zitadel-secrets -- --dry-run
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

// Secrets to add/update
const SECRETS_TO_FIX = [
  { key: 'ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME', value: 'spec' },
  { key: 'ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD', value: 'spec' },
  { key: 'ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE', value: 'disable' },
  { key: 'ZITADEL_DATABASE_POSTGRES_ADMIN_HOST', value: 'db' },
  { key: 'ZITADEL_DATABASE_POSTGRES_ADMIN_PORT', value: '5432' },
  { key: 'ZITADEL_DATABASE_POSTGRES_PORT', value: '5432' }, // Fix existing wrong value
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🔧 Fixing Zitadel secrets in Infisical');
  console.log('========================================\n');
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
    console.log('📋 Would update the following secrets:\n');
    for (const secret of SECRETS_TO_FIX) {
      console.log(`   ${secret.key} = ${secret.value}`);
    }
    console.log(`\n✅ Dry run complete. Run without --dry-run to apply changes.`);
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

  // Update/create secrets
  console.log('📝 Updating secrets...\n');
  let successCount = 0;
  let failCount = 0;

  for (const secret of SECRETS_TO_FIX) {
    try {
      // Try to update existing secret first
      try {
        await client.secrets().updateSecret(secret.key, {
          projectId: PROJECT_ID,
          environment: ENVIRONMENT,
          secretValue: secret.value,
          secretPath: FOLDER_PATH,
          type: 'shared',
        });
        console.log(`   ✓ Updated: ${secret.key} = ${secret.value}`);
        successCount++;
      } catch (updateError: any) {
        // If update fails, try to create
        if (updateError?.message?.includes('not found') || updateError?.message?.includes('does not exist')) {
          await client.secrets().createSecret(secret.key, {
            projectId: PROJECT_ID,
            environment: ENVIRONMENT,
            secretValue: secret.value,
            secretPath: FOLDER_PATH,
            type: 'shared',
          });
          console.log(`   ✓ Created: ${secret.key} = ${secret.value}`);
          successCount++;
        } else {
          throw updateError;
        }
      }
    } catch (error: any) {
      console.error(`   ✗ Failed: ${secret.key}: ${error?.message || String(error)}`);
      failCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`✅ Success: ${successCount}`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount}`);
  }
  console.log('\n🎉 Done! Restart Zitadel container to apply changes.');
}

main().catch(console.error);
