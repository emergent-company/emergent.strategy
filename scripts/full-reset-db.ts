#!/usr/bin/env tsx
/**
 * full-reset-db.ts
 * ---------------------------------------------------------------
 * Hard drop + recreate the kb & core schemas using database migrations
 * as the single source of truth.
 *
 * This script:
 * 1. Drops kb and core schemas (CASCADE - all data lost)
 * 2. Runs all migrations from apps/server-nest/migrations/ in order
 * 3. Ensures complete, consistent database schema for E2E tests
 *
 * Usage:
 *   npx tsx scripts/full-reset-db.ts
 *
 * Environment variables:
 *   DATABASE_URL            - (preferred) standard Postgres URL
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME - fallback pieces
 *
 * Safety:
 *   - Acquires advisory lock 4815162342 to prevent concurrent runs
 *   - Drops schemas with CASCADE: ALL DATA IS LOST
 *   - Uses migrations as single source of truth (no schema duplication)
 */
import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import * as dotenv from 'dotenv';

// Load .env early (allow override via DOTENV_PATH); ignore if missing.
(() => {
  const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    // eslint-disable-next-line no-console
    console.log(`[full-reset-db] Loaded environment from ${envPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log('[full-reset-db] No .env file found at', envPath, '(proceeding with existing environment)');
  }
})();

function buildPool(): Pool {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL });
  }
  const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
  const port = +(process.env.DB_PORT || process.env.PGPORT || 5432);
  const user = process.env.DB_USER || process.env.PGUSER || 'postgres';
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres';
  const database = process.env.DB_NAME || process.env.PGDATABASE || 'postgres';
  if (process.env.FULL_RESET_DB_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[full-reset-db] Using connection params', { host, port, user, database, password: password ? '***' : '(empty)' });
  }
  return new Pool({ host, port, user, password, database });
}

async function exec(pool: Pool, sql: string) {
  try {
    await pool.query(sql);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[full-reset-db] SQL failed:', sql, '\nError:', e);
    throw e;
  }
}

async function main() {
  const start = Date.now();
  const pool = buildPool();
  try {
    console.log('[full-reset-db] Acquiring advisory lock (minimal path id)');
    await exec(pool, 'SELECT pg_advisory_lock(4815162342)');

    console.log('[full-reset-db] Dropping schemas kb & core (CASCADE)');
    await exec(pool, 'DROP SCHEMA IF EXISTS kb CASCADE');
    await exec(pool, 'DROP SCHEMA IF EXISTS core CASCADE');

    console.log('[full-reset-db] Clearing migration tracking table');
    await exec(pool, 'DELETE FROM public.schema_migrations');

    console.log('[full-reset-db] Releasing advisory lock');
    await exec(pool, 'SELECT pg_advisory_unlock(4815162342)');

    await pool.end();

    console.log('[full-reset-db] Running migrations to recreate schema...');
    execSync('tsx scripts/run-migrations.ts', {
      stdio: 'inherit',
      cwd: path.resolve(process.cwd())
    });

    console.log(`[full-reset-db] Completed in ${Date.now() - start}ms`);
  } catch (error) {
    await pool.end();
    throw error;
  }
}

// Run
main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('[full-reset-db] FAILED', err);
  process.exit(1);
});
