#!/usr/bin/env tsx
/**
 * Phase 2: Migrate Embedded Relationships to Explicit Table
 *
 * Converts embedded JSONB relationship properties to explicit records
 * in kb.graph_relationships table.
 *
 * Usage:
 *   npm run migrate:embedded-relationships
 *   npm run migrate:embedded-relationships -- --dry-run
 *   npm run migrate:embedded-relationships -- --type=Event
 *   npm run migrate:embedded-relationships -- --batch-size=100
 */

import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface EmbeddedRelationshipMapping {
  propertyPath: string; // e.g., 'parties', 'participants'
  relationshipType: string; // e.g., 'HAS_PARTY', 'HAS_PARTICIPANT'
  sourceObjectTypes: string[]; // Object types that have this property
  isArray: boolean; // true for arrays, false for single values
  isCanonicalId: boolean; // true if property contains UUIDs, false if names
}

const RELATIONSHIP_MAPPINGS: EmbeddedRelationshipMapping[] = [
  {
    propertyPath: 'parties',
    relationshipType: 'HAS_PARTY',
    sourceObjectTypes: ['Covenant'],
    isArray: true,
    isCanonicalId: false,
  },
  {
    propertyPath: 'participants',
    relationshipType: 'HAS_PARTICIPANT',
    sourceObjectTypes: ['Event'],
    isArray: true,
    isCanonicalId: false,
  },
  {
    propertyPath: 'participants_canonical_ids',
    relationshipType: 'HAS_PARTICIPANT',
    sourceObjectTypes: ['Event'],
    isArray: true,
    isCanonicalId: true,
  },
  {
    propertyPath: 'witnesses',
    relationshipType: 'HAS_WITNESS',
    sourceObjectTypes: ['Miracle', 'Event', 'Covenant'],
    isArray: true,
    isCanonicalId: false,
  },
  {
    propertyPath: 'performer',
    relationshipType: 'PERFORMED_BY',
    sourceObjectTypes: ['Miracle', 'Event'],
    isArray: false,
    isCanonicalId: false,
  },
];

interface MigrationOptions {
  dryRun: boolean;
  objectType?: string;
  batchSize: number;
  verbose: boolean;
}

interface MigrationStats {
  totalObjects: number;
  processedObjects: number;
  createdRelationships: number;
  skippedObjects: number;
  errors: number;
  unresolvedReferences: string[];
}

class EmbeddedRelationshipMigrator {
  private pool!: Pool;
  private stats: MigrationStats = {
    totalObjects: 0,
    processedObjects: 0,
    createdRelationships: 0,
    skippedObjects: 0,
    errors: 0,
    unresolvedReferences: [],
  };

  constructor(private options: MigrationOptions) {}

  async connect() {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;

    this.pool = new Pool({
      connectionString,
      max: 10,
    });

    // Test connection
    const client = await this.pool.connect();
    client.release();
    console.log('✓ Connected to database');
  }

  async disconnect() {
    await this.pool.end();
    console.log('✓ Disconnected from database');
  }

