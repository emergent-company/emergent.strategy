#!/usr/bin/env tsx
/**
 * List ALL secrets in Infisical dev environment
 */

import { InfisicalSDK } from '@infisical/sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL,
  });

  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET,
  });

  console.log('✅ Authenticated\n');

  // List ALL secrets (recursive = true)
  try {
    const response = await client.secrets().listSecrets({
      projectId: process.env.INFISICAL_PROJECT_ID,
      environment: 'dev',
      path: '/',
      recursive: true,
    });
    
    console.log(`Found ${response.secrets?.length || 0} total secrets\n`);
    
    if (response.secrets && response.secrets.length > 0) {
      // Group by secretPath
      const byPath = response.secrets.reduce((acc: any, s: any) => {
        const path = s.secretPath || '/';
        if (!acc[path]) acc[path] = [];
        acc[path].push(s.secretKey);
        return acc;
      }, {});
      
      console.log('Secrets grouped by path:\n');
      Object.entries(byPath)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([path, keys]: [string, any]) => {
          console.log(`\n📁 ${path} (${keys.length} secrets)`);
          keys.slice(0, 10).forEach((key: string) => {
            console.log(`   - ${key}`);
          });
          if (keys.length > 10) {
            console.log(`   ... and ${keys.length - 10} more`);
          }
        });
    }
  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

main().catch(console.error);
