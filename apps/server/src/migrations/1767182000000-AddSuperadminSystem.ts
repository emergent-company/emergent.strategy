import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Superadmin System
 *
 * Creates the superadmin infrastructure:
 * 1. core.superadmins table - tracks system-wide admin grants with audit trail
 * 2. last_activity_at column on user_profiles - tracks user activity for dashboard
 */
export class AddSuperadminSystem1767182000000 implements MigrationInterface {
  name = 'AddSuperadminSystem1767182000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create superadmins table
    await queryRunner.query(`
      CREATE TABLE core.superadmins (
        user_id UUID PRIMARY KEY REFERENCES core.user_profiles(id) ON DELETE CASCADE,
        granted_by UUID REFERENCES core.user_profiles(id) ON DELETE SET NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ NULL,
        revoked_by UUID REFERENCES core.user_profiles(id) ON DELETE SET NULL,
        notes TEXT NULL
      );

      COMMENT ON TABLE core.superadmins IS 'System-wide superadmin grants with audit trail';
      COMMENT ON COLUMN core.superadmins.user_id IS 'User who has superadmin access';
      COMMENT ON COLUMN core.superadmins.granted_by IS 'User who granted superadmin access (null if via migration/CLI)';
      COMMENT ON COLUMN core.superadmins.granted_at IS 'When superadmin access was granted';
      COMMENT ON COLUMN core.superadmins.revoked_at IS 'When superadmin access was revoked (null = active)';
      COMMENT ON COLUMN core.superadmins.revoked_by IS 'User who revoked superadmin access';
      COMMENT ON COLUMN core.superadmins.notes IS 'Optional notes about the grant (e.g., reason)';

      -- Index for quickly checking active superadmins
      CREATE INDEX idx_superadmins_active ON core.superadmins (user_id) WHERE revoked_at IS NULL;
    `);

    // 2. Add last_activity_at column to user_profiles
    await queryRunner.query(`
      ALTER TABLE core.user_profiles
      ADD COLUMN last_activity_at TIMESTAMPTZ;

      COMMENT ON COLUMN core.user_profiles.last_activity_at IS 'Timestamp of last authenticated API activity (debounced, ~60s granularity)';

      -- Index for sorting users by activity
      CREATE INDEX idx_user_profiles_last_activity_at 
      ON core.user_profiles (last_activity_at DESC NULLS LAST)
      WHERE deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS core.idx_user_profiles_last_activity_at;
      ALTER TABLE core.user_profiles DROP COLUMN IF EXISTS last_activity_at;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS core.idx_superadmins_active;
      DROP TABLE IF EXISTS core.superadmins;
    `);
  }
}
