import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Data Source Integrations
 *
 * This migration adds:
 * 1. kb.data_source_integrations table - Generic integration entity for data sources
 * 2. data_source_integration_id FK column on kb.documents
 * 3. Indexes for efficient querying
 *
 * Part of the IMAP Data Sources feature (add-imap-data-sources proposal)
 */
export class AddDataSourceIntegrations1767195000000
  implements MigrationInterface
{
  name = 'AddDataSourceIntegrations1767195000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create kb.data_source_integrations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kb.data_source_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
        provider_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        config_encrypted TEXT,
        sync_mode TEXT NOT NULL DEFAULT 'manual',
        sync_interval_minutes INT,
        last_synced_at TIMESTAMPTZ,
        next_sync_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'active',
        error_message TEXT,
        last_error_at TIMESTAMPTZ,
        error_count INT NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Create indexes on kb.data_source_integrations
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_source_integrations_project_id 
      ON kb.data_source_integrations(project_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_source_integrations_project_provider 
      ON kb.data_source_integrations(project_id, provider_type)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_source_integrations_project_source 
      ON kb.data_source_integrations(project_id, source_type)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_source_integrations_status 
      ON kb.data_source_integrations(status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_data_source_integrations_sync 
      ON kb.data_source_integrations(sync_mode, status, last_synced_at)
    `);

    // 3. Add data_source_integration_id column to kb.documents
    await queryRunner.query(`
      ALTER TABLE kb.documents 
      ADD COLUMN IF NOT EXISTS data_source_integration_id UUID 
      REFERENCES kb.data_source_integrations(id) ON DELETE SET NULL
    `);

    // 4. Create index on documents.data_source_integration_id
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_data_source_integration_id 
      ON kb.documents(data_source_integration_id)
    `);

    // 5. Create index on documents.source_type
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_source_type 
      ON kb.documents(source_type)
    `);

    // 6. Create index on documents.parent_document_id
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_parent_document_id 
      ON kb.documents(parent_document_id)
    `);

    // 7. Add updated_at trigger for data_source_integrations
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION kb.update_data_source_integrations_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_data_source_integrations_updated_at 
      ON kb.data_source_integrations
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_data_source_integrations_updated_at
      BEFORE UPDATE ON kb.data_source_integrations
      FOR EACH ROW
      EXECUTE FUNCTION kb.update_data_source_integrations_updated_at()
    `);

    // 8. Add RLS policies for data_source_integrations
    // Enable RLS
    await queryRunner.query(`
      ALTER TABLE kb.data_source_integrations ENABLE ROW LEVEL SECURITY
    `);

    // RLS policy for read access (same as other project-scoped tables)
    await queryRunner.query(`
      CREATE POLICY data_source_integrations_read_policy 
      ON kb.data_source_integrations 
      FOR SELECT 
      USING (
        project_id IN (
          SELECT project_id FROM kb.project_memberships 
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
        )
      )
    `);

    // RLS policy for write access
    await queryRunner.query(`
      CREATE POLICY data_source_integrations_write_policy 
      ON kb.data_source_integrations 
      FOR ALL 
      USING (
        project_id IN (
          SELECT project_id FROM kb.project_memberships 
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
            AND role IN ('owner', 'admin')
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove RLS policies
    await queryRunner.query(`
      DROP POLICY IF EXISTS data_source_integrations_write_policy 
      ON kb.data_source_integrations
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS data_source_integrations_read_policy 
      ON kb.data_source_integrations
    `);

    // Remove trigger
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_data_source_integrations_updated_at 
      ON kb.data_source_integrations
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS kb.update_data_source_integrations_updated_at()
    `);

    // Remove indexes on documents
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_parent_document_id
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_source_type
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_data_source_integration_id
    `);

    // Remove column from documents
    await queryRunner.query(`
      ALTER TABLE kb.documents 
      DROP COLUMN IF EXISTS data_source_integration_id
    `);

    // Remove indexes on data_source_integrations
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_data_source_integrations_sync
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_data_source_integrations_status
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_data_source_integrations_project_source
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_data_source_integrations_project_provider
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_data_source_integrations_project_id
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS kb.data_source_integrations
    `);
  }
}
