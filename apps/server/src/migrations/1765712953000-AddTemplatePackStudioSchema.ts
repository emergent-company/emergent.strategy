import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Template Pack Studio schema support
 *
 * This migration adds support for the Template Pack Studio feature which allows
 * users to create and edit template packs through an LLM-powered chat interface.
 *
 * Changes:
 * 1. Add parent_version_id column to graph_template_packs (for version lineage)
 * 2. Add draft column to graph_template_packs (for work-in-progress packs)
 * 3. Create template_pack_studio_sessions table for tracking studio sessions
 * 4. Create template_pack_studio_messages table for chat history
 * 5. Add indexes for efficient querying
 */
export class AddTemplatePackStudioSchema1765712953000
  implements MigrationInterface
{
  name = 'AddTemplatePackStudioSchema1765712953000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add parent_version_id column to graph_template_packs for version lineage
    await queryRunner.query(`
      ALTER TABLE kb.graph_template_packs
      ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES kb.graph_template_packs(id) ON DELETE SET NULL
    `);

    // 2. Add draft column to graph_template_packs for work-in-progress packs
    await queryRunner.query(`
      ALTER TABLE kb.graph_template_packs
      ADD COLUMN IF NOT EXISTS draft BOOLEAN DEFAULT false
    `);

    // 3. Create template_pack_studio_sessions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kb.template_pack_studio_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
        pack_id UUID REFERENCES kb.graph_template_packs(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'discarded', 'expired')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
      )
    `);

    // 4. Create template_pack_studio_messages table for chat history
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kb.template_pack_studio_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES kb.template_pack_studio_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        suggestions JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // 5. Add indexes
    // Index on parent_version_id for version lineage queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_graph_template_packs_parent_version_id"
      ON kb.graph_template_packs (parent_version_id)
      WHERE parent_version_id IS NOT NULL
    `);

    // Index on draft for filtering draft packs
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_graph_template_packs_draft"
      ON kb.graph_template_packs (draft)
      WHERE draft = true
    `);

    // Index on session status for active session queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_template_pack_studio_sessions_status"
      ON kb.template_pack_studio_sessions (status)
      WHERE status = 'active'
    `);

    // Index on session user_id for user's sessions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_template_pack_studio_sessions_user_id"
      ON kb.template_pack_studio_sessions (user_id)
    `);

    // Index on session pack_id for finding sessions by pack
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_template_pack_studio_sessions_pack_id"
      ON kb.template_pack_studio_sessions (pack_id)
      WHERE pack_id IS NOT NULL
    `);

    // Index on messages session_id for efficient message retrieval
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_template_pack_studio_messages_session_id"
      ON kb.template_pack_studio_messages (session_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_template_pack_studio_messages_session_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_template_pack_studio_sessions_pack_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_template_pack_studio_sessions_user_id"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_template_pack_studio_sessions_status"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_graph_template_packs_draft"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_graph_template_packs_parent_version_id"
    `);

    // Drop tables
    await queryRunner.query(`
      DROP TABLE IF EXISTS kb.template_pack_studio_messages
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS kb.template_pack_studio_sessions
    `);

    // Drop columns from graph_template_packs
    await queryRunner.query(`
      ALTER TABLE kb.graph_template_packs
      DROP COLUMN IF EXISTS draft
    `);
    await queryRunner.query(`
      ALTER TABLE kb.graph_template_packs
      DROP COLUMN IF EXISTS parent_version_id
    `);
  }
}
