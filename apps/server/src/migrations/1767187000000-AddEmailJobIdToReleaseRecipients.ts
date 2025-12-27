import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add email_job_id to release_notification_recipients
 *
 * This migration adds a foreign key reference to kb.email_jobs, allowing
 * release notification emails to use the unified email job queue instead
 * of direct Mailgun sends.
 *
 * The existing email status columns (mailgun_message_id, email_status,
 * email_status_updated_at) are kept but deprecated - new emails will
 * reference email_jobs for status tracking.
 *
 * Benefits:
 * - Release emails appear in superadmin Email History
 * - Consistent retry logic for all email types
 * - Single source of truth for email delivery status
 */
export class AddEmailJobIdToReleaseRecipients1767187000000
  implements MigrationInterface
{
  name = 'AddEmailJobIdToReleaseRecipients1767187000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Add email_job_id column with foreign key to kb.email_jobs
      ALTER TABLE kb.release_notification_recipients
        ADD COLUMN IF NOT EXISTS email_job_id UUID REFERENCES kb.email_jobs(id) ON DELETE SET NULL;

      -- Add index for efficient lookups by email_job_id
      CREATE INDEX IF NOT EXISTS idx_release_notification_recipients_email_job_id
        ON kb.release_notification_recipients(email_job_id)
        WHERE email_job_id IS NOT NULL;

      -- Add comments documenting the deprecation of old columns
      COMMENT ON COLUMN kb.release_notification_recipients.email_job_id IS 'Reference to unified email job queue. New emails use this instead of direct Mailgun sends.';
      COMMENT ON COLUMN kb.release_notification_recipients.mailgun_message_id IS 'DEPRECATED: Use email_job_id -> email_jobs.mailgun_message_id instead. Kept for historical data.';
      COMMENT ON COLUMN kb.release_notification_recipients.email_status IS 'DEPRECATED: Use email_job_id -> email_jobs.delivery_status instead. Kept for historical data.';
      COMMENT ON COLUMN kb.release_notification_recipients.email_status_updated_at IS 'DEPRECATED: Use email_job_id -> email_jobs.delivery_status_at instead. Kept for historical data.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Drop index
      DROP INDEX IF EXISTS kb.idx_release_notification_recipients_email_job_id;

      -- Drop column
      ALTER TABLE kb.release_notification_recipients
        DROP COLUMN IF EXISTS email_job_id;

      -- Remove deprecation comments (restore to NULL)
      COMMENT ON COLUMN kb.release_notification_recipients.mailgun_message_id IS NULL;
      COMMENT ON COLUMN kb.release_notification_recipients.email_status IS NULL;
      COMMENT ON COLUMN kb.release_notification_recipients.email_status_updated_at IS NULL;
    `);
  }
}
