#!/usr/bin/env tsx
/**
 * Debug script to check what's actually in Infisical
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

async function main() {
  const client = new InfisicalSDK({
    siteUrl: INFISICAL_SITE_URL,
  });

  await client.auth().universalAuth.login({
    clientId: INFISICAL_CLIENT_ID,
    clientSecret: INFISICAL_CLIENT_SECRET,
  });

  console.log('✅ Authenticated\n');

  const foldersToCheck = ['/', '/workspace', '/server', '/admin', '/docker'];
  
  for (const folder of foldersToCheck) {
    try {
      console.log(`\nChecking folder: ${folder}`);
      const response = await client.secrets().listSecrets({
        projectId: INFISICAL_PROJECT_ID,
        environment: 'dev',
        path: folder,
      });
      
      if (response.secrets && response.secrets.length > 0) {
        console.log(`✅ Found ${response.secrets.length} secrets in ${folder}`);
        console.log('First 5 secrets:');
        response.secrets.slice(0, 5).forEach((s: any) => {
          console.log(`  - ${s.secretKey}: ${s.secretPath || '(no path)'}`);
        });
        
        // Group by secretPath to understand folder structure
        const byPath = response.secrets.reduce((acc: any, s: any) => {
          const path = s.secretPath || '/';
          if (!acc[path]) acc[path] = 0;
          acc[path]++;
          return acc;
        }, {});
        
        console.log('\nSecrets by path:');
        Object.entries(byPath).forEach(([path, count]) => {
          console.log(`  ${path}: ${count} secrets`);
        });
      } else {
        console.log(`❌ No secrets in ${folder}`);
      }
    } catch (e: any) {
      console.log(`❌ Error checking ${folder}:`, e.message);
    }
  }
}

main().catch(console.error);
