#!/usr/bin/env node
/**
 * Database Migration Runner
 * 
 * Manages SQL migrations with automatic tracking and rollback support.
 * 
 * Features:
 * - Tracks applied migrations in database table
 * - Applies pending migrations in order
 * - Supports dry-run mode
 * - Handles errors gracefully
 * - Works with Docker Postgres or remote database
 * 
 * Usage:
 *   nx run server-nest:migrate              # Apply all pending migrations
 *   nx run server-nest:migrate -- --dry-run # Show pending without applying
 *   nx run server-nest:migrate -- --list    # Show migration status
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Configuration
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../migrations');

// Require explicit configuration - no defaults!
const CONTAINER_NAME = process.env.DB_CONTAINER_NAME;
const DB_USER = process.env.POSTGRES_USER;
const DB_NAME = process.env.POSTGRES_DB;
const DB_PASSWORD = process.env.POSTGRES_PASSWORD;
const DB_HOST = process.env.POSTGRES_HOST;
const DB_PORT = process.env.POSTGRES_PORT;

// Validate required configuration
if (!DB_USER) throw new Error('POSTGRES_USER environment variable is required');
if (!DB_NAME) throw new Error('POSTGRES_DB environment variable is required');
if (!DB_PASSWORD) throw new Error('POSTGRES_PASSWORD environment variable is required');
if (!DB_HOST && !CONTAINER_NAME) throw new Error('Either POSTGRES_HOST or DB_CONTAINER_NAME environment variable is required');
if (DB_HOST && !DB_PORT) throw new Error('POSTGRES_PORT is required when using POSTGRES_HOST');

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isList = args.includes('--list');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Execute SQL query via Docker or direct connection
 */
async function executeSql(sql, { silent = false } = {}) {
    try {
        // Try Docker first if CONTAINER_NAME is set
        if (CONTAINER_NAME) {
            const dockerCmd = `echo "${sql.replace(/"/g, '\\"')}" | docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -t`;
            const { stdout, stderr } = await execAsync(dockerCmd);

            if (stderr && !silent) {
                log(`Warning: ${stderr}`, 'yellow');
            }

            return stdout.trim();
        }

        // Otherwise use direct connection
        const directCmd = `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -c "${sql.replace(/"/g, '\\"')}"`;
        const { stdout, stderr } = await execAsync(directCmd);

        if (stderr && !silent) {
            log(`Warning: ${stderr}`, 'yellow');
        }

        return stdout.trim();
    } catch (error) {
        // If Docker was attempted but failed, try direct connection as fallback
        if (CONTAINER_NAME && DB_HOST && DB_PORT) {
            if (!silent) {
                log('Docker connection failed, trying direct connection...', 'gray');
            }

            const directCmd = `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -t -c "${sql.replace(/"/g, '\\"')}"`;
            const { stdout, stderr } = await execAsync(directCmd);

            if (stderr && !silent) {
                log(`Warning: ${stderr}`, 'yellow');
            }

            return stdout.trim();
        }

        throw error;
    }
}

/**
 * Execute migration file via Docker or direct connection
 */
async function executeMigrationFile(filePath) {
    try {
        // Try Docker first if CONTAINER_NAME is set
        if (CONTAINER_NAME) {
            const dockerCmd = `cat "${filePath}" | docker exec -i ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME}`;
            const { stdout, stderr } = await execAsync(dockerCmd);
            return { stdout, stderr, success: true };
        }

        // Otherwise use direct connection
        const directCmd = `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -f "${filePath}"`;
        const { stdout, stderr } = await execAsync(directCmd);
        return { stdout, stderr, success: true };
    } catch (error) {
        // If Docker fails, try direct connection
        log('Docker connection failed, trying direct connection...', 'gray');
        const directCmd = `PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -f "${filePath}"`;
        const { stdout, stderr } = await execAsync(directCmd);
        return { stdout, stderr, success: true };
    }
}

/**
 * Initialize migrations tracking table
 */
async function initMigrationsTable() {
    const sql = `
    CREATE TABLE IF NOT EXISTS kb.schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64),
      execution_time_ms INTEGER,
      success BOOLEAN NOT NULL DEFAULT TRUE,
      error_message TEXT
    );
    
    COMMENT ON TABLE kb.schema_migrations IS 'Tracks which database migrations have been applied';
    COMMENT ON COLUMN kb.schema_migrations.filename IS 'Name of the migration file (e.g., 0002_extraction_jobs.sql)';
    COMMENT ON COLUMN kb.schema_migrations.checksum IS 'MD5 checksum of migration content for change detection';
    COMMENT ON COLUMN kb.schema_migrations.execution_time_ms IS 'How long the migration took to execute';
  `;

    await executeSql(sql, { silent: true });
}

/**
 * Get list of applied migrations from database
 */
async function getAppliedMigrations() {
    const sql = `SELECT filename, applied_at, success FROM kb.schema_migrations ORDER BY applied_at`;
    const result = await executeSql(sql, { silent: true });

    if (!result) return [];

    return result.split('\n')
        .filter(line => line.trim())
        .map(line => {
            const parts = line.split('|').map(p => p.trim());
            return {
                filename: parts[0],
                appliedAt: parts[1],
                success: parts[2] === 't',
            };
        });
}

/**
 * Get list of migration files from filesystem
 */
async function getMigrationFiles() {
    const files = await readdir(MIGRATIONS_DIR);
    return files
        .filter(f => f.endsWith('.sql'))
        .sort(); // Alphabetical order ensures chronological application
}

