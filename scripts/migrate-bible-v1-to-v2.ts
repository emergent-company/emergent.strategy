#!/usr/bin/env tsx
/**
 * Migration Script: Bible Template Pack v1.0 → v2.0
 *
 * This script migrates existing graph objects created with the v1.0 Bible template pack
 * to use the v2.0 schema with proper entity references.
 *
 * WHAT IT DOES:
 * 1. Finds all v1.0 Bible objects (no _schema_version or version="1.0.0")
 * 2. Resolves entity name references to canonical_ids
 * 3. Creates new versions with updated properties
 * 4. Preserves full version history
 *
 * USAGE:
 *   npm run migrate:bible-v1-to-v2 -- --project-id=<uuid> [--dry-run]
 *
 * OPTIONS:
 *   --project-id   Required: Project UUID to migrate
 *   --dry-run      Optional: Show what would be migrated without making changes
 *   --batch-size   Optional: Number of objects to process at once (default: 50)
 *
 * SAFETY:
 * - Non-destructive: Creates new versions, preserves old versions
 * - Transactional: Each object update is atomic
 * - Rollback: Can revert by deleting new versions
 * - Dry-run mode: Test before applying
 */

import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import { Pool, PoolClient } from 'pg';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

// Load environment
const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[migrate-bible] Loaded environment from ${envPath}\n`);
}

// Validate required environment variables
validateEnvVars(DB_REQUIREMENTS);

// Parse command-line arguments
const args = process.argv.slice(2);
let projectId: string | undefined;
let dryRun = false;
let batchSize = 50;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-id' && i + 1 < args.length) {
    projectId = args[i + 1];
    i++;
  } else if (args[i].startsWith('--project-id=')) {
    projectId = args[i].split('=')[1];
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  } else if (args[i] === '--batch-size' && i + 1 < args.length) {
    batchSize = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i].startsWith('--batch-size=')) {
    batchSize = parseInt(args[i].split('=')[1], 10);
  }
}

// Validation
if (!projectId) {
  console.error('Error: Missing required argument: --project-id\n');
  console.log(
    'Usage: npm run migrate:bible-v1-to-v2 -- --project-id=<uuid> [--dry-run] [--batch-size=50]\n'
  );
  process.exit(1);
}

const pool = new Pool(getDbConfig());

interface V1Object {
  id: string;
  canonical_id: string;
  type: string;
  key: string;
  properties: any;
  version: number;
}

interface MigrationResult {
  objectId: string;
  canonical_id: string;
  type: string;
  status: 'migrated' | 'skipped' | 'failed';
  reason?: string;
  changes?: string[];
}

/**
 * Find entity by name and type, return canonical_id
 */
async function findEntityCanonicalId(
  client: PoolClient,
  type: string,
  name: string,
  projectId: string
): Promise<string | null> {
  if (!name) return null;

  const result = await client.query(
    `SELECT canonical_id FROM kb.graph_objects 
     WHERE project_id = $1 
       AND type = $2 
       AND key = $3
       AND deleted_at IS NULL
     LIMIT 1`,
    [projectId, type, name.toLowerCase().trim()]
  );

  return result.rows.length > 0 ? result.rows[0].canonical_id : null;
}

/**
 * Migrate a Person entity from v1 to v2
 */
async function migratePersonProperties(
  client: PoolClient,
  v1Props: any,
  projectId: string
): Promise<{ properties: any; changes: string[] }> {
  const v2Props = { ...v1Props };
  const changes: string[] = [];

  // Convert tribe string → canonical_id
  if (v1Props.tribe && typeof v1Props.tribe === 'string') {
    const canonical_id = await findEntityCanonicalId(
      client,
      'Group',
      v1Props.tribe,
      projectId
    );
    if (canonical_id) {
      v2Props.tribe_canonical_id = canonical_id;
      v2Props._tribe_display_name = v1Props.tribe;
      delete v2Props.tribe;
      changes.push(`tribe: "${v1Props.tribe}" → canonical_id: ${canonical_id}`);
    }
  }

  // Convert birth_location string → canonical_id
  if (v1Props.birth_location && typeof v1Props.birth_location === 'string') {
    const canonical_id = await findEntityCanonicalId(
      client,
      'Place',
      v1Props.birth_location,
      projectId
    );
    if (canonical_id) {
      v2Props.birth_location_canonical_id = canonical_id;
      v2Props._birth_location_display_name = v1Props.birth_location;
      delete v2Props.birth_location;
      changes.push(
        `birth_location: "${v1Props.birth_location}" → canonical_id: ${canonical_id}`
      );
    }
  }

  // Convert death_location string → canonical_id
  if (v1Props.death_location && typeof v1Props.death_location === 'string') {
    const canonical_id = await findEntityCanonicalId(
      client,
      'Place',
      v1Props.death_location,
      projectId
    );
    if (canonical_id) {
      v2Props.death_location_canonical_id = canonical_id;
      v2Props._death_location_display_name = v1Props.death_location;
      delete v2Props.death_location;
      changes.push(
        `death_location: "${v1Props.death_location}" → canonical_id: ${canonical_id}`
      );
    }
  }

  // Add schema version
  v2Props._schema_version = '2.0.0';
  v2Props._migrated_at = new Date().toISOString();
  v2Props._migrated_from_version = v1Props._schema_version || '1.0.0';

  return { properties: v2Props, changes };
}

/**
 * Migrate a Place entity from v1 to v2
 */
async function migratePlaceProperties(
  client: PoolClient,
  v1Props: any,
  projectId: string
): Promise<{ properties: any; changes: string[] }> {
  const v2Props = { ...v1Props };
  const changes: string[] = [];

  // Convert region string → canonical_id
  if (v1Props.region && typeof v1Props.region === 'string') {
    const canonical_id = await findEntityCanonicalId(
      client,
      'Place',
      v1Props.region,
      projectId
    );
    if (canonical_id) {
      v2Props.region_canonical_id = canonical_id;
      v2Props._region_display_name = v1Props.region;
      delete v2Props.region;
      changes.push(
        `region: "${v1Props.region}" → canonical_id: ${canonical_id}`
      );
    }
  }

  // Convert country string → canonical_id
  if (v1Props.country && typeof v1Props.country === 'string') {
    const canonical_id = await findEntityCanonicalId(
      client,
      'Place',
      v1Props.country,
      projectId
    );
    if (canonical_id) {
      v2Props.country_canonical_id = canonical_id;
      v2Props._country_display_name = v1Props.country;
      delete v2Props.country;
      changes.push(
        `country: "${v1Props.country}" → canonical_id: ${canonical_id}`
      );
    }
  }

  v2Props._schema_version = '2.0.0';
  v2Props._migrated_at = new Date().toISOString();
  v2Props._migrated_from_version = v1Props._schema_version || '1.0.0';

  return { properties: v2Props, changes };
}

/**
 * Migrate an Event entity from v1 to v2
 */
async function migrateEventProperties(
  client: PoolClient,
  v1Props: any,
  projectId: string
): Promise<{ properties: any; changes: string[] }> {
  const v2Props = { ...v1Props };
  const changes: string[] = [];

  // Convert location string → canonical_id
  if (v1Props.location && typeof v1Props.location === 'string') {
    const canonical_id = await findEntityCanonicalId(
      client,
      'Place',
      v1Props.location,
      projectId
    );
    if (canonical_id) {
      v2Props.location_canonical_id = canonical_id;
      v2Props._location_display_name = v1Props.location;
      delete v2Props.location;
      changes.push(
        `location: "${v1Props.location}" → canonical_id: ${canonical_id}`
      );
    }
  }

  // Convert participants array of strings → array of canonical_ids
  if (v1Props.participants && Array.isArray(v1Props.participants)) {
    const canonicalIds: string[] = [];
    const displayNames: string[] = [];

    for (const participant of v1Props.participants) {
      if (typeof participant === 'string') {
        const canonical_id = await findEntityCanonicalId(
          client,
          'Person',
          participant,
          projectId
        );
        if (canonical_id) {
          canonicalIds.push(canonical_id);
          displayNames.push(participant);
        }
      }
    }

    if (canonicalIds.length > 0) {
      v2Props.participants_canonical_ids = canonicalIds;
      v2Props._participants_display_names = displayNames;
      delete v2Props.participants;
      changes.push(
        `participants: [${displayNames.join(', ')}] → canonical_ids: [${
          canonicalIds.length
        } resolved]`
      );
    }
  }

  v2Props._schema_version = '2.0.0';
  v2Props._migrated_at = new Date().toISOString();
  v2Props._migrated_from_version = v1Props._schema_version || '1.0.0';

  return { properties: v2Props, changes };
}

/**
 * Migrate generic entity (adds schema version, no reference conversion)
 */
function migrateGenericProperties(v1Props: any): {
  properties: any;
  changes: string[];
} {
  const v2Props = {
    ...v1Props,
    _schema_version: '2.0.0',
    _migrated_at: new Date().toISOString(),
    _migrated_from_version: v1Props._schema_version || '1.0.0',
  };

  return {
    properties: v2Props,
    changes: ['Added schema version tracking'],
  };
}

/**
 * Migrate a single object
 */
async function migrateObject(
  client: PoolClient,
  obj: V1Object,
  projectId: string,
  dryRun: boolean
): Promise<MigrationResult> {
  try {
    // Check if already migrated
    if (obj.properties._schema_version === '2.0.0') {
      return {
        objectId: obj.id,
        canonical_id: obj.canonical_id,
        type: obj.type,
        status: 'skipped',
        reason: 'Already migrated to v2.0',
      };
    }

    // Migrate based on type
    let migration: { properties: any; changes: string[] };

    switch (obj.type) {
      case 'Person':
        migration = await migratePersonProperties(
          client,
          obj.properties,
          projectId
        );
        break;
      case 'Place':
        migration = await migratePlaceProperties(
          client,
          obj.properties,
          projectId
        );
        break;
      case 'Event':
        migration = await migrateEventProperties(
          client,
          obj.properties,
          projectId
        );
        break;
      default:
        // For other types, just add schema version
        migration = migrateGenericProperties(obj.properties);
        break;
    }

    if (
      migration.changes.length === 0 ||
      (migration.changes.length === 1 &&
        migration.changes[0].includes('schema version'))
    ) {
      return {
        objectId: obj.id,
        canonical_id: obj.canonical_id,
        type: obj.type,
        status: 'skipped',
        reason: 'No references to migrate',
        changes: migration.changes,
      };
    }

    // Create new version (if not dry-run)
    if (!dryRun) {
      await client.query('BEGIN');

      try {
        // Create new version
        await client.query(
          `INSERT INTO kb.graph_objects (
            project_id, branch_id, type, key, status, properties, labels, 
            version, canonical_id, supersedes_id, 
            change_summary, content_hash, 
            extraction_job_id, extraction_confidence, needs_review
          )
          SELECT 
            project_id, branch_id, type, key, status, $1::jsonb, labels,
            version + 1, canonical_id, id,
            $2::jsonb, NULL,
            extraction_job_id, extraction_confidence, needs_review
          FROM kb.graph_objects
          WHERE id = $3`,
          [
            JSON.stringify(migration.properties),
            JSON.stringify({
              migration: 'v1.0 → v2.0',
              changes: migration.changes,
              migrated_at: new Date().toISOString(),
            }),
            obj.id,
          ]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return {
      objectId: obj.id,
      canonical_id: obj.canonical_id,
      type: obj.type,
      status: 'migrated',
      changes: migration.changes,
    };
  } catch (error) {
    return {
      objectId: obj.id,
      canonical_id: obj.canonical_id,
      type: obj.type,
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main migration function
 */
async function migrate() {
  const client = await pool.connect();

  try {
    console.log('=== Bible Template Pack Migration: v1.0 → v2.0 ===\n');
    console.log('Project ID:', projectId);
    console.log('Dry Run:', dryRun ? 'YES (no changes will be made)' : 'NO');
    console.log('Batch Size:', batchSize);
    console.log();

    // Find all v1.0 objects
    console.log('Finding v1.0 objects...');
    const result = await client.query<V1Object>(
      `SELECT id, canonical_id, type, key, properties, version
       FROM kb.graph_objects
       WHERE project_id = $1
         AND type IN ('Person', 'Place', 'Event', 'Book', 'Quote', 'Group', 'Object', 'Covenant', 'Prophecy', 'Miracle', 'Angel')
         AND deleted_at IS NULL
         AND (properties->>'_schema_version' IS NULL OR properties->>'_schema_version' = '1.0.0')
       ORDER BY type, key`,
      [projectId]
    );

    console.log(`Found ${result.rows.length} objects to migrate\n`);

    if (result.rows.length === 0) {
      console.log('✓ No objects to migrate!');
      return;
    }

    // Group by type for reporting
    const byType: Record<string, number> = {};
    for (const obj of result.rows) {
      byType[obj.type] = (byType[obj.type] || 0) + 1;
    }

    console.log('Objects by type:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log();

    if (dryRun) {
      console.log('=== DRY RUN MODE - Showing migration preview ===\n');
    }

    // Process in batches
    const results: MigrationResult[] = [];
    let processed = 0;

    for (let i = 0; i < result.rows.length; i += batchSize) {
      const batch = result.rows.slice(i, i + batchSize);

      for (const obj of batch) {
        const migrationResult = await migrateObject(
          client,
          obj,
          projectId!,
          dryRun
        );
        results.push(migrationResult);
        processed++;

        if (migrationResult.status === 'migrated') {
          console.log(
            `✓ [${processed}/${result.rows.length}] ${migrationResult.type} "${obj.key}" (${migrationResult.changes?.length} changes)`
          );
          if (migrationResult.changes && migrationResult.changes.length > 0) {
            for (const change of migrationResult.changes) {
              console.log(`    - ${change}`);
            }
          }
        } else if (migrationResult.status === 'failed') {
          console.log(
            `✗ [${processed}/${result.rows.length}] ${migrationResult.type} "${obj.key}" - FAILED: ${migrationResult.reason}`
          );
        } else if (migrationResult.status === 'skipped') {
          console.log(
            `⊘ [${processed}/${result.rows.length}] ${migrationResult.type} "${obj.key}" - ${migrationResult.reason}`
          );
        }
      }
    }

    // Summary
    console.log('\n=== Migration Summary ===\n');
    const migrated = results.filter((r) => r.status === 'migrated').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    console.log(`Total objects processed: ${results.length}`);
    console.log(`✓ Migrated: ${migrated}`);
    console.log(`⊘ Skipped: ${skipped}`);
    console.log(`✗ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed objects:');
      const failures = results.filter((r) => r.status === 'failed');
      for (const failure of failures) {
        console.log(
          `  - ${failure.type} (${failure.objectId}): ${failure.reason}`
        );
      }
    }

    if (dryRun) {
      console.log('\n=== DRY RUN COMPLETE - No changes were made ===');
      console.log('Run without --dry-run to apply migration');
    } else {
      console.log('\n✓ Migration complete!');
    }
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate();
