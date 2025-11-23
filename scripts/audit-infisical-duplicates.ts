#!/usr/bin/env tsx
/**
 * Audit and Fix Infisical secrets organization
 * 
 * This script:
 * 1. Fetches all secrets from all folders in Infisical (dev environment)
 * 2. Identifies variables that exist in multiple folders (duplicates)
 * 3. Identifies variables in wrong folders (misplaced)
 * 4. Automatically fixes issues: moves variables to correct folders, removes duplicates
 * 
 * Usage:
 *   npm run audit-infisical-duplicates               # Audit only (dry-run)
 *   npm run audit-infisical-duplicates -- --fix      # Fix issues automatically
 */

import { InfisicalSDK } from '@infisical/sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load local Infisical credentials
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const INFISICAL_SITE_URL = process.env.INFISICAL_SITE_URL;
const INFISICAL_CLIENT_ID = process.env.INFISICAL_CLIENT_ID;
const INFISICAL_CLIENT_SECRET = process.env.INFISICAL_CLIENT_SECRET;
const INFISICAL_PROJECT_ID = process.env.INFISICAL_PROJECT_ID;

if (!INFISICAL_SITE_URL || !INFISICAL_CLIENT_ID || !INFISICAL_CLIENT_SECRET || !INFISICAL_PROJECT_ID) {
  console.error('❌ Missing Infisical credentials in .env.local');
  console.error('Required: INFISICAL_SITE_URL, INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID');
  process.exit(1);
}

const FOLDERS = ['/workspace', '/server', '/admin', '/docker'];
const ENVIRONMENT = 'dev';

// Check if --fix flag is provided
const shouldFix = process.argv.includes('--fix');

interface SecretLocation {
  folder: string;
  value: string;
}

interface MigrationAction {
  type: 'move' | 'delete' | 'create';
  key: string;
  value: string;
  fromFolder?: string;
  toFolder?: string;
  reason: string;
}

