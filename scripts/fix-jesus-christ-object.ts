#!/usr/bin/env tsx
/**
 * Fix corrupted database state for "Jesus Christ" object
 *
 * Problem: The deleteObject function had a bug where it created a tombstone
 * but didn't mark the original object as deleted. This caused:
 * - Original: id=0a312015..., version=3, deleted_at=null (still visible!)
 * - Tombstone: id=f6656f0c..., version=3, deleted_at=set, supersedes_id=original
 *
 * Both have version 3 which is also wrong (tombstone should be version 4)
 *
 * Fix: Mark the original as deleted to match the tombstone
 */

import { Pool } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { getDbConfig } from './lib/env-validator.js';

// Load .env early (allow override via DOTENV_PATH)
(() => {
  const envPath =
    process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[fix-object] Loaded environment from ${envPath}`);
  } else {
    console.log('[fix-object] No .env found (proceeding with process env)');
  }
})();

async function main() {
  const dbConfig = getDbConfig();
  const pool = new Pool(dbConfig);

  try {
    console.log('[fix-object] Connected to database');

    // First, verify the current state
    const before = await pool.query(`
      SELECT id, canonical_id, version, supersedes_id, deleted_at, key
      FROM kb.graph_objects 
      WHERE canonical_id = 'ab88b929-f6bc-4563-b280-b2c73b6aa594'
      ORDER BY version DESC, created_at DESC
    `);

    console.log('\nBefore fix:');
    console.table(before.rows);

    // Mark the original object as deleted
    const result = await pool.query(`
      UPDATE kb.graph_objects 
      SET deleted_at = '2025-12-04T14:13:12.151Z'
      WHERE id = '0a312015-8b24-488c-9823-117e0277fcff' 
        AND deleted_at IS NULL
    `);

    console.log(`\nUpdated ${result.rowCount} row(s)`);

    // Also fix the version: tombstone should be version 4
    const versionFix = await pool.query(`
      UPDATE kb.graph_objects 
      SET version = 4
      WHERE id = 'f6656f0c-de6b-40ea-b5d1-cc6361efdf51'
    `);

    console.log(`Fixed tombstone version: ${versionFix.rowCount} row(s)`);

    // Verify the fix
    const after = await pool.query(`
      SELECT id, canonical_id, version, supersedes_id, deleted_at, key
      FROM kb.graph_objects 
      WHERE canonical_id = 'ab88b929-f6bc-4563-b280-b2c73b6aa594'
      ORDER BY version DESC, created_at DESC
    `);

    console.log('\nAfter fix:');
    console.table(after.rows);

    // Check if there are related relationships that need cleanup
    const relationships = await pool.query(`
      SELECT COUNT(*) as count
      FROM kb.graph_relationships 
      WHERE (src_id = '0a312015-8b24-488c-9823-117e0277fcff' 
         OR dst_id = '0a312015-8b24-488c-9823-117e0277fcff')
        AND deleted_at IS NULL
    `);

    console.log(
      `\nActive relationships pointing to this object: ${relationships.rows[0].count}`
    );
    console.log(
      'Note: These relationships may need to be cleaned up or will be orphaned.'
    );
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('\n[fix-object] Disconnected from database');
  }
}

main();
