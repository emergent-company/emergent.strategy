/**
 * Environment Loader with Infisical Support
 *
 * Loads environment variables from multiple sources in order:
 * 1. .env (base defaults)
 * 2. .env.local (local overrides, not committed)
 * 3. .env.infisical (secrets dumped from Infisical via CLI)
 *
 * To update Infisical secrets, run:
 *   npx tsx scripts/dump-infisical-secrets.ts
 */

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function findRootDir(): string {
  let dir = process.cwd();

  if (dir.includes('apps/server')) {
    return dir.replace(/\/apps\/server.*$/, '');
  }

  if (existsSync(join(dir, 'apps/server'))) {
    return dir;
  }

  return dir;
}

export async function initializeInfisical(): Promise<void> {
  const rootDir = findRootDir();

  const envFiles = [
    { path: join(rootDir, '.env'), name: '.env' },
    { path: join(rootDir, '.env.local'), name: '.env.local' },
    { path: join(rootDir, '.env.infisical'), name: '.env.infisical' },
  ];

  let loadedCount = 0;

  for (const { path, name } of envFiles) {
    if (existsSync(path)) {
      config({ path, override: true });
      loadedCount++;
      console.log(`   ✅ Loaded ${name}`);
    }
  }

  if (loadedCount === 0) {
    console.log('   ⚠️  No .env files found');
    return;
  }

  if (process.env.POSTGRES_HOST && !process.env.PGHOST) {
    process.env.PGHOST = process.env.POSTGRES_HOST;
    process.env.PGPORT = process.env.POSTGRES_PORT || '5432';
    process.env.PGUSER = process.env.POSTGRES_USER;
    process.env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
    process.env.PGDATABASE = process.env.POSTGRES_DB;
  }

  console.log(`   🔐 Environment loaded from ${loadedCount} file(s)\n`);
}

if (require.main === module) {
  initializeInfisical().catch((error) => {
    console.error('Fatal error loading environment:', error);
    process.exit(1);
  });
}
