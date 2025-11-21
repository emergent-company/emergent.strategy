#!/usr/bin/env tsx
/**
 * Reset Embedding Jobs
 *
 * Resets all completed embedding jobs to pending status so they can be reprocessed
 * with the correct embedding_v2 column (768 dimensions).
 *
 * Context:
 * - 953 embedding jobs completed successfully
 * - They wrote to 'embedding' (bytea) column
 * - Vector search expects 'embedding_v2' (vector(768))
 * - This script resets jobs so worker can regenerate embeddings in correct column
 *
 * Related: docs/bugs/004-embedding-column-mismatch.md
 *
 * Usage:
 *   npm run reset-embedding-jobs         # Preview (dry run)
 *   npm run reset-embedding-jobs:execute # Actually reset jobs
 */

import path from 'node:path';
import fs from 'node:fs';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

const DRY_RUN = !process.argv.includes('--execute');

// Load .env early (allow override via DOTENV_PATH)
(() => {
  const envPath =
    process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env.test.local');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[reset-embedding-jobs] Loaded environment from ${envPath}`);
  } else {
    console.log(
      `[reset-embedding-jobs] No .env file found at ${envPath} (proceeding with existing environment)`
    );
  }
})();

interface JobStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

async function main() {
  console.log('\n='.repeat(70));
  console.log('  Reset Embedding Jobs for embedding_v2 Migration');
  console.log('='.repeat(70));
  console.log();

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute flag to actually reset jobs');
    console.log();
  } else {
    console.log('⚠️  EXECUTE MODE - Jobs will be reset');
    console.log();
  }

  // Validate environment and create database pool
  validateEnvVars(DB_REQUIREMENTS);
  const dbConfig = getDbConfig();
  const pool = new Pool(dbConfig);
  console.log('✅ Connected to database');
  console.log();

  try {
    // Get current stats
    console.log('📊 Current Job Statistics');
    console.log('-'.repeat(70));

    const statsResult = await pool.query<JobStats>(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int as processing,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed
      FROM kb.graph_embedding_jobs
    `);

    const currentStats = statsResult.rows[0];
    console.log(`  Total:      ${currentStats.total}`);
    console.log(`  Pending:    ${currentStats.pending}`);
    console.log(`  Processing: ${currentStats.processing}`);
    console.log(`  Completed:  ${currentStats.completed}`);
    console.log(`  Failed:     ${currentStats.failed}`);
    console.log();

    // Check how many objects have old embedding (bytea) vs new embedding_v2
    console.log('📊 Current Embedding Column State');
    console.log('-'.repeat(70));

    const embeddingStatsResult = await pool.query(`
      SELECT 
        COUNT(*)::int as total_objects,
        COUNT(embedding) FILTER (WHERE embedding IS NOT NULL)::int as has_bytea,
        COUNT(embedding_v2) FILTER (WHERE embedding_v2 IS NOT NULL)::int as has_v2,
        COUNT(embedding_vec) FILTER (WHERE embedding_vec IS NOT NULL)::int as has_old_vec
      FROM kb.graph_objects
    `);

    const embedStats = embeddingStatsResult.rows[0];
    console.log(`  Total Objects:            ${embedStats.total_objects}`);
    console.log(
      `  With embedding (bytea):   ${embedStats.has_bytea} (old format)`
    );
    console.log(
      `  With embedding_v2:        ${embedStats.has_v2} (NEW - target column)`
    );
    console.log(
      `  With embedding_vec:       ${embedStats.has_old_vec} (wrong dimension)`
    );
    console.log();

    // Calculate what will be reset
    const toReset = currentStats.completed;

    if (toReset === 0) {
      console.log('✅ No completed jobs to reset');
      console.log('   All jobs are either pending, processing, or failed');
      return;
    }

    console.log('🔄 Reset Plan');
    console.log('-'.repeat(70));
    console.log(`  Jobs to reset: ${toReset}`);
    console.log('  Changes:');
    console.log('    - status: completed → pending');
    console.log('    - started_at: <timestamp> → NULL');
    console.log('    - completed_at: <timestamp> → NULL');
    console.log('    - attempt_count: <n> → 0');
    console.log();

    if (DRY_RUN) {
      console.log('✅ Dry run complete - no changes made');
      console.log('   Run with --execute to perform the reset');
      return;
    }

    // Execute reset
    console.log('⚙️  Resetting jobs...');

    const result = await pool.query(`
      UPDATE kb.graph_embedding_jobs
      SET 
        status = 'pending',
        started_at = NULL,
        completed_at = NULL,
        attempt_count = 0,
        updated_at = NOW()
      WHERE status = 'completed'
    `);

    const resetCount = result.rowCount || 0;

    console.log(`✅ Reset ${resetCount} jobs to pending status`);
    console.log();

    // Show new stats
    const newStatsResult = await pool.query<JobStats>(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int as processing,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int as failed
      FROM kb.graph_embedding_jobs
    `);

    const afterStats = newStatsResult.rows[0];
    console.log('📊 Updated Job Statistics');
    console.log('-'.repeat(70));
    console.log(`  Total:      ${afterStats.total}`);
    console.log(
      `  Pending:    ${afterStats.pending} (↑ ${
        afterStats.pending - currentStats.pending
      })`
    );
    console.log(`  Processing: ${afterStats.processing}`);
    console.log(
      `  Completed:  ${afterStats.completed} (↓ ${
        currentStats.completed - afterStats.completed
      })`
    );
    console.log(`  Failed:     ${afterStats.failed}`);
    console.log();

    console.log('✅ Reset complete!');
    console.log();
    console.log('📋 Next Steps:');
    console.log(
      '  1. Embedding worker will automatically process pending jobs'
    );
    console.log('  2. Worker processes 5 jobs every 2 seconds');
    console.log(
      `  3. Estimated time: ~${
        Math.ceil(afterStats.pending / 5) * 2
      } seconds (${Math.ceil(afterStats.pending / 5 / 30)} minutes)`
    );
    console.log(
      '  4. Monitor progress: nx run workspace-cli:workspace:logs -- --service=server | grep embedding'
    );
    console.log(
      '  5. Check results: SELECT COUNT(*) FROM kb.graph_objects WHERE embedding_v2 IS NOT NULL'
    );
    console.log();
  } finally {
    await pool.end();
    console.log('✅ Database connection closed');
  }
}
main().catch((error) => {
  console.error('❌ Error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