/**
 * Calculate MD5 checksum of file content
 */
async function calculateChecksum(filePath) {
    const content = await readFile(filePath, 'utf-8');
    const { createHash } = await import('crypto');
    return createHash('md5').update(content).digest('hex');
}

/**
 * Apply a single migration
 */
async function applyMigration(filename) {
    const filePath = join(MIGRATIONS_DIR, filename);
    const checksum = await calculateChecksum(filePath);
    const startTime = Date.now();

    log(`\n  Applying: ${filename}`, 'blue');

    try {
        const result = await executeMigrationFile(filePath);
        const executionTime = Date.now() - startTime;

        // Record successful migration
        const recordSql = `
      INSERT INTO kb.schema_migrations (filename, checksum, execution_time_ms, success)
      VALUES ('${filename}', '${checksum}', ${executionTime}, TRUE)
    `;
        await executeSql(recordSql);

        log(`  ✓ Applied in ${executionTime}ms`, 'green');

        // Show any notices/output
        if (result.stdout && result.stdout.includes('NOTICE')) {
            const notices = result.stdout.split('\n').filter(line => line.includes('NOTICE'));
            notices.forEach(notice => log(`    ${notice}`, 'gray'));
        }

        return { success: true, executionTime };
    } catch (error) {
        const executionTime = Date.now() - startTime;

        // Record failed migration
        const errorMsg = error.message.replace(/'/g, "''"); // Escape single quotes
        const recordSql = `
      INSERT INTO kb.schema_migrations (filename, checksum, execution_time_ms, success, error_message)
      VALUES ('${filename}', '${checksum}', ${executionTime}, FALSE, '${errorMsg}')
    `;
        await executeSql(recordSql).catch(() => { }); // Don't fail if recording fails

        log(`  ✗ Failed after ${executionTime}ms`, 'red');
        log(`    Error: ${error.message}`, 'red');

        return { success: false, error: error.message, executionTime };
    }
}

/**
 * List migration status
 */
async function listMigrations() {
    const applied = await getAppliedMigrations();
    const allFiles = await getMigrationFiles();

    log('\n┌─────────────────────────────────────────────────────────────┐', 'blue');
    log('│                    Migration Status                         │', 'blue');
    log('└─────────────────────────────────────────────────────────────┘', 'blue');

    log('\nApplied Migrations:', 'green');
    if (applied.length === 0) {
        log('  (none)', 'gray');
    } else {
        applied.forEach(m => {
            const status = m.success ? '✓' : '✗';
            const color = m.success ? 'green' : 'red';
            log(`  ${status} ${m.filename} (${m.appliedAt})`, color);
        });
    }

    const appliedSet = new Set(applied.map(m => m.filename));
    const pending = allFiles.filter(f => !appliedSet.has(f));

    log('\nPending Migrations:', 'yellow');
    if (pending.length === 0) {
        log('  (none - all migrations applied)', 'gray');
    } else {
        pending.forEach(f => {
            log(`  • ${f}`, 'yellow');
        });
    }

    log(`\nTotal: ${applied.length} applied, ${pending.length} pending\n`);
}

/**
 * Main migration runner
 */
async function main() {
    try {
        log('\n🔄 Database Migration Runner', 'blue');
        log('──────────────────────────────', 'blue');

        // Initialize migrations table
        await initMigrationsTable();

        // Get current state
        const applied = await getAppliedMigrations();
        const allFiles = await getMigrationFiles();
        const appliedSet = new Set(applied.map(m => m.filename));
        const pending = allFiles.filter(f => !appliedSet.has(f));

        // List mode
        if (isList) {
            await listMigrations();
            return;
        }

        // Check for pending migrations
        if (pending.length === 0) {
            log('\n✓ No pending migrations - database is up to date', 'green');
            log(`  (${applied.length} migrations already applied)\n`);
            return;
        }

        // Dry run mode
        if (isDryRun) {
            log('\n📋 Dry Run - Would apply the following migrations:\n', 'yellow');
            pending.forEach(f => {
                log(`  • ${f}`, 'yellow');
            });
            log(`\nTotal: ${pending.length} migrations would be applied`, 'yellow');
            log('\nRun without --dry-run to apply these migrations\n', 'gray');
            return;
        }

        // Apply pending migrations
        log(`\nApplying ${pending.length} pending migration(s)...\n`, 'blue');

        let successCount = 0;
        let failCount = 0;

        for (const filename of pending) {
            const result = await applyMigration(filename);
            if (result.success) {
                successCount++;
            } else {
                failCount++;
                // Stop on first failure to prevent cascading issues
                log('\n⚠️  Stopping migration run due to failure', 'red');
                break;
            }
        }

        // Summary
        log('\n┌─────────────────────────────────────────────────────────────┐', 'blue');
        log('│                    Migration Summary                         │', 'blue');
        log('└─────────────────────────────────────────────────────────────┘', 'blue');
        log(`\n  Success: ${successCount}`, 'green');
        if (failCount > 0) {
            log(`  Failed:  ${failCount}`, 'red');
        }
        log(`\n  Total applied: ${applied.length + successCount} migrations\n`);

        if (failCount > 0) {
            process.exit(1);
        }

    } catch (error) {
        log(`\n❌ Migration failed: ${error.message}\n`, 'red');
        process.exit(1);
    }
}

// Run main function
main();