async function main() {
  console.log('🔍 Auditing Infisical secrets organization...\n');
  
  if (shouldFix) {
    console.log('🔧 FIX MODE: Will automatically fix issues\n');
  } else {
    console.log('👀 AUDIT MODE: Will only report issues (use --fix to apply changes)\n');
  }

  // Initialize SDK
  const client = new InfisicalSDK({
    siteUrl: INFISICAL_SITE_URL,
  });

  // Authenticate
  await client.auth().universalAuth.login({
    clientId: INFISICAL_CLIENT_ID,
    clientSecret: INFISICAL_CLIENT_SECRET,
  });

  console.log('✅ Authenticated with Infisical\n');

  // Fetch secrets from all folders
  const secretsByFolder: Record<string, Record<string, string>> = {};
  
  // First, get ALL secrets recursively
  try {
    const allSecretsResponse = await client.secrets().listSecrets({
      projectId: INFISICAL_PROJECT_ID,
      environment: ENVIRONMENT,
      path: '/',
      recursive: true,
    });

    // Initialize folder buckets
    for (const folder of FOLDERS) {
      secretsByFolder[folder] = {};
    }

    // Group secrets by their secretPath
    const secrets = allSecretsResponse.secrets || [];
    for (const secret of secrets) {
      const folder = secret.secretPath || '/';
      if (!secretsByFolder[folder]) {
        secretsByFolder[folder] = {};
      }
      secretsByFolder[folder][secret.secretKey] = secret.secretValue;
    }

    // Report counts
    for (const folder of FOLDERS) {
      const count = Object.keys(secretsByFolder[folder] || {}).length;
      console.log(`📁 ${folder}: ${count} secrets`);
    }
  } catch (error: any) {
    console.error('Error fetching secrets:', error.message);
    for (const folder of FOLDERS) {
      secretsByFolder[folder] = {};
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Build map of variable -> locations
  const variableLocations: Record<string, SecretLocation[]> = {};

  for (const folder of FOLDERS) {
    for (const [key, value] of Object.entries(secretsByFolder[folder])) {
      if (!variableLocations[key]) {
        variableLocations[key] = [];
      }
      variableLocations[key].push({ folder, value });
    }
  }

  // Identify duplicates
  const duplicates = Object.entries(variableLocations)
    .filter(([_, locations]) => locations.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));

  if (duplicates.length === 0) {
    console.log('✅ No duplicate variables found!\n');
  } else {
    console.log(`⚠️  Found ${duplicates.length} duplicate variables:\n`);

    for (const [key, locations] of duplicates) {
      console.log(`\n📌 ${key}`);
      
      // Check if values are different
      const values = new Set(locations.map(loc => loc.value));
      if (values.size > 1) {
        console.log('   ⚠️  CONFLICT: Different values in different folders!');
      }
      
      for (const loc of locations) {
        const preview = loc.value.length > 50 
          ? loc.value.substring(0, 47) + '...' 
          : loc.value;
        console.log(`   - ${loc.folder}: ${preview}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Categorize variables by recommended location
  const sharedInfrastructure = [
    'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB',
    'NAMESPACE', 'ADMIN_PORT', 'SERVER_PORT',
    'ZITADEL_DOMAIN', 'ZITADEL_HTTP_PORT', 'ZITADEL_LOGIN_PORT', 'ZITADEL_MASTERKEY',
    'ZITADEL_EXTERNALDOMAIN', 'ZITADEL_EXTERNALSECURE', 'ZITADEL_TLS_ENABLED',
    'ZITADEL_DATABASE_POSTGRES_HOST', 'ZITADEL_DATABASE_POSTGRES_PORT',
    'ZITADEL_DATABASE_POSTGRES_DATABASE', 'ZITADEL_DATABASE_POSTGRES_USER_USERNAME',
    'ZITADEL_DATABASE_POSTGRES_USER_PASSWORD', 'ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE',
    'ZITADEL_FIRSTINSTANCE_ORG_NAME', 'ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME',
    'ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD', 'ZITADEL_FIRSTINSTANCE_LOGINCLIENTPATPATH',
    'ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_REQUIRED', 'ZITADEL_DEFAULTINSTANCE_FEATURES_LOGINV2_BASEURI',
    'ZITADEL_OIDC_DEFAULTLOGINURLV2', 'ZITADEL_OIDC_DEFAULTLOGOUTURLV2',
    'ZITADEL_ISSUER', 'ZITADEL_CLIENT_ID', 'ZITADEL_REDIRECT_URI', 'ZITADEL_PASSWORD_GRANT', 'ZITADEL_PAT',
    'COMPOSE_PROJECT_NAME', 'DB_CONTAINER_NAME',
    'LANGSMITH_TRACING', 'LANGSMITH_ENDPOINT', 'LANGSMITH_PROJECT',
    'E2E_AUTH_TOKEN', 'E2E_DEBUG_CHAT', 'E2E_REAL_LOGIN', 'E2E_OIDC_EMAIL', 'E2E_OIDC_PASSWORD',
    'E2E_BASE_URL', 'E2E_OIDC_BAD_PASSWORD',
  ];

  const serverSpecific = [
    'ZITADEL_ORG_ID', 'ZITADEL_PROJECT_ID', 'ZITADEL_API_CLIENT_ID',
    'ZITADEL_OAUTH_CLIENT_ID', 'ZITADEL_OAUTH_REDIRECT_URI',
    'ZITADEL_API_APP_JWT_PATH', 'ZITADEL_CLIENT_JWT_PATH', 'ZITADEL_API_JWT_PATH',
    'GCP_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION',
    'VERTEX_AI_MODEL', 'VERTEX_AI_LOCATION', 'VERTEX_AI_PROJECT_ID',
    'VERTEX_EMBEDDING_MODEL', 'VERTEX_EMBEDDING_PROJECT', 'VERTEX_EMBEDDING_LOCATION',
    'EMBEDDING_PROVIDER', 'EXTRACTION_WORKER_ENABLED', 'EXTRACTION_RATE_LIMIT_RPM', 'EXTRACTION_RATE_LIMIT_TPM',
    'EXTRACTION_ENTITY_LINKING_STRATEGY', 'EXTRACTION_CONFIDENCE_THRESHOLD_MIN',
    'EXTRACTION_WORKER_POLL_INTERVAL_MS', 'EXTRACTION_WORKER_BATCH_SIZE',
    'INTEGRATION_ENCRYPTION_KEY', 'ORGS_DEMO_SEED', 'SCOPES_DISABLED', 'CHAT_MODEL_ENABLED',
    'GOOGLE_REDIRECT_URL', 'DEBUG_TENANT', 'DISABLE_ZITADEL_INTROSPECTION', 'SKIP_DB',
    'AUTH_ISSUER', 'AUTH_JWKS_URI',
  ];

  const adminSpecific = [
    'VITE_AUTH_MODE', 'VITE_ZITADEL_CLIENT_ID', 'VITE_ZITADEL_ISSUER',
    'VITE_ZITADEL_REDIRECT_URI', 'VITE_ZITADEL_POST_LOGOUT_REDIRECT_URI', 'VITE_ZITADEL_SCOPES',
  ];

  // Generate migration actions
  console.log('📋 ANALYZING REQUIRED CHANGES:\n');

  const actions: MigrationAction[] = [];
  const misplacedVariables: { key: string; currentFolder: string; recommendedFolder: string }[] = [];

  for (const [key, locations] of Object.entries(variableLocations)) {
    let recommendedFolder = '/workspace'; // default
    
    if (serverSpecific.includes(key)) {
      recommendedFolder = '/server';
    } else if (adminSpecific.includes(key)) {
      recommendedFolder = '/admin';
    } else if (sharedInfrastructure.includes(key)) {
      recommendedFolder = '/workspace';
    }

    // Check for duplicates
    if (locations.length > 1) {
      // Keep the one in the recommended folder, delete others
      const correctLocation = locations.find(loc => loc.folder === recommendedFolder);
      const value = correctLocation?.value || locations[0].value;

      for (const loc of locations) {
        if (loc.folder !== recommendedFolder) {
          // Delete duplicate from wrong folder
          actions.push({
            type: 'delete',
            key,
            value: loc.value,
            fromFolder: loc.folder,
            reason: `Duplicate - should only exist in ${recommendedFolder}`,
          });
        }
      }

      // If no copy exists in recommended folder, move one
      if (!correctLocation) {
        actions.push({
          type: 'create',
          key,
          value,
          toFolder: recommendedFolder,
          reason: `Creating in correct folder ${recommendedFolder}`,
        });
      }
    } else {
      // Single location - check if it's in wrong folder
      const loc = locations[0];
      if (loc.folder !== recommendedFolder) {
        misplacedVariables.push({
          key,
          currentFolder: loc.folder,
          recommendedFolder,
        });

        actions.push({
          type: 'move',
          key,
          value: loc.value,
          fromFolder: loc.folder,
          toFolder: recommendedFolder,
          reason: `Should be in ${recommendedFolder} (currently in ${loc.folder})`,
        });
      }
    }
  }

  // Group actions by type
  const moveActions = actions.filter(a => a.type === 'move');
  const deleteActions = actions.filter(a => a.type === 'delete');
  const createActions = actions.filter(a => a.type === 'create');

  console.log(`\n📊 ACTIONS REQUIRED:\n`);
  console.log(`   Moves: ${moveActions.length} (variable in wrong folder)`);
  console.log(`   Deletes: ${deleteActions.length} (duplicate to remove)`);
  console.log(`   Creates: ${createActions.length} (missing in correct folder)`);
  console.log(`   Total: ${actions.length} actions`);

  if (actions.length === 0) {
    console.log('\n✅ All variables are correctly organized!\n');
    return;
  }

  // Show what will be done
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📝 ACTION PLAN:\n');

  if (deleteActions.length > 0) {
    console.log(`\n🗑️  DELETE (${deleteActions.length} duplicates):`);
    deleteActions.forEach(action => {
      console.log(`   • ${action.key} from ${action.fromFolder}`);
    });
  }

  if (moveActions.length > 0) {
    console.log(`\n📦 MOVE (${moveActions.length} misplaced):`);
    moveActions.forEach(action => {
      console.log(`   • ${action.key}: ${action.fromFolder} → ${action.toFolder}`);
    });
  }

  if (createActions.length > 0) {
    console.log(`\n➕ CREATE (${createActions.length} missing):`);
    createActions.forEach(action => {
      console.log(`   • ${action.key} in ${action.toFolder}`);
    });
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Execute if --fix flag is provided
  if (!shouldFix) {
    console.log('👀 AUDIT COMPLETE - No changes made\n');
    console.log('💡 To apply these changes, run:');
    console.log('   npm run audit-infisical-duplicates -- --fix\n');
    return;
  }

  // Execute the actions
  console.log('🔧 EXECUTING CHANGES...\n');

  let successCount = 0;
  let errorCount = 0;

  // 1. Delete duplicates first
  for (const action of deleteActions) {
    try {
      await client.secrets().deleteSecret(action.key, {
        projectId: INFISICAL_PROJECT_ID,
        environment: ENVIRONMENT,
        secretPath: action.fromFolder!,
      });
      console.log(`   ✓ Deleted ${action.key} from ${action.fromFolder}`);
      successCount++;
    } catch (error: any) {
      console.error(`   ✗ Failed to delete ${action.key} from ${action.fromFolder}: ${error.message}`);
      errorCount++;
    }
  }

  // 2. Create missing secrets in correct folders
  for (const action of createActions) {
    try {
      await client.secrets().createSecret(action.key, {
        projectId: INFISICAL_PROJECT_ID,
        environment: ENVIRONMENT,
        secretValue: action.value,
        secretPath: action.toFolder!,
        type: 'shared',
      });
      console.log(`   ✓ Created ${action.key} in ${action.toFolder}`);
      successCount++;
    } catch (error: any) {
      console.error(`   ✗ Failed to create ${action.key} in ${action.toFolder}: ${error.message}`);
      errorCount++;
    }
  }

  // 3. Move misplaced secrets (create in new location, then delete from old)
  for (const action of moveActions) {
    try {
      // Create in new location
      await client.secrets().createSecret(action.key, {
        projectId: INFISICAL_PROJECT_ID,
        environment: ENVIRONMENT,
        secretValue: action.value,
        secretPath: action.toFolder!,
        type: 'shared',
      });

      // Delete from old location
      await client.secrets().deleteSecret(action.key, {
        projectId: INFISICAL_PROJECT_ID,
        environment: ENVIRONMENT,
        secretPath: action.fromFolder!,
      });

      console.log(`   ✓ Moved ${action.key}: ${action.fromFolder} → ${action.toFolder}`);
      successCount++;
    } catch (error: any) {
      console.error(`   ✗ Failed to move ${action.key}: ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📊 EXECUTION SUMMARY:\n');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   Total actions: ${actions.length}\n`);

  if (errorCount === 0) {
    console.log('✨ All changes applied successfully!\n');
    console.log('💡 Next steps:');
    console.log('   1. Verify secrets in Infisical dashboard');
    console.log('   2. Test applications can access variables from new locations');
    console.log('   3. Update .env.example files to reflect new structure\n');
  } else {
    console.log('⚠️  Some changes failed. Review errors above.\n');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
