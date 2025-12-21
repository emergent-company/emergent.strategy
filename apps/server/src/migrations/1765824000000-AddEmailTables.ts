import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Email Tables
 *
 * Creates tables for the email infrastructure:
 * - kb.email_jobs: Queue for outgoing emails with retry support
 * - kb.email_logs: Audit trail for email events (sent, failed, delivered, etc.)
 *
 * This supports transactional emails like user invitations, notifications, etc.
 */
export class AddEmailTables1765824000000 implements MigrationInterface {
  name = 'AddEmailTables1765824000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create email_jobs table
    await queryRunner.query(`
      CREATE TABLE kb.email_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_name VARCHAR(100) NOT NULL,
        to_email VARCHAR(320) NOT NULL,
        to_name VARCHAR(255),
        subject VARCHAR(500) NOT NULL,
        template_data JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        last_error TEXT,
        mailgun_message_id VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ,
        next_retry_at TIMESTAMPTZ,
        
        -- For correlation with source (invite, notification, etc.)
        source_type VARCHAR(50),
        source_id UUID,
        
        -- Constraints
        CONSTRAINT email_jobs_status_check CHECK (status IN ('pending', 'processing', 'sent', 'failed'))
      );

      -- Index for worker to find jobs to process (pending or retry-ready)
      CREATE INDEX idx_email_jobs_status_next_retry ON kb.email_jobs(status, next_retry_at)
        WHERE status IN ('pending', 'processing');
      
      -- Index for looking up emails by source (e.g., find all emails for an invite)
      CREATE INDEX idx_email_jobs_source ON kb.email_jobs(source_type, source_id);
      
      -- Index for looking up by mailgun message ID (for webhook processing)
      CREATE INDEX idx_email_jobs_mailgun_id ON kb.email_jobs(mailgun_message_id)
        WHERE mailgun_message_id IS NOT NULL;

      COMMENT ON TABLE kb.email_jobs IS 'Queue for outgoing transactional emails';
      COMMENT ON COLUMN kb.email_jobs.template_name IS 'Name of the Handlebars template to render';
      COMMENT ON COLUMN kb.email_jobs.to_email IS 'Recipient email address';
      COMMENT ON COLUMN kb.email_jobs.to_name IS 'Recipient display name (optional)';
      COMMENT ON COLUMN kb.email_jobs.subject IS 'Email subject line';
      COMMENT ON COLUMN kb.email_jobs.template_data IS 'Data to pass to the template for rendering';
      COMMENT ON COLUMN kb.email_jobs.status IS 'Job status: pending, processing, sent, failed';
      COMMENT ON COLUMN kb.email_jobs.attempts IS 'Number of send attempts made';
      COMMENT ON COLUMN kb.email_jobs.max_attempts IS 'Maximum number of retry attempts';
      COMMENT ON COLUMN kb.email_jobs.last_error IS 'Error message from last failed attempt';
      COMMENT ON COLUMN kb.email_jobs.mailgun_message_id IS 'Mailgun message ID for tracking';
      COMMENT ON COLUMN kb.email_jobs.processed_at IS 'When the job was last processed';
      COMMENT ON COLUMN kb.email_jobs.next_retry_at IS 'When to retry a failed job';
      COMMENT ON COLUMN kb.email_jobs.source_type IS 'Type of source: invite, notification, etc.';
      COMMENT ON COLUMN kb.email_jobs.source_id IS 'ID of the source record';
    `);

    // Create email_logs table for audit trail
    await queryRunner.query(`
      CREATE TABLE kb.email_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email_job_id UUID REFERENCES kb.email_jobs(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        mailgun_event_id VARCHAR(255),
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Index for looking up logs by job
      CREATE INDEX idx_email_logs_job ON kb.email_logs(email_job_id);
      
      -- Index for looking up by event type
      CREATE INDEX idx_email_logs_event_type ON kb.email_logs(event_type);

      COMMENT ON TABLE kb.email_logs IS 'Audit trail for email events';
      COMMENT ON COLUMN kb.email_logs.email_job_id IS 'Reference to the email job';
      COMMENT ON COLUMN kb.email_logs.event_type IS 'Event type: queued, sent, delivered, failed, bounced, complained';
      COMMENT ON COLUMN kb.email_logs.mailgun_event_id IS 'Mailgun event ID from webhook';
      COMMENT ON COLUMN kb.email_logs.details IS 'Additional event details';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop email_logs table
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_email_logs_event_type;
      DROP INDEX IF EXISTS kb.idx_email_logs_job;
      DROP TABLE IF EXISTS kb.email_logs;
    `);

    // Drop email_jobs table
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_email_jobs_mailgun_id;
      DROP INDEX IF EXISTS kb.idx_email_jobs_source;
      DROP INDEX IF EXISTS kb.idx_email_jobs_status_next_retry;
      DROP TABLE IF EXISTS kb.email_jobs;
    `);
  }
}
