import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Last Synced At column to user_profiles
 *
 * Adds a column to track when each user's profile was last synced from Zitadel.
 * This enables:
 * - Tracking sync coverage
 * - Identifying users that haven't been synced recently
 * - Monitoring sync worker health
 */
export class AddUserProfileLastSyncedAt1765828000000
  implements MigrationInterface
{
  name = 'AddUserProfileLastSyncedAt1765828000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE core.user_profiles
      ADD COLUMN last_synced_at TIMESTAMPTZ;

      COMMENT ON COLUMN core.user_profiles.last_synced_at IS 'Timestamp when profile was last synced from Zitadel (null = never synced)';

      -- Index for finding users that need re-sync
      CREATE INDEX idx_user_profiles_last_synced_at 
      ON core.user_profiles (last_synced_at)
      WHERE deleted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS core.idx_user_profiles_last_synced_at;
      ALTER TABLE core.user_profiles
      DROP COLUMN IF EXISTS last_synced_at;
    `);
  }
}
