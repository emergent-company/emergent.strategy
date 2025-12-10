import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add trigger_type column to agents table
 *
 * Adds a trigger_type column to support different trigger modes:
 * - 'schedule': Agent runs on cron schedule (default, existing behavior)
 * - 'manual': Agent only runs when manually triggered
 */
export class AddAgentTriggerType1764971092000 implements MigrationInterface {
  name = 'AddAgentTriggerType1764971092000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add trigger_type column with default 'schedule' for backwards compatibility
    await queryRunner.query(`
      ALTER TABLE kb.agents
      ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'schedule'
    `);

    // Add check constraint to ensure valid values
    await queryRunner.query(`
      ALTER TABLE kb.agents
      ADD CONSTRAINT chk_agents_trigger_type
      CHECK (trigger_type IN ('schedule', 'manual'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove check constraint
    await queryRunner.query(`
      ALTER TABLE kb.agents
      DROP CONSTRAINT IF EXISTS chk_agents_trigger_type
    `);

    // Remove column
    await queryRunner.query(`
      ALTER TABLE kb.agents
      DROP COLUMN IF EXISTS trigger_type
    `);
  }
}
