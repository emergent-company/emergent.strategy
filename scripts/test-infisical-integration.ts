#!/usr/bin/env tsx
/**
 * Test script to verify Infisical integration
 * This tests loading secrets from Infisical without starting the full server
 */

import { config } from 'dotenv';
import { InfisicalSDK } from '@infisical/sdk';

// Load .env files
config();
config({ path: '.env.local' });

interface TestResult {
  success: boolean;
  message: string;
  secretsLoaded?: number;
  error?: string;
}

async function testInfisicalConnection(): Promise<TestResult> {
  console.log('\n🔐 Testing Infisical Integration\n');
  console.log('Configuration:');
  console.log(`  INFISICAL_SITE_URL: ${process.env.INFISICAL_SITE_URL || '(not set)'}`);
  console.log(`  INFISICAL_PROJECT_ID: ${process.env.INFISICAL_PROJECT_ID || '(not set)'}`);
  console.log(`  INFISICAL_ENVIRONMENT: ${process.env.INFISICAL_ENVIRONMENT || 'dev'}`);
  console.log(`  INFISICAL_TOKEN_DEV: ${process.env.INFISICAL_TOKEN_DEV ? '✅ present' : '❌ missing'}`);
  console.log(`  INFISICAL_CLIENT_ID: ${process.env.INFISICAL_CLIENT_ID ? '✅ present' : '❌ missing'}`);
  console.log(`  INFISICAL_CLIENT_SECRET: ${process.env.INFISICAL_CLIENT_SECRET ? '✅ present' : '❌ missing'}`);
  console.log('');

  // Check required variables
  if (!process.env.INFISICAL_SITE_URL) {
    return {
      success: false,
      message: 'INFISICAL_SITE_URL is not set',
      error: 'Missing INFISICAL_SITE_URL environment variable'
    };
  }

  const hasServiceToken = !!process.env.INFISICAL_TOKEN_DEV;
  const hasUniversalAuth = !!process.env.INFISICAL_CLIENT_ID && !!process.env.INFISICAL_CLIENT_SECRET;
  
  if (!hasServiceToken && !hasUniversalAuth) {
    return {
      success: false,
      message: 'No authentication credentials found',
      error: 'Need either INFISICAL_TOKEN_DEV or (INFISICAL_CLIENT_ID + INFISICAL_CLIENT_SECRET)'
    };
  }

  if (!process.env.INFISICAL_PROJECT_ID) {
    return {
      success: false,
      message: 'INFISICAL_PROJECT_ID is not set',
      error: 'Missing INFISICAL_PROJECT_ID environment variable'
    };
  }

  try {
    console.log('📡 Connecting to Infisical...');
    
    let client: InfisicalSDK;
    
    if (hasUniversalAuth) {
      console.log('   Using Universal Auth (client ID/secret)');
      client = new InfisicalSDK({
        siteUrl: process.env.INFISICAL_SITE_URL,
        auth: {
          universalAuth: {
            clientId: process.env.INFISICAL_CLIENT_ID!,
            clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
          },
        },
      });
    } else {
      console.log('   Using Service Token');
      client = new InfisicalSDK({
        siteUrl: process.env.INFISICAL_SITE_URL,
        auth: {
          serviceToken: process.env.INFISICAL_TOKEN_DEV!,
        },
      });
    }

    console.log('✅ Client initialized\n');

    // Test loading secrets from /workspace
    console.log('📂 Loading secrets from /workspace...');
    const workspaceResponse = await client.secrets().listSecrets({
      projectId: process.env.INFISICAL_PROJECT_ID,
      environment: process.env.INFISICAL_ENVIRONMENT || 'dev',
      path: '/workspace',
      recursive: false,
    });

    const workspaceSecrets = workspaceResponse.secrets || [];
    console.log(`   Found ${workspaceSecrets.length} secrets in /workspace`);
    console.log(`   Examples: ${workspaceSecrets.slice(0, 5).map(s => s.secretKey).join(', ')}\n`);

    // Test loading secrets from /server
    console.log('📂 Loading secrets from /server...');
    const serverResponse = await client.secrets().listSecrets({
      projectId: process.env.INFISICAL_PROJECT_ID,
      environment: process.env.INFISICAL_ENVIRONMENT || 'dev',
      path: '/server',
      recursive: false,
    });

    const serverSecrets = serverResponse.secrets || [];
    console.log(`   Found ${serverSecrets.length} secrets in /server`);
    console.log(`   Examples: ${serverSecrets.slice(0, 5).map(s => s.secretKey).join(', ')}\n`);

    const totalSecrets = workspaceSecrets.length + serverSecrets.length;

    return {
      success: true,
      message: `Successfully loaded ${totalSecrets} secrets from Infisical`,
      secretsLoaded: totalSecrets
    };

  } catch (error: any) {
    return {
      success: false,
      message: 'Failed to connect to Infisical',
      error: error.message || String(error)
    };
  }
}

// Run test
testInfisicalConnection().then((result) => {
  console.log('\n' + '='.repeat(60));
  if (result.success) {
    console.log('✅ TEST PASSED');
    console.log(`   ${result.message}`);
    console.log('='.repeat(60) + '\n');
    process.exit(0);
  } else {
    console.log('❌ TEST FAILED');
    console.log(`   ${result.message}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('='.repeat(60) + '\n');
    process.exit(1);
  }
});
