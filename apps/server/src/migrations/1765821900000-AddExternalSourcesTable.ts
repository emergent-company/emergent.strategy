import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalSourcesTable1765821900000
  implements MigrationInterface
{
  name = 'AddExternalSourcesTable1765821900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create external_sources table
    await queryRunner.query(`
      CREATE TABLE kb.external_sources (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
        provider_type TEXT NOT NULL,
        external_id TEXT NOT NULL,
        original_url TEXT NOT NULL,
        normalized_url TEXT NOT NULL,
        display_name TEXT,
        mime_type TEXT,
        sync_policy TEXT NOT NULL DEFAULT 'manual',
        sync_interval_minutes INT,
        last_checked_at TIMESTAMPTZ,
        last_synced_at TIMESTAMPTZ,
        last_etag TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        error_count INT NOT NULL DEFAULT 0,
        last_error TEXT,
        last_error_at TIMESTAMPTZ,
        provider_metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create unique index for deduplication by provider + external_id
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_external_sources_project_provider_external_id
      ON kb.external_sources (project_id, provider_type, external_id)
    `);

    // Create index for sync worker queries (find sources due for sync)
    await queryRunner.query(`
      CREATE INDEX idx_external_sources_sync_status
      ON kb.external_sources (status, sync_policy, last_checked_at)
      WHERE status = 'active'
    `);

    // Create index for normalized URL lookups
    await queryRunner.query(`
      CREATE INDEX idx_external_sources_normalized_url
      ON kb.external_sources (project_id, normalized_url)
    `);

    // Add columns to documents table
    await queryRunner.query(`
      ALTER TABLE kb.documents
      ADD COLUMN source_type TEXT NOT NULL DEFAULT 'upload',
      ADD COLUMN external_source_id UUID REFERENCES kb.external_sources(id) ON DELETE SET NULL,
      ADD COLUMN sync_version INT NOT NULL DEFAULT 1
    `);

    // Create index for external_source_id lookups
    await queryRunner.query(`
      CREATE INDEX idx_documents_external_source_id
      ON kb.documents (external_source_id)
      WHERE external_source_id IS NOT NULL
    `);

    // Add comment explaining source_type values
    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.source_type IS 'Source type: upload, url, google_drive, dropbox, external'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.external_sources.sync_policy IS 'Sync policy: manual, on_access, periodic, webhook'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.external_sources.status IS 'Source status: active, error, disabled'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns from documents
    await queryRunner.query(`
      ALTER TABLE kb.documents
      DROP COLUMN IF EXISTS source_type,
      DROP COLUMN IF EXISTS external_source_id,
      DROP COLUMN IF EXISTS sync_version
    `);

    // Drop external_sources table (cascades indexes)
    await queryRunner.query(`DROP TABLE IF EXISTS kb.external_sources`);
  }
}
