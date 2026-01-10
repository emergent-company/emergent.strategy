import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove session expiration from Template Pack Studio
 *
 * Previously, studio sessions expired after 24 hours, but this caused issues
 * when users tried to save template packs after the session expired.
 *
 * This migration:
 * 1. Reactivates all expired sessions so users can complete their work
 * 2. Removes the 'expired' status option
 * 3. Drops the expires_at column
 */
export class RemoveStudioSessionExpiration1767198000000
  implements MigrationInterface
{
  name = 'RemoveStudioSessionExpiration1767198000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Reactivate all expired sessions
    await queryRunner.query(`
      UPDATE kb.template_pack_studio_sessions 
      SET status = 'active', updated_at = now()
      WHERE status = 'expired'
    `);

    // Step 2: Drop the expires_at column
    await queryRunner.query(`
      ALTER TABLE kb.template_pack_studio_sessions 
      DROP COLUMN IF EXISTS expires_at
    `);

    // Step 3: Update status check constraint to remove 'expired' option
    await queryRunner.query(`
      ALTER TABLE kb.template_pack_studio_sessions 
      DROP CONSTRAINT IF EXISTS template_pack_studio_sessions_status_check
    `);

    await queryRunner.query(`
      ALTER TABLE kb.template_pack_studio_sessions 
      ADD CONSTRAINT template_pack_studio_sessions_status_check 
      CHECK (status IN ('active', 'completed', 'discarded'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Remove the updated constraint
    await queryRunner.query(`
      ALTER TABLE kb.template_pack_studio_sessions 
      DROP CONSTRAINT IF EXISTS template_pack_studio_sessions_status_check
    `);

    // Step 2: Add back the expires_at column with default 24 hours from now
    await queryRunner.query(`
      ALTER TABLE kb.template_pack_studio_sessions 
      ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
    `);

    // Step 3: Restore the original constraint with 'expired' status
    await queryRunner.query(`
      ALTER TABLE kb.template_pack_studio_sessions 
      ADD CONSTRAINT template_pack_studio_sessions_status_check 
      CHECK (status IN ('active', 'completed', 'discarded', 'expired'))
    `);
  }
}
