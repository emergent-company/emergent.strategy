import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixes the unique constraint on graph_objects to support branching.
 *
 * The previous constraint enforced uniqueness of (project_id, type, key) across
 * ALL branches, which prevented the same key from existing on different branches.
 *
 * This migration:
 * 1. Drops the old constraint that doesn't include branch_id
 * 2. Creates a new constraint that includes branch_id in the unique index
 * 3. Adds supersedes_id IS NULL and key IS NOT NULL to the WHERE clause for correctness
 *
 * This allows the same key to exist on multiple branches within a project,
 * which is essential for the branching functionality.
 */
export class FixGraphObjectsBranchingConstraint1763066516255
  implements MigrationInterface
{
  name = 'FixGraphObjectsBranchingConstraint1763066516255';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the old constraint that doesn't include branch_id
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."IDX_5cbe2822f76435535640d37da9"`
    );

    // Create the new branch-aware constraint
    // This allows the same (type, key) to exist on different branches
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5cbe2822f76435535640d37da9" ON "kb"."graph_objects" ("project_id", "branch_id", "type", "key") WHERE deleted_at IS NULL AND supersedes_id IS NULL AND key IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to the old constraint (without branch_id)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."IDX_5cbe2822f76435535640d37da9"`
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5cbe2822f76435535640d37da9" ON "kb"."graph_objects" ("project_id", "type", "key") WHERE deleted_at IS NULL`
    );
  }
}
