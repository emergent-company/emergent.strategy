import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds Row-Level Security (RLS) policies to kb.documents and kb.chunks tables.
 *
 * Previously, these tables relied on application-level filtering which led to
 * cross-project data visibility bugs. This migration ensures project isolation
 * at the database level.
 *
 * Policy logic:
 * - If app.current_project_id is empty or not set: allow all rows (for admin/background jobs)
 * - If app.current_project_id is set: filter to only that project's data
 */
export class AddDocumentsChunksRLS1765822000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // Documents RLS
    // ========================================

    // Enable RLS on documents table
    await queryRunner.query(`
      ALTER TABLE kb.documents ENABLE ROW LEVEL SECURITY
    `);

    // Create policy for SELECT operations
    await queryRunner.query(`
      CREATE POLICY documents_select ON kb.documents
        FOR SELECT
        USING (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR (project_id::text = current_setting('app.current_project_id', true))
        )
    `);

    // Create policy for INSERT operations
    await queryRunner.query(`
      CREATE POLICY documents_insert ON kb.documents
        FOR INSERT
        WITH CHECK (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR (project_id::text = current_setting('app.current_project_id', true))
        )
    `);

    // Create policy for UPDATE operations
    await queryRunner.query(`
      CREATE POLICY documents_update ON kb.documents
        FOR UPDATE
        USING (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR (project_id::text = current_setting('app.current_project_id', true))
        )
        WITH CHECK (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR (project_id::text = current_setting('app.current_project_id', true))
        )
    `);

    // Create policy for DELETE operations
    await queryRunner.query(`
      CREATE POLICY documents_delete ON kb.documents
        FOR DELETE
        USING (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR (project_id::text = current_setting('app.current_project_id', true))
        )
    `);

    // ========================================
    // Chunks RLS
    // ========================================

    // Enable RLS on chunks table
    await queryRunner.query(`
      ALTER TABLE kb.chunks ENABLE ROW LEVEL SECURITY
    `);

    // Chunks are filtered via their parent document's project_id
    // Create policy for SELECT operations
    await queryRunner.query(`
      CREATE POLICY chunks_select ON kb.chunks
        FOR SELECT
        USING (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR EXISTS (
            SELECT 1 FROM kb.documents d 
            WHERE d.id = document_id 
            AND d.project_id::text = current_setting('app.current_project_id', true)
          )
        )
    `);

    // Create policy for INSERT operations
    await queryRunner.query(`
      CREATE POLICY chunks_insert ON kb.chunks
        FOR INSERT
        WITH CHECK (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR EXISTS (
            SELECT 1 FROM kb.documents d 
            WHERE d.id = document_id 
            AND d.project_id::text = current_setting('app.current_project_id', true)
          )
        )
    `);

    // Create policy for UPDATE operations
    await queryRunner.query(`
      CREATE POLICY chunks_update ON kb.chunks
        FOR UPDATE
        USING (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR EXISTS (
            SELECT 1 FROM kb.documents d 
            WHERE d.id = document_id 
            AND d.project_id::text = current_setting('app.current_project_id', true)
          )
        )
        WITH CHECK (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR EXISTS (
            SELECT 1 FROM kb.documents d 
            WHERE d.id = document_id 
            AND d.project_id::text = current_setting('app.current_project_id', true)
          )
        )
    `);

    // Create policy for DELETE operations
    await queryRunner.query(`
      CREATE POLICY chunks_delete ON kb.chunks
        FOR DELETE
        USING (
          (COALESCE(current_setting('app.current_project_id', true), '') = '')
          OR EXISTS (
            SELECT 1 FROM kb.documents d 
            WHERE d.id = document_id 
            AND d.project_id::text = current_setting('app.current_project_id', true)
          )
        )
    `);

    // Add comments explaining the policies
    await queryRunner.query(`
      COMMENT ON POLICY documents_select ON kb.documents IS 
        'Project isolation: users can only see documents from their active project'
    `);
    await queryRunner.query(`
      COMMENT ON POLICY chunks_select ON kb.chunks IS 
        'Project isolation: users can only see chunks from documents in their active project'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop chunks policies
    await queryRunner.query(`DROP POLICY IF EXISTS chunks_delete ON kb.chunks`);
    await queryRunner.query(`DROP POLICY IF EXISTS chunks_update ON kb.chunks`);
    await queryRunner.query(`DROP POLICY IF EXISTS chunks_insert ON kb.chunks`);
    await queryRunner.query(`DROP POLICY IF EXISTS chunks_select ON kb.chunks`);
    await queryRunner.query(`ALTER TABLE kb.chunks DISABLE ROW LEVEL SECURITY`);

    // Drop documents policies
    await queryRunner.query(
      `DROP POLICY IF EXISTS documents_delete ON kb.documents`
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS documents_update ON kb.documents`
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS documents_insert ON kb.documents`
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS documents_select ON kb.documents`
    );
    await queryRunner.query(
      `ALTER TABLE kb.documents DISABLE ROW LEVEL SECURITY`
    );
  }
}
