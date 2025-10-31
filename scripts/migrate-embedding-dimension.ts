#!/usr/bin/env tsx
/**
 * Embedding Dimension Migration Script
 * 
 * Migrates the kb.graph_objects.embedding_vec column from one dimension to another
 * using a zero-downtime dual-column approach.
 * 
 * Usage:
 *   npm run migrate:embedding-dimension -- --from=32 --to=1536 [--execute]
 * 
 * Flags:
 *   --from=N       Source dimension (current column dimension, default: 32)
 *   --to=N         Target dimension (desired dimension, default: 1536)
 *   --execute      Actually perform the migration (without this, runs in dry-run mode)
 *   --skip-backfill  Skip automatic embedding job queueing (manual backfill)
 *   --drop-old     Drop old column immediately after cutover (dangerous, not recommended)
 * 
 * Safety:
 *   - Always runs a verification check before starting
 *   - Creates new column and index before touching existing data
 *   - Queues re-embedding jobs for all objects
 *   - Monitors progress and reports status
 *   - Verifies 100% coverage before final cutover
 * 
 * Example:
 *   # Dry run (shows what would happen)
 *   npm run migrate:embedding-dimension -- --from=32 --to=1536
 * 
 *   # Execute migration
 *   npm run migrate:embedding-dimension -- --from=32 --to=1536 --execute
 */

import { Pool } from 'pg';
import * as readline from 'readline';
import { validateEnvVars, DB_REQUIREMENTS, getDbConfig } from './lib/env-validator.js';

interface MigrationConfig {
    fromDimension: number;
    toDimension: number;
    execute: boolean;
    skipBackfill: boolean;
    dropOld: boolean;
}

interface MigrationStatus {
    totalObjects: number;
    objectsWithOldEmbedding: number;
    objectsWithNewEmbedding: number;
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
    completedJobs: number;
}

