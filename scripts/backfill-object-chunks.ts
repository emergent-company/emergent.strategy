#!/usr/bin/env tsx
/**
 * Backfill script: Migrate _extraction_source_id to object_chunks table
 *
 * This script migrates existing object provenance data from the properties-based
 * approach (_extraction_source_id in properties) to the new object_chunks join table.
 *
 * Strategy: Links objects to ALL chunks from their source document(s).
 * This provides complete context for refinement chat. More granular tracking
 * (specific chunks per entity) can be added to extraction pipeline later if needed.
 *
 * Usage:
 *   npx tsx scripts/backfill-object-chunks.ts              # Dry run (preview)
 *   npx tsx scripts/backfill-object-chunks.ts --execute    # Actually backfill
 */

import path from 'node:path';
import fs from 'node:fs';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

const DRY_RUN = !process.argv.includes('--execute');

// Load .env files
(() => {
  const envFiles = ['.env', '.env.local', '.env.test.local'];
  for (const file of envFiles) {
    const envPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
      console.log(`[backfill-object-chunks] Loaded environment from ${file}`);
    }
  }
})();

interface GraphObjectRow {
  id: string;
  properties: Record<string, unknown>;
  extraction_job_id: string | null;
}

interface ChunkRow {
  id: string;
  document_id: string;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Backfill: _extraction_source_id to object_chunks');
  console.log('='.repeat(60));
  console.log(
    `Mode: ${
      DRY_RUN ? 'DRY RUN (no changes) - use --execute to apply' : 'LIVE RUN'
    }`
  );
  console.log('');

  const pool = new Pool({
    host: process.env.POSTGRES_HOST || process.env.DATABASE_HOST || 'localhost',
    port: parseInt(
      process.env.POSTGRES_PORT || process.env.DATABASE_PORT || '5432'
    ),
    user:
      process.env.POSTGRES_USER || process.env.DATABASE_USERNAME || 'postgres',
    password:
      process.env.POSTGRES_PASSWORD ||
      process.env.DATABASE_PASSWORD ||
      'postgres',
    database:
      process.env.POSTGRES_DB || process.env.DATABASE_NAME || 'emergent',
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('Connected to database');
    console.log('');

    // 1. Check if object_chunks table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'kb' AND table_name = 'object_chunks'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('ERROR: kb.object_chunks table does not exist.');
      console.error('Run migrations first: nx run server:migration:run');
      process.exit(1);
    }

    // 2. Find all objects with _extraction_source_id in properties
    const objectsResult = await pool.query<GraphObjectRow>(`
      SELECT id, properties, extraction_job_id
      FROM kb.graph_objects
      WHERE properties->>'_extraction_source_id' IS NOT NULL
        AND deleted_at IS NULL
        AND supersedes_id IS NULL
    `);

    const objects = objectsResult.rows;
    console.log(`Found ${objects.length} objects with _extraction_source_id`);

    if (objects.length === 0) {
      console.log('Nothing to backfill!');
      return;
    }

    // 3. Process each object
    let successCount = 0;
    let skipCount = 0;
    let linksCreated = 0;

    for (const obj of objects) {
      const sourceId = obj.properties._extraction_source_id as
        | string
        | undefined;
      const sourceIds =
        (obj.properties._extraction_source_ids as string[]) || [];

      // Collect all document IDs
      const documentIds = new Set<string>();
      if (sourceId) documentIds.add(sourceId);
      sourceIds.forEach((id) => documentIds.add(id));

      if (documentIds.size === 0) {
        skipCount++;
        continue;
      }

      // 4. Get all chunks for these documents
      const chunksResult = await pool.query<ChunkRow>(
        `
        SELECT id, document_id
        FROM kb.chunks
        WHERE document_id = ANY($1)
      `,
        [[...documentIds]]
      );

      const chunks = chunksResult.rows;

      if (chunks.length === 0) {
        skipCount++;
        continue;
      }

      // 5. Insert object_chunks records (skip if already exists)
      if (!DRY_RUN) {
        for (const chunk of chunks) {
          const result = await pool.query(
            `
            INSERT INTO kb.object_chunks (object_id, chunk_id, extraction_job_id, confidence, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (object_id, chunk_id) DO NOTHING
            RETURNING id
          `,
            [
              obj.id,
              chunk.id,
              obj.extraction_job_id,
              (obj.properties._extraction_confidence as number) || null,
            ]
          );

          if (result.rowCount && result.rowCount > 0) {
            linksCreated++;
          }
        }
      } else {
        linksCreated += chunks.length;
      }

      successCount++;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Objects processed: ${successCount}`);
    console.log(`  Objects skipped:   ${skipCount} (no chunks found)`);
    console.log(
      `  Links ${DRY_RUN ? 'would be ' : ''}created: ${linksCreated}`
    );
    console.log('='.repeat(60));

    if (DRY_RUN) {
      console.log('');
      console.log('This was a dry run. To apply changes, run with --execute');
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
