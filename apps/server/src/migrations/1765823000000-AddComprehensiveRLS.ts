import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds Row-Level Security (RLS) policies to all remaining tables with project_id.
 *
 * This migration ensures complete project isolation at the database level for:
 * - branches
 * - chat_conversations
 * - embedding_policies
 * - external_sources
 * - integrations
 * - invites
 * - notifications
 * - object_extraction_jobs
 * - object_type_schemas
 * - product_versions
 * - project_memberships
 * - project_object_type_registry
 * - project_template_packs
 * - tags
 * - tasks
 * - template_pack_studio_sessions
 *
 * Policy logic:
 * - If app.current_project_id is empty or not set: allow all rows (for admin/background jobs)
 * - If app.current_project_id is set: filter to only that project's data
 */
export class AddComprehensiveRLS1765823000000 implements MigrationInterface {
  // Tables that have a direct project_id column
  private readonly tables = [
    'branches',
    'chat_conversations',
    'embedding_policies',
    'external_sources',
    'integrations',
    'invites',
    'notifications',
    'object_extraction_jobs',
    'object_type_schemas',
    'product_versions',
    'project_memberships',
    'project_object_type_registry',
    'project_template_packs',
    'tags',
    'tasks',
    'template_pack_studio_sessions',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await this.enableRLSForTable(queryRunner, table);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order to handle any dependencies
    for (const table of [...this.tables].reverse()) {
      await this.disableRLSForTable(queryRunner, table);
    }
  }

  private async enableRLSForTable(
    queryRunner: QueryRunner,
    table: string
  ): Promise<void> {
    const policyCondition = `
      (COALESCE(current_setting('app.current_project_id', true), '') = '')
      OR (project_id::text = current_setting('app.current_project_id', true))
    `;

    // Enable RLS
    await queryRunner.query(`
      ALTER TABLE kb.${table} ENABLE ROW LEVEL SECURITY
    `);

    // SELECT policy
    await queryRunner.query(`
      CREATE POLICY ${table}_select ON kb.${table}
        FOR SELECT
        USING (${policyCondition})
    `);

    // INSERT policy
    await queryRunner.query(`
      CREATE POLICY ${table}_insert ON kb.${table}
        FOR INSERT
        WITH CHECK (${policyCondition})
    `);

    // UPDATE policy
    await queryRunner.query(`
      CREATE POLICY ${table}_update ON kb.${table}
        FOR UPDATE
        USING (${policyCondition})
        WITH CHECK (${policyCondition})
    `);

    // DELETE policy
    await queryRunner.query(`
      CREATE POLICY ${table}_delete ON kb.${table}
        FOR DELETE
        USING (${policyCondition})
    `);

    // Add comment
    await queryRunner.query(`
      COMMENT ON POLICY ${table}_select ON kb.${table} IS 
        'Project isolation: users can only access ${table} from their active project'
    `);
  }

  private async disableRLSForTable(
    queryRunner: QueryRunner,
    table: string
  ): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS ${table}_delete ON kb.${table}`
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS ${table}_update ON kb.${table}`
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS ${table}_insert ON kb.${table}`
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS ${table}_select ON kb.${table}`
    );
    await queryRunner.query(
      `ALTER TABLE kb.${table} DISABLE ROW LEVEL SECURITY`
    );
  }
}
