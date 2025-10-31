#!/usr/bin/env tsx
/**
 * Database Migration Runner
 * =========================
 * Runs all SQL migrations in order from apps/server-nest/src/migrations/
 * 
 * Usage:
 *   npm run migrate           # Run all pending migrations
 *   tsx scripts/run-migrations.ts
 * 
 * Environment:
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
 *   or DATABASE_URL - Full connection string
 */

import path from 'node:path';
import fs from 'node:fs';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { validateEnvVars, DB_REQUIREMENTS, getDbConfig } from './lib/env-validator.js';

// Find project root (where package.json with workspace exists)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load environment from project root
const envPath = process.env.DOTENV_PATH || path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[migrate] Loaded environment from ${envPath}`);
}

const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'apps/server-nest/migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

interface Migration {
    filename: string;
    filepath: string;
    version: string;
}

/**
 * Get database client
 */
async function getClient(): Promise<Client> {
    // Validate required environment variables with helpful error messages
    validateEnvVars(DB_REQUIREMENTS);

    // Use validated env vars with no fallbacks
    const dbConfig = getDbConfig();
    const client = new Client(dbConfig);

    await client.connect();
    return client;
}

/**
 * Ensure migrations tracking table exists
 */
async function ensureMigrationsTable(client: Client): Promise<void> {
    await client.query(`
        CREATE TABLE IF NOT EXISTS public.${MIGRATIONS_TABLE} (
            version TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        
        CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied 
        ON public.${MIGRATIONS_TABLE}(applied_at DESC);
    `);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(client: Client): Promise<Set<string>> {
    const result = await client.query(
        `SELECT version FROM public.${MIGRATIONS_TABLE} ORDER BY version`
    );
    return new Set(result.rows.map(r => r.version));
}

/**
 * Get list of available migration files
 */
function getAvailableMigrations(): Migration[] {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        console.warn(`[migrate] Migrations directory not found: ${MIGRATIONS_DIR}`);
        return [];
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Alphabetical sort ensures 0001, 0002, etc. run in order

    return files.map(filename => {
        // Use the entire filename (without .sql) as the version to ensure uniqueness
        // e.g., 0001_init.sql -> 0001_init
        //       20251025_add_integration_metadata.sql -> 20251025_add_integration_metadata
        const version = filename.replace('.sql', '');

        return {
            filename,
            filepath: path.join(MIGRATIONS_DIR, filename),
            version,
        };
    });
}

/**
 * Apply a single migration
 */
async function applyMigration(client: Client, migration: Migration): Promise<void> {
    console.log(`[migrate] Applying: ${migration.filename}...`);

    const sql = fs.readFileSync(migration.filepath, 'utf-8');

    try {
        // Run migration in a transaction
        await client.query('BEGIN');

        // Execute migration SQL
        await client.query(sql);

        // Record migration as applied
        await client.query(
            `INSERT INTO public.${MIGRATIONS_TABLE} (version, filename) VALUES ($1, $2)`,
            [migration.version, migration.filename]
        );

        await client.query('COMMIT');

        console.log(`[migrate] ✅ Applied: ${migration.filename}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ❌ Failed to apply ${migration.filename}:`);
        throw error;
    }
}

/**
 * Main migration runner
 */
async function runMigrations() {
    console.log('[migrate] Starting database migrations...\n');

    const client = await getClient();

    try {
        // Ensure migrations tracking table exists
        await ensureMigrationsTable(client);

        // Get applied and available migrations
        const applied = await getAppliedMigrations(client);
        const available = getAvailableMigrations();

        // Find pending migrations
        const pending = available.filter(m => !applied.has(m.version));

        if (pending.length === 0) {
            console.log('[migrate] ✅ All migrations are up to date!\n');
            console.log(`Applied migrations: ${applied.size}`);
            console.log(`Available migrations: ${available.length}`);
            return;
        }

        console.log(`[migrate] Found ${pending.length} pending migration(s):\n`);
        pending.forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.filename}`);
        });
        console.log();

        // Apply each pending migration
        for (const migration of pending) {
            await applyMigration(client, migration);
        }

        console.log(`\n[migrate] ✅ Successfully applied ${pending.length} migration(s)!`);

    } catch (error) {
        console.error('\n[migrate] ❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Run migrations
runMigrations().catch(error => {
    console.error('[migrate] Fatal error:', error);
    process.exit(1);
});
