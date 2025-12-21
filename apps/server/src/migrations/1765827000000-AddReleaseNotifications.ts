import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Release Notifications Tables
 *
 * Creates three tables for the release notification system:
 * 1. kb.release_notification_state - Tracks last notified commit for main branch
 * 2. kb.release_notifications - Release records with changelog content
 * 3. kb.release_notification_recipients - Per-user delivery tracking
 */
export class AddReleaseNotifications1765827000000
  implements MigrationInterface
{
  name = 'AddReleaseNotifications1765827000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Table 1: Release notification state - tracks last notified commit
    await queryRunner.query(`
      CREATE TABLE kb.release_notification_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch VARCHAR(255) NOT NULL DEFAULT 'main',
        last_notified_commit VARCHAR(40) NOT NULL,
        last_notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(branch)
      );

      COMMENT ON TABLE kb.release_notification_state IS 'Tracks the last notified commit for release notifications';
      COMMENT ON COLUMN kb.release_notification_state.branch IS 'Git branch name (currently only main is supported)';
      COMMENT ON COLUMN kb.release_notification_state.last_notified_commit IS 'SHA of the last commit included in a release notification';
    `);

    // Table 2: Release notifications - release records
    await queryRunner.query(`
      CREATE TABLE kb.release_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version VARCHAR(50) NOT NULL,
        from_commit VARCHAR(40) NOT NULL,
        to_commit VARCHAR(40) NOT NULL,
        commit_count INT NOT NULL,
        changelog_json JSONB NOT NULL,
        target_mode VARCHAR(20) NOT NULL,
        target_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES core.user_profiles(id),
        CONSTRAINT chk_target_mode CHECK (target_mode IN ('single', 'project', 'all'))
      );

      CREATE INDEX idx_release_notifications_version ON kb.release_notifications(version);
      CREATE INDEX idx_release_notifications_created_at ON kb.release_notifications(created_at DESC);
      CREATE INDEX idx_release_notifications_to_commit ON kb.release_notifications(to_commit);

      COMMENT ON TABLE kb.release_notifications IS 'Release notification records with changelog content';
      COMMENT ON COLUMN kb.release_notifications.version IS 'Date-based version (e.g., v2024.12.19)';
      COMMENT ON COLUMN kb.release_notifications.changelog_json IS 'JSON with features, fixes, improvements arrays';
      COMMENT ON COLUMN kb.release_notifications.target_mode IS 'Targeting mode: single, project, or all';
      COMMENT ON COLUMN kb.release_notifications.target_id IS 'User ID or project ID depending on target_mode (null for all)';
    `);

    // Table 3: Release notification recipients - per-user delivery tracking
    await queryRunner.query(`
      CREATE TABLE kb.release_notification_recipients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        release_notification_id UUID NOT NULL REFERENCES kb.release_notifications(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES core.user_profiles(id),
        email_sent BOOLEAN NOT NULL DEFAULT FALSE,
        email_sent_at TIMESTAMPTZ,
        mailgun_message_id VARCHAR(255),
        email_status VARCHAR(50) DEFAULT 'pending',
        email_status_updated_at TIMESTAMPTZ,
        in_app_notification_id UUID REFERENCES kb.notifications(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(release_notification_id, user_id),
        CONSTRAINT chk_email_status CHECK (email_status IN ('pending', 'delivered', 'opened', 'failed'))
      );

      CREATE INDEX idx_release_recipients_user ON kb.release_notification_recipients(user_id);
      CREATE INDEX idx_release_recipients_mailgun ON kb.release_notification_recipients(mailgun_message_id) WHERE mailgun_message_id IS NOT NULL;
      CREATE INDEX idx_release_recipients_release ON kb.release_notification_recipients(release_notification_id);

      COMMENT ON TABLE kb.release_notification_recipients IS 'Per-user delivery tracking for release notifications';
      COMMENT ON COLUMN kb.release_notification_recipients.mailgun_message_id IS 'Mailgun message ID for tracking delivery status';
      COMMENT ON COLUMN kb.release_notification_recipients.email_status IS 'Delivery status: pending, delivered, opened, failed';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS kb.release_notification_recipients;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS kb.release_notifications;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS kb.release_notification_state;
    `);
  }
}
