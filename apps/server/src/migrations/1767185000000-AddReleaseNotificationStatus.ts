import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add status column to release_notifications
 *
 * Enables two-step release workflow:
 * 1. Create release (draft) - generates changelog, stores in DB
 * 2. Send notifications (published) - decoupled from release creation
 *
 * Also updates version format to YYYY.MM.DD.N (e.g., 2025.01.15.1)
 */
export class AddReleaseNotificationStatus1767185000000
  implements MigrationInterface
{
  name = 'AddReleaseNotificationStatus1767185000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add status column with default 'published' for backward compatibility
    // Existing records were already sent, so they are 'published'
    await queryRunner.query(`
      ALTER TABLE kb.release_notifications
      ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'published';

      -- Add check constraint for valid status values
      ALTER TABLE kb.release_notifications
      ADD CONSTRAINT chk_release_status CHECK (status IN ('draft', 'published'));

      -- Add index for filtering by status
      CREATE INDEX idx_release_notifications_status ON kb.release_notifications(status);

      -- Update column comments
      COMMENT ON COLUMN kb.release_notifications.status IS 'Release status: draft (created but not sent), published (notifications sent)';
      COMMENT ON COLUMN kb.release_notifications.version IS 'Date-based version format: YYYY.MM.DD.N (e.g., 2025.01.15.1)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_release_notifications_status;
      ALTER TABLE kb.release_notifications DROP CONSTRAINT IF EXISTS chk_release_status;
      ALTER TABLE kb.release_notifications DROP COLUMN IF EXISTS status;
    `);
  }
}