async function parseArgs(): Promise<MigrationConfig> {
    const args = process.argv.slice(2);
    const config: MigrationConfig = {
        fromDimension: 32,
        toDimension: 1536,
        execute: false,
        skipBackfill: false,
        dropOld: false,
    };

    for (const arg of args) {
        if (arg.startsWith('--from=')) {
            config.fromDimension = parseInt(arg.split('=')[1], 10);
        } else if (arg.startsWith('--to=')) {
            config.toDimension = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--execute') {
            config.execute = true;
        } else if (arg === '--skip-backfill') {
            config.skipBackfill = true;
        } else if (arg === '--drop-old') {
            config.dropOld = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Embedding Dimension Migration Script

Usage:
  npm run migrate:embedding-dimension -- [options]

Options:
  --from=N         Source dimension (default: 32)
  --to=N           Target dimension (default: 1536)
  --execute        Execute migration (without this, dry-run only)
  --skip-backfill  Skip automatic embedding job queueing
  --drop-old       Drop old column after cutover (not recommended)
  --help           Show this help message

Examples:
  # Dry run
  npm run migrate:embedding-dimension -- --from=32 --to=1536

  # Execute migration
  npm run migrate:embedding-dimension -- --from=32 --to=1536 --execute

For detailed documentation, see: docs/EMBEDDING_MIGRATION.md
            `);
            process.exit(0);
        } else {
            console.error(`Unknown argument: ${arg}`);
            process.exit(1);
        }
    }

    // Validation
    if (isNaN(config.fromDimension) || config.fromDimension <= 0) {
        console.error(`Invalid --from dimension: ${config.fromDimension}`);
        process.exit(1);
    }
    if (isNaN(config.toDimension) || config.toDimension <= 0) {
        console.error(`Invalid --to dimension: ${config.toDimension}`);
        process.exit(1);
    }
    if (config.fromDimension === config.toDimension) {
        console.error('Source and target dimensions are the same. Nothing to migrate.');
        process.exit(0);
    }

    return config;
}

async function createPool(): Promise<Pool> {
    // Validate required environment variables with helpful error messages
    validateEnvVars(DB_REQUIREMENTS);

    // Use validated env vars with no fallbacks
    const dbConfig = getDbConfig();
    const pool = new Pool(dbConfig);

    // Test connection
    try {
        await pool.query('SELECT 1');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        process.exit(1);
    }

    return pool;
}

async function verifyCurrentState(pool: Pool, config: MigrationConfig): Promise<void> {
    console.log('\n=== Verifying Current State ===');

    // Check pgvector extension
    const extResult = await pool.query(`
        SELECT extname, extversion 
        FROM pg_extension 
        WHERE extname = 'vector'
    `);
    if (extResult.rows.length === 0) {
        console.error('❌ pgvector extension not installed');
        process.exit(1);
    }
    console.log(`✓ pgvector extension installed (version ${extResult.rows[0].extversion})`);

    // Check current column dimension
    const colResult = await pool.query(`
        SELECT 
            a.attname as column_name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'kb'
          AND c.relname = 'graph_objects'
          AND a.attname = 'embedding_vec'
          AND NOT a.attisdropped
    `);

    if (colResult.rows.length === 0) {
        console.error('❌ Column kb.graph_objects.embedding_vec does not exist');
        process.exit(1);
    }

    const currentType = colResult.rows[0].data_type;
    console.log(`✓ Current column type: ${currentType}`);

    // Extract dimension from type (e.g., "vector(32)" -> 32)
    const match = currentType.match(/vector\((\d+)\)/);
    if (!match) {
        console.error(`❌ Cannot parse dimension from type: ${currentType}`);
        process.exit(1);
    }

    const currentDimension = parseInt(match[1], 10);
    if (currentDimension !== config.fromDimension) {
        console.error(`❌ Current dimension (${currentDimension}) does not match --from=${config.fromDimension}`);
        console.error('   Please verify the source dimension and try again.');
        process.exit(1);
    }
    console.log(`✓ Current dimension matches source: ${currentDimension}`);

    // Check for existing new column (migration in progress?)
    const newColResult = await pool.query(`
        SELECT a.attname
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
        JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'kb'
          AND c.relname = 'graph_objects'
          AND a.attname = $1
          AND NOT a.attisdropped
    `, [`embedding_vec_${config.toDimension}`]);

    if (newColResult.rows.length > 0) {
        console.warn(`⚠️  Column embedding_vec_${config.toDimension} already exists`);
        console.warn('   Migration may already be in progress. Proceeding with caution.');
    } else {
        console.log(`✓ Target column embedding_vec_${config.toDimension} does not exist yet`);
    }
}

async function getStatus(pool: Pool, config: MigrationConfig): Promise<MigrationStatus> {
    const objectsResult = await pool.query<{
        total: string;
        with_old: string;
        with_new: string;
    }>(`
        SELECT 
            COUNT(*)::text as total,
            COUNT(*) FILTER (WHERE embedding_vec IS NOT NULL)::text as with_old,
            COUNT(*) FILTER (WHERE embedding_vec_${config.toDimension} IS NOT NULL)::text as with_new
        FROM kb.graph_objects
        WHERE deleted_at IS NULL
    `);

    const jobsResult = await pool.query<{
        status: string;
        count: string;
    }>(`
        SELECT status, COUNT(*)::text as count
        FROM kb.graph_embedding_jobs
        GROUP BY status
    `);

    const jobCounts: Record<string, number> = {};
    for (const row of jobsResult.rows) {
        jobCounts[row.status] = parseInt(row.count, 10);
    }

    return {
        totalObjects: parseInt(objectsResult.rows[0].total, 10),
        objectsWithOldEmbedding: parseInt(objectsResult.rows[0].with_old, 10),
        objectsWithNewEmbedding: parseInt(objectsResult.rows[0].with_new, 10),
        pendingJobs: jobCounts.pending || 0,
        processingJobs: jobCounts.processing || 0,
        failedJobs: jobCounts.failed || 0,
        completedJobs: jobCounts.completed || 0,
    };
}

async function printStatus(pool: Pool, config: MigrationConfig): Promise<void> {
    const status = await getStatus(pool, config);

    console.log('\n=== Migration Status ===');
    console.log(`Total objects (non-deleted):     ${status.totalObjects}`);
    console.log(`Objects with old embeddings:     ${status.objectsWithOldEmbedding} (${(status.objectsWithOldEmbedding / status.totalObjects * 100).toFixed(1)}%)`);
    console.log(`Objects with new embeddings:     ${status.objectsWithNewEmbedding} (${(status.objectsWithNewEmbedding / status.totalObjects * 100).toFixed(1)}%)`);
    console.log('\nEmbedding Jobs:');
    console.log(`  Pending:     ${status.pendingJobs}`);
    console.log(`  Processing:  ${status.processingJobs}`);
    console.log(`  Failed:      ${status.failedJobs}`);
    console.log(`  Completed:   ${status.completedJobs}`);
    console.log(`  Total:       ${status.pendingJobs + status.processingJobs + status.failedJobs + status.completedJobs}`);
}

async function createNewColumn(pool: Pool, config: MigrationConfig): Promise<void> {
    console.log('\n=== Step 1: Creating New Column ===');

    if (!config.execute) {
        console.log('[DRY RUN] Would execute:');
        console.log(`  ALTER TABLE kb.graph_objects ADD COLUMN IF NOT EXISTS embedding_vec_${config.toDimension} vector(${config.toDimension}) NULL;`);
        return;
    }

    try {
        await pool.query(`
            ALTER TABLE kb.graph_objects 
            ADD COLUMN IF NOT EXISTS embedding_vec_${config.toDimension} vector(${config.toDimension}) NULL
        `);
        console.log(`✓ Created column embedding_vec_${config.toDimension}`);
    } catch (error) {
        console.error('❌ Failed to create new column:', error);
        throw error;
    }
}

async function createNewIndex(pool: Pool, config: MigrationConfig): Promise<void> {
    console.log('\n=== Step 2: Creating Index on New Column ===');
    console.log('⚠️  This may take several minutes for large tables...');

    if (!config.execute) {
        console.log('[DRY RUN] Would execute:');
        console.log(`  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_graph_objects_embedding_vec_${config.toDimension}`);
        console.log(`    ON kb.graph_objects USING ivfflat (embedding_vec_${config.toDimension} vector_cosine_ops)`);
        console.log(`    WITH (lists=100);`);
        return;
    }

    try {
        await pool.query(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_graph_objects_embedding_vec_${config.toDimension}
            ON kb.graph_objects USING ivfflat (embedding_vec_${config.toDimension} vector_cosine_ops)
            WITH (lists=100)
        `);
        console.log(`✓ Created index idx_graph_objects_embedding_vec_${config.toDimension}`);
    } catch (error) {
        console.error('❌ Failed to create index:', error);
        throw error;
    }
}

