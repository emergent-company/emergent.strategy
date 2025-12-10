import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Agent System Tables
 *
 * Creates the agents and agent_runs tables for the background agent system.
 * Also seeds the default Merge Agent configuration.
 */
export class AddAgentSystem1764971089000 implements MigrationInterface {
  name = 'AddAgentSystem1764971089000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agents table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kb.agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        role TEXT NOT NULL UNIQUE,
        prompt TEXT,
        cron_schedule TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        config JSONB NOT NULL DEFAULT '{}',
        description TEXT,
        last_run_at TIMESTAMPTZ,
        last_run_status TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Create indexes for agents
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_role ON kb.agents(role)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_enabled ON kb.agents(enabled)
    `);

    // Create agent_runs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kb.agent_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES kb.agents(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        summary JSONB NOT NULL DEFAULT '{}',
        error_message TEXT,
        skip_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Create indexes for agent_runs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_id ON kb.agent_runs(agent_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON kb.agent_runs(started_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON kb.agent_runs(status)
    `);

    // Seed default Merge Agent
    await queryRunner.query(`
      INSERT INTO kb.agents (name, role, prompt, cron_schedule, enabled, config, description)
      VALUES (
        'Merge Suggestion Agent',
        'merge-suggestion',
        'Find objects that are very similar and may be duplicates. Suggest merging them to the administrator.',
        '*/3 * * * *',
        true,
        '{"similarityThreshold": 0.10, "maxPendingNotifications": 5, "batchSize": 100}'::jsonb,
        'Periodically scans graph objects for near-duplicates using vector similarity search. Creates actionable notifications for administrators to review and merge similar objects.'
      )
      ON CONFLICT (role) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS kb.idx_agent_runs_status`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS kb.idx_agent_runs_started_at`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS kb.idx_agent_runs_agent_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS kb.idx_agents_enabled`);
    await queryRunner.query(`DROP INDEX IF EXISTS kb.idx_agents_role`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS kb.agent_runs`);
    await queryRunner.query(`DROP TABLE IF EXISTS kb.agents`);
  }
}
