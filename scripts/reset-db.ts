#!/usr/bin/env tsx
/**
 * Hard reset the database schemas (kb + core) and recreate a fresh schema using DatabaseService.ensureSchema logic.
 * WARNING: This irreversibly deletes all data in the target DB.
 */
import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { validateEnvVars, DB_REQUIREMENTS, getDbConfig } from './lib/env-validator.js';

// Load .env early (allow override via DOTENV_PATH)
(() => {
    const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`[reset-db] Loaded environment from ${envPath}`);
    } else {
        console.log('[reset-db] No .env found (proceeding with process env)');
    }
})();

// Validate required environment variables with helpful error messages
validateEnvVars(DB_REQUIREMENTS);

async function main() {
    // Use validated env vars with no fallbacks
    const dbConfig = getDbConfig();
    if (process.env.RESET_DB_DEBUG === '1') {
        console.log('[reset-db] Using connection params', {
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            database: dbConfig.database,
            password: dbConfig.password ? '***' : '(empty)'
        });
    }
    const pool = new Pool(dbConfig);
    try {
        console.log('[reset-db] acquiring advisory lock');
        await pool.query('SELECT pg_advisory_lock(77777777)');
        console.log('[reset-db] dropping schemas kb, core (cascade)');
        await pool.query('DROP SCHEMA IF EXISTS kb CASCADE');
        await pool.query('DROP SCHEMA IF EXISTS core CASCADE');
        console.log('[reset-db] creating empty schemas');
        await pool.query('CREATE SCHEMA kb');
        await pool.query('CREATE SCHEMA core');
        console.log('[reset-db] releasing lock');
        await pool.query('SELECT pg_advisory_unlock(77777777)');
        console.log('[reset-db] done. Next start with AUTO_INIT_DB=true will recreate tables');
    } finally {
        await pool.end();
    }
}

main().catch(e => { console.error(e); process.exit(1); });
