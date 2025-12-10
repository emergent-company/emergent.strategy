import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Notification Action Status
 *
 * Adds action_status, action_status_at, and action_status_by columns
 * to track the resolution state of actionable notifications (e.g., merge suggestions).
 *
 * - 'pending': Action not yet taken
 * - 'accepted': User accepted/approved the action
 * - 'rejected': User rejected/dismissed the action
 */
export class AddNotificationActionStatus1764971090000
  implements MigrationInterface
{
  name = 'AddNotificationActionStatus1764971090000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add action_status column
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      ADD COLUMN IF NOT EXISTS action_status TEXT
    `);

    // Add action_status_at column
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      ADD COLUMN IF NOT EXISTS action_status_at TIMESTAMPTZ
    `);

    // Add action_status_by column (who performed the action)
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      ADD COLUMN IF NOT EXISTS action_status_by UUID
    `);

    // Add index for querying pending actionable notifications
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_action_status
      ON kb.notifications(action_status)
      WHERE action_status IS NOT NULL
    `);

    // Add composite index for agent queries (type + action_status)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_type_action_status
      ON kb.notifications(type, action_status)
      WHERE type IS NOT NULL
    `);

    // Backfill existing merge suggestion notifications with 'pending' status
    await queryRunner.query(`
      UPDATE kb.notifications
      SET action_status = 'pending'
      WHERE type = 'agent:merge_suggestion'
        AND action_status IS NULL
        AND dismissed = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_notifications_type_action_status
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_notifications_action_status
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      DROP COLUMN IF EXISTS action_status_by
    `);
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      DROP COLUMN IF EXISTS action_status_at
    `);
    await queryRunner.query(`
      ALTER TABLE kb.notifications
      DROP COLUMN IF EXISTS action_status
    `);
  }
}
