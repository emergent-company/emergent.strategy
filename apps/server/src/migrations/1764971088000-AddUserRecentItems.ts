import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRecentItems1764971088000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_recent_items table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kb.user_recent_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        project_id UUID NOT NULL,
        resource_type VARCHAR(20) NOT NULL CHECK (resource_type IN ('document', 'object')),
        resource_id UUID NOT NULL,
        resource_name TEXT,
        resource_subtype TEXT,
        action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('viewed', 'edited')),
        accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Add comments
    await queryRunner.query(`
      COMMENT ON TABLE kb.user_recent_items IS 'Tracks recently accessed documents and objects per user for quick navigation'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.user_id IS 'Zitadel user ID'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.project_id IS 'Project scope - activity is tracked per project'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.resource_type IS 'Type of resource: document or object'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.resource_id IS 'UUID of the document or graph object'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.resource_name IS 'Denormalized name for display (may become stale)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.resource_subtype IS 'MIME type for documents, object type for objects'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.action_type IS 'Type of action: viewed or edited'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.user_recent_items.accessed_at IS 'When the resource was last accessed (updated on each access)'
    `);

    // Index for efficient queries: get recent items by user and project, ordered by access time
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_recent_items_user_project_accessed 
      ON kb.user_recent_items(user_id, project_id, accessed_at DESC)
    `);

    // Unique constraint: one record per user/project/resource combination (UPSERT target)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_recent_items_unique_resource 
      ON kb.user_recent_items(user_id, project_id, resource_type, resource_id)
    `);

    // Enable RLS
    await queryRunner.query(`
      ALTER TABLE kb.user_recent_items ENABLE ROW LEVEL SECURITY
    `);

    // RLS Policy - users can only see and modify their own recent items
    await queryRunner.query(`
      CREATE POLICY user_recent_items_isolation ON kb.user_recent_items
        FOR ALL
        USING (user_id = current_setting('app.user_id', true))
        WITH CHECK (user_id = current_setting('app.user_id', true))
    `);

    // Grant permissions to app_rls role
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON kb.user_recent_items TO app_rls
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS user_recent_items_isolation ON kb.user_recent_items`
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS kb.user_recent_items CASCADE`
    );
  }
}
