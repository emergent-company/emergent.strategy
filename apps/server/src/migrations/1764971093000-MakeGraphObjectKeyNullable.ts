import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Make graph_objects.key column nullable
 *
 * The `key` column was originally intended as a business key for deduplication,
 * but this creates issues with extraction workflows where we want to always
 * create new objects and handle deduplication in a separate merge process.
 *
 * Changes:
 * 1. Make `key` column nullable
 * 2. Drop the unique partial index on (project_id, branch_id, type, key)
 *
 * The `id` column (auto-generated UUID) remains the primary identifier.
 * Entity names are stored in properties.name.
 * Deduplication will be handled by a separate merge agent process.
 */
export class MakeGraphObjectKeyNullable1764971093000
  implements MigrationInterface
{
  name = 'MakeGraphObjectKeyNullable1764971093000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the unique partial index on (project_id, branch_id, type, key)
    // This index was preventing duplicate keys even when we wanted to create new objects
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_fa75fed9ce3b25732c0bf7bf24"
    `);

    // 2. Make the key column nullable
    await queryRunner.query(`
      ALTER TABLE kb.graph_objects
      ALTER COLUMN key DROP NOT NULL
    `);

    // 3. Create a new non-unique index on key for lookup performance (optional)
    // This allows efficient lookups by key without enforcing uniqueness
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_graph_objects_key"
      ON kb.graph_objects (project_id, type, key)
      WHERE key IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the non-unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_graph_objects_key"
    `);

    // 2. Set a default key for any NULL keys (required before making NOT NULL)
    // Use the id as a fallback key
    await queryRunner.query(`
      UPDATE kb.graph_objects
      SET key = id::text
      WHERE key IS NULL
    `);

    // 3. Make the key column NOT NULL again
    await queryRunner.query(`
      ALTER TABLE kb.graph_objects
      ALTER COLUMN key SET NOT NULL
    `);

    // 4. Recreate the unique partial index
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_fa75fed9ce3b25732c0bf7bf24"
      ON kb.graph_objects (project_id, branch_id, type, key)
      WHERE deleted_at IS NULL AND supersedes_id IS NULL AND key IS NOT NULL
    `);
  }
}