async function queueReembedding(pool: Pool, config: MigrationConfig): Promise<void> {
    if (config.skipBackfill) {
        console.log('\n=== Step 3: Skipped (--skip-backfill) ===');
        console.log('You will need to manually queue embedding jobs.');
        return;
    }

    console.log('\n=== Step 3: Queueing Re-embedding Jobs ===');

    if (!config.execute) {
        console.log('[DRY RUN] Would queue all non-deleted objects for re-embedding');
        return;
    }

    try {
        const result = await pool.query(`
            INSERT INTO kb.graph_embedding_jobs (object_id, status, priority)
            SELECT id, 'pending', 10
            FROM kb.graph_objects
            WHERE deleted_at IS NULL
            ON CONFLICT (object_id) 
            WHERE status IN ('pending', 'processing')
            DO UPDATE SET priority = GREATEST(kb.graph_embedding_jobs.priority, 10)
        `);
        console.log(`✓ Queued ${result.rowCount} objects for re-embedding (priority 10)`);
    } catch (error) {
        console.error('❌ Failed to queue re-embedding jobs:', error);
        throw error;
    }
}

async function monitorProgress(pool: Pool, config: MigrationConfig): Promise<void> {
    console.log('\n=== Monitoring Progress ===');
    console.log('Press Ctrl+C to stop monitoring and continue to verification\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    let monitoring = true;

    const stopMonitoring = () => {
        monitoring = false;
        rl.close();
    };

    // Handle Ctrl+C
    rl.on('SIGINT', stopMonitoring);

    while (monitoring) {
        await printStatus(pool, config);

        const status = await getStatus(pool, config);
        const progress = (status.objectsWithNewEmbedding / status.totalObjects) * 100;

        if (progress >= 100) {
            console.log('\n✓ All objects have new embeddings!');
            stopMonitoring();
            break;
        }

        if (status.pendingJobs === 0 && status.processingJobs === 0) {
            console.log('\n⚠️  No jobs are pending or processing.');
            if (status.failedJobs > 0) {
                console.log('   Some jobs failed. Review failed jobs before continuing.');
            }
            if (status.objectsWithNewEmbedding < status.totalObjects) {
                console.log('   Some objects still missing embeddings. Manual intervention may be required.');
            }
            stopMonitoring();
            break;
        }

        // Wait 10 seconds before next update
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

async function verifyCutoverReadiness(pool: Pool, config: MigrationConfig): Promise<boolean> {
    console.log('\n=== Verifying Cutover Readiness ===');

    const status = await getStatus(pool, config);

    // Check 1: All objects have new embeddings
    const missingCount = status.totalObjects - status.objectsWithNewEmbedding;
    if (missingCount > 0) {
        console.error(`❌ ${missingCount} objects still missing new embeddings`);
        return false;
    }
    console.log(`✓ All ${status.totalObjects} objects have new embeddings`);

    // Check 2: No jobs pending or processing
    if (status.pendingJobs > 0 || status.processingJobs > 0) {
        console.error(`❌ ${status.pendingJobs + status.processingJobs} jobs still pending/processing`);
        return false;
    }
    console.log('✓ No pending or processing jobs');

    // Check 3: Index exists
    const indexResult = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'kb'
          AND tablename = 'graph_objects'
          AND indexname = $1
    `, [`idx_graph_objects_embedding_vec_${config.toDimension}`]);

    if (indexResult.rows.length === 0) {
        console.error(`❌ Index idx_graph_objects_embedding_vec_${config.toDimension} does not exist`);
        return false;
    }
    console.log('✓ Index on new column exists');

    return true;
}

async function performCutover(pool: Pool, config: MigrationConfig): Promise<void> {
    console.log('\n=== Step 4: Performing Cutover ===');
    console.log('⚠️  This step will rename columns and indexes. Ensure application is stopped or read-only.');

    if (!config.execute) {
        console.log('[DRY RUN] Would execute cutover steps');
        return;
    }

    // Confirm
    console.log('\nFinal confirmation required.');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const answer = await new Promise<string>(resolve => {
        rl.question('Type "CUTOVER" to proceed: ', resolve);
    });
    rl.close();

    if (answer !== 'CUTOVER') {
        console.log('Cutover cancelled.');
        return;
    }

    try {
        // Step 4a: Drop old index
        await pool.query('DROP INDEX IF EXISTS kb.idx_graph_objects_embedding_vec');
        console.log('✓ Dropped old index');

        // Step 4b: Drop old column (or rename as backup)
        if (config.dropOld) {
            await pool.query('ALTER TABLE kb.graph_objects DROP COLUMN embedding_vec');
            console.log('✓ Dropped old column embedding_vec');
        } else {
            await pool.query(`ALTER TABLE kb.graph_objects RENAME COLUMN embedding_vec TO embedding_vec_${config.fromDimension}_backup`);
            console.log(`✓ Renamed old column to embedding_vec_${config.fromDimension}_backup (you can drop it later)`);
        }

        // Step 4c: Rename new column
        await pool.query(`ALTER TABLE kb.graph_objects RENAME COLUMN embedding_vec_${config.toDimension} TO embedding_vec`);
        console.log('✓ Renamed new column to embedding_vec');

        // Step 4d: Rename new index
        await pool.query(`ALTER INDEX kb.idx_graph_objects_embedding_vec_${config.toDimension} RENAME TO idx_graph_objects_embedding_vec`);
        console.log('✓ Renamed new index to idx_graph_objects_embedding_vec');

        console.log('\n✅ Cutover complete!');
        console.log(`\nNext steps:`);
        console.log(`  1. Update .env: EMBEDDING_DIMENSION=${config.toDimension}`);
        console.log(`  2. Restart the application`);
        console.log(`  3. Verify search functionality`);
        if (!config.dropOld) {
            console.log(`  4. Drop backup column after verification:`);
            console.log(`     ALTER TABLE kb.graph_objects DROP COLUMN embedding_vec_${config.fromDimension}_backup;`);
        }
    } catch (error) {
        console.error('❌ Cutover failed:', error);
        console.error('\n⚠️  Database may be in inconsistent state. Manual recovery may be required.');
        throw error;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   Embedding Dimension Migration Script            ║');
    console.log('╚════════════════════════════════════════════════════╝');

    const config = await parseArgs();

    console.log('\n=== Configuration ===');
    console.log(`Source dimension:    ${config.fromDimension}`);
    console.log(`Target dimension:    ${config.toDimension}`);
    console.log(`Execution mode:      ${config.execute ? 'LIVE' : 'DRY RUN'}`);
    console.log(`Skip backfill:       ${config.skipBackfill}`);
    console.log(`Drop old column:     ${config.dropOld}`);

    if (!config.execute) {
        console.log('\n⚠️  DRY RUN MODE - No changes will be made');
        console.log('   Add --execute flag to perform actual migration');
    }

    const pool = await createPool();

    try {
        await verifyCurrentState(pool, config);
        await printStatus(pool, config);

        await createNewColumn(pool, config);
        await createNewIndex(pool, config);
        await queueReembedding(pool, config);

        if (config.execute) {
            await monitorProgress(pool, config);

            const ready = await verifyCutoverReadiness(pool, config);
            if (!ready) {
                console.log('\n❌ System not ready for cutover. Resolve issues above and re-run.');
                process.exit(1);
            }

            await performCutover(pool, config);
        } else {
            console.log('\n=== Dry Run Complete ===');
            console.log('Review the steps above. When ready, run with --execute flag.');
        }
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }

    console.log('\n✅ Migration script finished successfully');
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
