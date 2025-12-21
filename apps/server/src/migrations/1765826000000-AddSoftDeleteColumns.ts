import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Soft Delete Columns
 *
 * Adds deleted_at columns to user_profiles, projects, and orgs tables
 * to support soft deletion of accounts and their associated resources.
 *
 * Soft delete approach:
 * - deleted_at = NULL means the record is active
 * - deleted_at = timestamp means the record was deleted at that time
 * - Queries should filter WHERE deleted_at IS NULL for active records
 */
export class AddSoftDeleteColumns1765826000000 implements MigrationInterface {
  name = 'AddSoftDeleteColumns1765826000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add deleted_at to user_profiles
    await queryRunner.query(`
      ALTER TABLE core.user_profiles
      ADD COLUMN deleted_at TIMESTAMPTZ;

      COMMENT ON COLUMN core.user_profiles.deleted_at IS 'Soft delete timestamp (null = active, timestamp = deleted)';

      CREATE INDEX idx_user_profiles_deleted_at ON core.user_profiles (deleted_at)
      WHERE deleted_at IS NULL;
    `);

    // Add deleted_at to projects
    await queryRunner.query(`
      ALTER TABLE kb.projects
      ADD COLUMN deleted_at TIMESTAMPTZ;

      COMMENT ON COLUMN kb.projects.deleted_at IS 'Soft delete timestamp (null = active, timestamp = deleted)';

      CREATE INDEX idx_projects_deleted_at ON kb.projects (deleted_at)
      WHERE deleted_at IS NULL;
    `);

    // Add deleted_at to orgs
    await queryRunner.query(`
      ALTER TABLE kb.orgs
      ADD COLUMN deleted_at TIMESTAMPTZ;

      COMMENT ON COLUMN kb.orgs.deleted_at IS 'Soft delete timestamp (null = active, timestamp = deleted)';

      CREATE INDEX idx_orgs_deleted_at ON kb.orgs (deleted_at)
      WHERE deleted_at IS NULL;
    `);

    // Add deleted_by to track who deleted the record (optional but useful for audit)
    await queryRunner.query(`
      ALTER TABLE core.user_profiles
      ADD COLUMN deleted_by UUID REFERENCES core.user_profiles(id);

      COMMENT ON COLUMN core.user_profiles.deleted_by IS 'User who performed the deletion (for audit trail)';
    `);

    await queryRunner.query(`
      ALTER TABLE kb.projects
      ADD COLUMN deleted_by UUID REFERENCES core.user_profiles(id);

      COMMENT ON COLUMN kb.projects.deleted_by IS 'User who performed the deletion (for audit trail)';
    `);

    await queryRunner.query(`
      ALTER TABLE kb.orgs
      ADD COLUMN deleted_by UUID REFERENCES core.user_profiles(id);

      COMMENT ON COLUMN kb.orgs.deleted_by IS 'User who performed the deletion (for audit trail)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove from orgs
    await queryRunner.query(`
      ALTER TABLE kb.orgs
      DROP COLUMN IF EXISTS deleted_by,
      DROP COLUMN IF EXISTS deleted_at;

      DROP INDEX IF EXISTS kb.idx_orgs_deleted_at;
    `);

    // Remove from projects
    await queryRunner.query(`
      ALTER TABLE kb.projects
      DROP COLUMN IF EXISTS deleted_by,
      DROP COLUMN IF EXISTS deleted_at;

      DROP INDEX IF EXISTS kb.idx_projects_deleted_at;
    `);

    // Remove from user_profiles
    await queryRunner.query(`
      ALTER TABLE core.user_profiles
      DROP COLUMN IF EXISTS deleted_by,
      DROP COLUMN IF EXISTS deleted_at;

      DROP INDEX IF EXISTS core.idx_user_profiles_deleted_at;
    `);
  }
}
