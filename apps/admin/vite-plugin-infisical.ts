/**
 * Vite Plugin: Environment Loader with Infisical Support
 *
 * Loads secrets from .env.infisical at build time and injects VITE_* vars into the Vite config.
 *
 * To update Infisical secrets, run:
 *   npx tsx scripts/dump-infisical-secrets.ts
 *
 * Usage:
 *   import { infisicalPlugin } from './vite-plugin-infisical';
 *
 *   export default defineConfig(async () => {
 *     const secrets = await infisicalPlugin();
 *     return {
 *       plugins: [...],
 *       define: secrets
 *     };
 *   });
 */

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '../..');

export async function infisicalPlugin(): Promise<Record<string, string>> {
  const envFiles = [
    { path: path.join(rootDir, '.env'), name: '.env' },
    { path: path.join(rootDir, '.env.local'), name: '.env.local' },
    { path: path.join(rootDir, '.env.infisical'), name: '.env.infisical' },
  ];

  let loadedCount = 0;

  for (const { path: filePath, name } of envFiles) {
    if (existsSync(filePath)) {
      config({ path: filePath, override: true });
      loadedCount++;
      console.log(`   ✅ Loaded ${name}`);
    }
  }

  if (loadedCount === 0) {
    console.log('⚠️  No .env files found');
    return {};
  }

  const viteSecrets = Object.entries(process.env)
    .filter(([key]) => key.startsWith('VITE_'))
    .reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[`import.meta.env.${key}`] = JSON.stringify(value);
      }
      return acc;
    }, {} as Record<string, string>);

  console.log(
    `🔐 Vite: Loaded ${
      Object.keys(viteSecrets).length
    } VITE_* variables from ${loadedCount} file(s)\n`
  );

  return viteSecrets;
}