  /**
   * Main migration logic
   */
  async migrate() {
    console.log('\n=== Embedded Relationships Migration ===\n');
    console.log('Options:', {
      dryRun: this.options.dryRun,
      objectType: this.options.objectType || 'all',
      batchSize: this.options.batchSize,
    });
    console.log('');

    try {
      await this.connect();

      // Process each relationship mapping
      for (const mapping of RELATIONSHIP_MAPPINGS) {
        // Skip if filtering by object type and this mapping doesn't match
        if (
          this.options.objectType &&
          !mapping.sourceObjectTypes.includes(this.options.objectType)
        ) {
          continue;
        }

        await this.processMappingBatch(mapping);
      }

      this.printSummary();
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Process a single relationship mapping in batches
   */
  private async processMappingBatch(mapping: EmbeddedRelationshipMapping) {
    console.log(
      `\n--- Processing ${mapping.relationshipType} (${mapping.propertyPath}) ---`
    );

    const objectTypeFilter = mapping.sourceObjectTypes
      .map((t) => `'${t}'`)
      .join(',');

    // Count total objects
    const countResult = await this.pool.query(
      `
      SELECT COUNT(*) as count
      FROM kb.graph_objects
      WHERE type IN (${objectTypeFilter})
        AND properties->>'${mapping.propertyPath}' IS NOT NULL
        AND deleted_at IS NULL
    `
    );

    const totalCount = parseInt(countResult.rows[0].count);
    if (totalCount === 0) {
      console.log(`  No objects found with ${mapping.propertyPath}`);
      return;
    }

    console.log(`  Found ${totalCount} objects to process`);
    this.stats.totalObjects += totalCount;

    let offset = 0;
    while (offset < totalCount) {
      const objectsResult = await this.pool.query(
        `
        SELECT id, canonical_id, type, properties, project_id, branch_id
        FROM kb.graph_objects
        WHERE type IN (${objectTypeFilter})
          AND properties->>'${mapping.propertyPath}' IS NOT NULL
          AND deleted_at IS NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `,
        [this.options.batchSize, offset]
      );

      const objects = objectsResult.rows;

      for (const obj of objects) {
        await this.processObject(obj, mapping);
      }

      offset += this.options.batchSize;
      console.log(`  Progress: ${Math.min(offset, totalCount)}/${totalCount}`);
    }
  }

  /**
   * Process a single object and create relationships
   */
  private async processObject(obj: any, mapping: EmbeddedRelationshipMapping) {
    try {
      const propertyValue = obj.properties[mapping.propertyPath];

      if (!propertyValue) {
        this.stats.skippedObjects++;
        return;
      }

      // Convert to array for uniform processing
      const references: string[] = mapping.isArray
        ? propertyValue
        : [propertyValue];

      for (const reference of references) {
        if (!reference) continue;

        // Resolve reference to canonical_id
        const targetCanonicalId = mapping.isCanonicalId
          ? reference
          : await this.resolveNameToCanonicalId(
              reference,
              obj.project_id,
              obj.branch_id
            );

        if (!targetCanonicalId) {
          this.stats.unresolvedReferences.push(
            `${obj.type}:${obj.id} -> "${reference}" (${mapping.relationshipType})`
          );
          continue;
        }

        // Create relationship
        await this.createRelationship({
          fromCanonicalId: obj.canonical_id,
          toCanonicalId: targetCanonicalId,
          relationshipType: mapping.relationshipType,
          projectId: obj.project_id,
          branchId: obj.branch_id,
          propertyPath: mapping.propertyPath,
        });

        this.stats.createdRelationships++;
      }

      this.stats.processedObjects++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Error processing object ${obj.id}:`, message);
      this.stats.errors++;
    }
  }

  /**
   * Resolve entity name to canonical_id
   */
  private async resolveNameToCanonicalId(
    name: string,
    projectId: string,
    branchId: string
  ): Promise<string | null> {
    // Try exact match on name property
    const result = await this.pool.query(
      `
      SELECT canonical_id
      FROM kb.graph_objects
      WHERE project_id = $1
        AND branch_id = $2
        AND (
          properties->>'name' = $3
          OR key = $3
        )
        AND deleted_at IS NULL
      LIMIT 1
    `,
      [projectId, branchId, name]
    );

    if (result.rows.length > 0) {
      return result.rows[0].canonical_id;
    }

    // Try case-insensitive match
    const resultCaseInsensitive = await this.pool.query(
      `
      SELECT canonical_id
      FROM kb.graph_objects
      WHERE project_id = $1
        AND branch_id = $2
        AND (
          LOWER(properties->>'name') = LOWER($3)
          OR LOWER(key) = LOWER($3)
        )
        AND deleted_at IS NULL
      LIMIT 1
    `,
      [projectId, branchId, name]
    );

    return resultCaseInsensitive.rows.length > 0
      ? resultCaseInsensitive.rows[0].canonical_id
      : null;
  }

  /**
   * Create explicit relationship record
   */
  private async createRelationship(params: {
    fromCanonicalId: string;
    toCanonicalId: string;
    relationshipType: string;
    projectId: string;
    branchId: string;
    propertyPath: string;
  }) {
    if (this.options.dryRun) {
      if (this.options.verbose) {
        console.log(
          `    [DRY RUN] Would create: ${params.fromCanonicalId} -[${params.relationshipType}]-> ${params.toCanonicalId}`
        );
      }
      return;
    }

    // Check if relationship already exists
    const existing = await this.pool.query(
      `
      SELECT id FROM kb.graph_relationships
      WHERE src_id = $1
        AND dst_id = $2
        AND type = $3
        AND (branch_id = $4 OR (branch_id IS NULL AND $4 IS NULL))
        AND deleted_at IS NULL
      LIMIT 1
    `,
      [
        params.fromCanonicalId,
        params.toCanonicalId,
        params.relationshipType,
        params.branchId,
      ]
    );

    if (existing.rows.length > 0) {
      if (this.options.verbose) {
        console.log(`    ⚠️  Relationship already exists, skipping`);
      }
      this.stats.skippedObjects++;
      return;
    }

    // Generate canonical_id for relationship
    const relationshipCanonicalId = this.generateUUID();

    // Generate id for relationship
    const relationshipId = this.generateUUID();

    // Create relationship
    await this.pool.query(
      `
      INSERT INTO kb.graph_relationships (
        id,
        canonical_id,
        src_id,
        dst_id,
        type,
        project_id,
        branch_id,
        properties,
        version,
        content_hash
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid, $8::jsonb, 1,
        md5(($3::text || $4::text || $5 || $8::text)::text)::bytea
      )
    `,
      [
        relationshipId,
        relationshipCanonicalId,
        params.fromCanonicalId,
        params.toCanonicalId,
        params.relationshipType,
        params.projectId,
        params.branchId,
        JSON.stringify({
          _migrated_from: params.propertyPath,
          _migrated_at: new Date().toISOString(),
        }),
      ]
    );

    if (this.options.verbose) {
      console.log(
        `    ✓ Created: ${params.fromCanonicalId} -[${params.relationshipType}]-> ${params.toCanonicalId}`
      );
    }

    this.stats.createdRelationships++;
  }

  /**
   * Generate UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0,
          v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  /**
   * Print migration summary
   */
  private printSummary() {
    console.log('\n=== Migration Summary ===\n');
    console.log(`Total objects found:        ${this.stats.totalObjects}`);
    console.log(`Objects processed:          ${this.stats.processedObjects}`);
    console.log(
      `Relationships created:      ${this.stats.createdRelationships}`
    );
    console.log(`Objects skipped:            ${this.stats.skippedObjects}`);
    console.log(`Errors:                     ${this.stats.errors}`);
    console.log(
      `Unresolved references:      ${this.stats.unresolvedReferences.length}`
    );

    if (this.stats.unresolvedReferences.length > 0) {
      console.log('\nUnresolved References (first 10):');
      this.stats.unresolvedReferences.slice(0, 10).forEach((ref) => {
        console.log(`  - ${ref}`);
      });

      if (this.stats.unresolvedReferences.length > 10) {
        console.log(
          `  ... and ${this.stats.unresolvedReferences.length - 10} more`
        );
      }
    }

    if (this.options.dryRun) {
      console.log('\n⚠️  DRY RUN - No changes were made to the database');
    } else {
      console.log('\n✅ Migration completed successfully');
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);

  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    batchSize: 100,
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  // Parse --type=Event
  const typeArg = args.find((arg) => arg.startsWith('--type='));
  if (typeArg) {
    options.objectType = typeArg.split('=')[1];
  }

  // Parse --batch-size=100
  const batchArg = args.find((arg) => arg.startsWith('--batch-size='));
  if (batchArg) {
    options.batchSize = parseInt(batchArg.split('=')[1]);
  }

  return options;
}

/**
 * Main entry point
 */
async function main() {
  const options = parseArgs();
  const migrator = new EmbeddedRelationshipMigrator(options);

  try {
    await migrator.migrate();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if executed directly (ES module compatible check)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}

export { EmbeddedRelationshipMigrator, MigrationOptions };
