#!/usr/bin/env tsx
/**
 * full-reset-db.ts
 * ---------------------------------------------------------------
 * Completely drops and recreates the database, then runs migrations.
 *
 * This script:
 * 1. Terminates all connections to the target database
 * 2. Drops the entire database
 * 3. Recreates the database
 * 4. Runs all migrations to recreate the schema
 *
 * Usage:
 *   npx tsx scripts/full-reset-db.ts
 *
 * Environment variables:
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
 *
 * Safety:
 *   - ALL DATA IS LOST
 *   - Connects to 'postgres' database to drop the target database
 */
import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import * as dotenv from 'dotenv';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

// Load .env early (allow override via DOTENV_PATH); ignore if missing.
(() => {
  const envPath =
    process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    // eslint-disable-next-line no-console
    console.log(`[full-reset-db] Loaded environment from ${envPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(
      '[full-reset-db] No .env file found at',
      envPath,
      '(proceeding with existing environment)'
    );
  }
})();

function buildPool(database = 'postgres'): Pool {
  // Validate required environment variables with helpful error messages
  validateEnvVars(DB_REQUIREMENTS);

  // Use validated env vars with no fallbacks
  const dbConfig = getDbConfig();

  // Connect to the postgres database instead of the target database
  return new Pool({
    ...dbConfig,
    database,
  });
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

  // Validate required environment variables
  validateEnvVars(DB_REQUIREMENTS);
  const dbConfig = getDbConfig();
  const targetDb = dbConfig.database;

  // Connect to the 'postgres' database to perform database operations
  const pool = buildPool('postgres');

  try {
    console.log(
      `[full-reset-db] Terminating all connections to database '${targetDb}'`
    );
    await exec(
      pool,
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${targetDb}' AND pid <> pg_backend_pid()`
    );

    console.log(`[full-reset-db] Dropping database '${targetDb}'`);
    await exec(pool, `DROP DATABASE IF EXISTS "${targetDb}"`);

    console.log(`[full-reset-db] Creating database '${targetDb}'`);
    await exec(pool, `CREATE DATABASE "${targetDb}"`);

    await pool.end();

    console.log('[full-reset-db] Running migrations to create schema...');
    execSync('npm run db:migrate', {
      stdio: 'inherit',
      cwd: path.resolve(process.cwd()),
    });

    console.log(`[full-reset-db] Completed in ${Date.now() - start}ms`);
  } catch (error) {
    await pool.end();
    throw error;
  }
}

// Run
main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[full-reset-db] FAILED', err);
  process.exit(1);
});
