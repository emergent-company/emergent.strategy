import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Welcome Email Sent At
 *
 * Adds a column to track when the welcome email was sent to a user.
 * This prevents duplicate welcome emails from being sent on subsequent logins.
 */
export class AddWelcomeEmailSentAt1765825000000 implements MigrationInterface {
  name = 'AddWelcomeEmailSentAt1765825000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE core.user_profiles
      ADD COLUMN welcome_email_sent_at TIMESTAMPTZ;

      COMMENT ON COLUMN core.user_profiles.welcome_email_sent_at IS 'Timestamp when welcome email was sent (null = not sent yet)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE core.user_profiles
      DROP COLUMN IF EXISTS welcome_email_sent_at;
    `);
  }
}
