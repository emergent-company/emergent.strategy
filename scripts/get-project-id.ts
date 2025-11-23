#!/usr/bin/env tsx
import { InfisicalSDK } from '@infisical/sdk';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function getProjectId() {
  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://infiscal.kucharz.net',
  });

  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID!,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
  });

  console.log('✓ Authenticated successfully\n');

  // Try to list secrets with slug to see if it works or get actual ID
  try {
    console.log('Testing with project slug "emergent"...');
    const secrets = await client.secrets().listSecrets({
      environment: 'dev',
      projectId: 'emergent',
    });
    console.log('\n✓ Project slug "emergent" works as projectId!');
    if (secrets.secrets.length > 0) {
      console.log(`\nFound ${secrets.secrets.length} secrets in dev environment`);
      console.log(`Workspace ID: ${secrets.secrets[0].workspaceId}`);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message || error);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

getProjectId().catch(console.error);
