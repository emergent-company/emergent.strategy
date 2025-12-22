import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add User Email Preferences
 *
 * Creates the core.user_email_preferences table for managing user email
 * subscription preferences and unsubscribe tokens.
 *
 * Features:
 * - Per-user email preference toggles (release emails, marketing)
 * - Secure unsubscribe tokens for one-click email unsubscription
 * - Automatic token generation on insert via trigger
 */
export class AddUserEmailPreferences1767184000000
  implements MigrationInterface
{
  name = 'AddUserEmailPreferences1767184000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_email_preferences table in core schema
    await queryRunner.query(`
      CREATE TABLE core.user_email_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES core.user_profiles(id) ON DELETE CASCADE,
        
        -- Email preference toggles
        release_emails_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        marketing_emails_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        
        -- Secure unsubscribe token (URL-safe, unique)
        unsubscribe_token VARCHAR(64) NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
        
        -- Timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        
        -- Constraints
        CONSTRAINT user_email_preferences_user_unique UNIQUE (user_id),
        CONSTRAINT user_email_preferences_token_unique UNIQUE (unsubscribe_token)
      );

      -- Index for fast token lookup (used in unsubscribe links)
      CREATE INDEX idx_user_email_preferences_token ON core.user_email_preferences(unsubscribe_token);
      
      -- Index for user lookup
      CREATE INDEX idx_user_email_preferences_user ON core.user_email_preferences(user_id);

      -- Trigger to update updated_at on changes
      CREATE OR REPLACE FUNCTION core.update_email_preferences_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_user_email_preferences_updated
        BEFORE UPDATE ON core.user_email_preferences
        FOR EACH ROW
        EXECUTE FUNCTION core.update_email_preferences_timestamp();

      -- Comments
      COMMENT ON TABLE core.user_email_preferences IS 'User email subscription preferences and unsubscribe tokens';
      COMMENT ON COLUMN core.user_email_preferences.release_emails_enabled IS 'Whether user receives release notification emails';
      COMMENT ON COLUMN core.user_email_preferences.marketing_emails_enabled IS 'Whether user receives marketing/promotional emails';
      COMMENT ON COLUMN core.user_email_preferences.unsubscribe_token IS 'Secure token for one-click email unsubscription (64-char hex)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_user_email_preferences_updated ON core.user_email_preferences;
      DROP FUNCTION IF EXISTS core.update_email_preferences_timestamp();
      DROP INDEX IF EXISTS core.idx_user_email_preferences_user;
      DROP INDEX IF EXISTS core.idx_user_email_preferences_token;
      DROP TABLE IF EXISTS core.user_email_preferences;
    `);
  }
}
