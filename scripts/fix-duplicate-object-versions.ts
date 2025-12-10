#!/usr/bin/env tsx
/**
 * Fix duplicate version objects in kb.graph_objects
 *
 * This script fixes a data integrity issue where objects have duplicate
 * version numbers for the same canonical_id, causing:
 * - "already_deleted" errors when trying to delete objects
 * - Deleted objects reappearing in search results
 *
 * Root cause: The restoreObject function could create versions that already exist.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-object-versions.ts
 *   npx tsx scripts/fix-duplicate-object-versions.ts --dry-run
 */

import { Pool, PoolConfig } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';

// Load .env early (allow override via DOTENV_PATH)
(() => {
  const envPath =
    process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[fix-duplicate-versions] Loaded environment from ${envPath}`);
  } else {
    console.log(
      '[fix-duplicate-versions] No .env found (proceeding with process env)'
    );
  }
})();

function getDbConfig(): PoolConfig {
  // Try DATABASE_URL first, then individual POSTGRES_* vars
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT;
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;

  if (!host || !port || !user || !password || !database) {
    console.error('❌ Missing database configuration.');
    console.error('   Set DATABASE_URL or POSTGRES_HOST/PORT/USER/PASSWORD/DB');
    process.exit(1);
  }

  return {
    host,
    port: parseInt(port, 10),
    user,
    password,
    database,
  };
}

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const dbConfig = getDbConfig();
  const pool = new Pool(dbConfig);

  const client = await pool.connect();

  try {
    console.log('=== Fix Duplicate Object Versions ===\n');
    console.log(
      `Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}\n`
    );

    // Step 1: Find all duplicates
    const duplicatesQuery = `
      WITH duplicates AS (
        SELECT 
          id,
          canonical_id,
          version,
          created_at,
          deleted_at,
          ROW_NUMBER() OVER (PARTITION BY canonical_id, version ORDER BY created_at DESC) as rn
        FROM kb.graph_objects
        WHERE (canonical_id, version) IN (
          SELECT canonical_id, version
          FROM kb.graph_objects
          GROUP BY canonical_id, version
          HAVING COUNT(*) > 1
        )
      )
      SELECT id, canonical_id, version, created_at, deleted_at, rn
      FROM duplicates
      WHERE rn > 1  -- These are the older duplicates to delete
      ORDER BY canonical_id, version, rn;
    `;

    const duplicatesResult = await client.query(duplicatesQuery);

    if (duplicatesResult.rowCount === 0) {
      console.log('No duplicate versions found. Database is clean.');
      return;
    }

    console.log(
      `Found ${duplicatesResult.rowCount} duplicate rows to delete:\n`
    );
    console.table(
      duplicatesResult.rows.map((r) => ({
        id: r.id,
        canonical_id: r.canonical_id.substring(0, 8) + '...',
        version: r.version,
        created_at: r.created_at,
        deleted_at: r.deleted_at ? 'YES' : 'NO',
      }))
    );

    if (dryRun) {
      console.log('\n[DRY RUN] Would delete the above rows.');
      console.log('Run without --dry-run to apply changes.');
      return;
    }

    // Step 2: Delete duplicates in a transaction
    const idsToDelete = duplicatesResult.rows.map((r) => r.id);

    await client.query('BEGIN');

    try {
      // First, check for any relationships pointing to these objects
      const relCheck = await client.query(
        `SELECT COUNT(*) as cnt FROM kb.graph_relationships 
         WHERE src_id = ANY($1::uuid[]) OR dst_id = ANY($1::uuid[])`,
        [idsToDelete]
      );

      if (parseInt(relCheck.rows[0].cnt) > 0) {
        console.log(
          `\nWarning: ${relCheck.rows[0].cnt} relationships reference these objects.`
        );
        console.log('These relationships may also need cleanup.\n');
      }

      // Delete the duplicate rows
      const deleteResult = await client.query(
        `DELETE FROM kb.graph_objects WHERE id = ANY($1::uuid[]) RETURNING id`,
        [idsToDelete]
      );

      console.log(`\nDeleted ${deleteResult.rowCount} duplicate rows.`);

      await client.query('COMMIT');
      console.log('Transaction committed successfully.');

      // Verify the fix
      const verifyResult = await client.query(`
        SELECT COUNT(*) as duplicate_count
        FROM (
          SELECT canonical_id, version
          FROM kb.graph_objects
          GROUP BY canonical_id, version
          HAVING COUNT(*) > 1
        ) as dups
      `);

      console.log(
        `\nVerification: ${verifyResult.rows[0].duplicate_count} duplicate version groups remaining.`
      );
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
