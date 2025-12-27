import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Email Delivery Status
 *
 * Adds columns to track email delivery status from Mailgun events API:
 * - delivery_status: The delivery status (delivered, opened, bounced, failed, complained)
 * - delivery_status_at: When the delivery event occurred (from Mailgun)
 * - delivery_status_synced_at: When we last synced this status from Mailgun
 *
 * This allows us to display delivery status in the admin panel and track
 * whether emails are actually reaching recipients.
 */
export class AddEmailDeliveryStatus1767186000000 implements MigrationInterface {
  name = 'AddEmailDeliveryStatus1767186000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add delivery status columns to email_jobs
    await queryRunner.query(`
      -- Add delivery status enum type
      DO $$ BEGIN
        CREATE TYPE kb.email_delivery_status AS ENUM (
          'pending',      -- Waiting for delivery confirmation
          'delivered',    -- Successfully delivered to recipient's server
          'opened',       -- Recipient opened the email (requires tracking)
          'clicked',      -- Recipient clicked a link
          'bounced',      -- Hard bounce - permanent delivery failure
          'soft_bounced', -- Soft bounce - temporary failure
          'complained',   -- Recipient marked as spam
          'unsubscribed', -- Recipient unsubscribed
          'failed'        -- Delivery failed
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      -- Add columns to email_jobs
      ALTER TABLE kb.email_jobs
        ADD COLUMN IF NOT EXISTS delivery_status kb.email_delivery_status,
        ADD COLUMN IF NOT EXISTS delivery_status_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delivery_status_synced_at TIMESTAMPTZ;

      -- Index for finding emails that need status sync
      -- Only sync emails that are sent, have a mailgun_message_id, and haven't been synced recently
      CREATE INDEX IF NOT EXISTS idx_email_jobs_needs_status_sync 
        ON kb.email_jobs(processed_at)
        WHERE status = 'sent' 
          AND mailgun_message_id IS NOT NULL 
          AND delivery_status IS NULL;

      -- Comments
      COMMENT ON COLUMN kb.email_jobs.delivery_status IS 'Delivery status from Mailgun: delivered, opened, bounced, failed, complained, etc.';
      COMMENT ON COLUMN kb.email_jobs.delivery_status_at IS 'When the delivery event occurred (from Mailgun timestamp)';
      COMMENT ON COLUMN kb.email_jobs.delivery_status_synced_at IS 'When we last synced delivery status from Mailgun';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Drop index
      DROP INDEX IF EXISTS kb.idx_email_jobs_needs_status_sync;

      -- Drop columns
      ALTER TABLE kb.email_jobs
        DROP COLUMN IF EXISTS delivery_status_synced_at,
        DROP COLUMN IF EXISTS delivery_status_at,
        DROP COLUMN IF EXISTS delivery_status;

      -- Drop enum type
      DROP TYPE IF EXISTS kb.email_delivery_status;
    `);
  }
}
