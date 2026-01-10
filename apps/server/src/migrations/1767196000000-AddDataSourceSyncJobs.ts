import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataSourceSyncJobs1767196000000 implements MigrationInterface {
  name = 'AddDataSourceSyncJobs1767196000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the data_source_sync_jobs table
    await queryRunner.query(`
      CREATE TABLE kb.data_source_sync_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id UUID NOT NULL REFERENCES kb.data_source_integrations(id) ON DELETE CASCADE,
        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
        
        -- Status tracking
        status TEXT NOT NULL DEFAULT 'pending',
        
        -- Progress tracking
        total_items INTEGER NOT NULL DEFAULT 0,
        processed_items INTEGER NOT NULL DEFAULT 0,
        successful_items INTEGER NOT NULL DEFAULT 0,
        failed_items INTEGER NOT NULL DEFAULT 0,
        skipped_items INTEGER NOT NULL DEFAULT 0,
        
        -- Phase and message
        current_phase TEXT,
        status_message TEXT,
        
        -- Configuration and results
        sync_options JSONB NOT NULL DEFAULT '{}',
        document_ids JSONB NOT NULL DEFAULT '[]',
        logs JSONB NOT NULL DEFAULT '[]',
        
        -- Error tracking
        error_message TEXT,
        error_details JSONB,
        
        -- Trigger info
        triggered_by UUID,
        trigger_type TEXT NOT NULL DEFAULT 'manual',
        
        -- Timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Create indexes for efficient queries
    await queryRunner.query(`
      CREATE INDEX idx_data_source_sync_jobs_integration 
      ON kb.data_source_sync_jobs(integration_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_data_source_sync_jobs_project 
      ON kb.data_source_sync_jobs(project_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_data_source_sync_jobs_status 
      ON kb.data_source_sync_jobs(status, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_data_source_sync_jobs_integration_status 
      ON kb.data_source_sync_jobs(integration_id, status)
    `);

    // Enable RLS
    await queryRunner.query(`
      ALTER TABLE kb.data_source_sync_jobs ENABLE ROW LEVEL SECURITY
    `);

    // RLS policy for read access (same pattern as data_source_integrations)
    await queryRunner.query(`
      CREATE POLICY data_source_sync_jobs_read_policy 
      ON kb.data_source_sync_jobs 
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
      CREATE POLICY data_source_sync_jobs_write_policy 
      ON kb.data_source_sync_jobs 
      FOR ALL 
      USING (
        project_id IN (
          SELECT project_id FROM kb.project_memberships 
          WHERE user_id = current_setting('app.current_user_id', true)::uuid
            AND role IN ('owner', 'admin')
        )
      )
    `);

    // Add trigger for updated_at (use the same function as integrations)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION kb.update_data_source_sync_jobs_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_data_source_sync_jobs_updated_at
      BEFORE UPDATE ON kb.data_source_sync_jobs
      FOR EACH ROW
      EXECUTE FUNCTION kb.update_data_source_sync_jobs_updated_at()
    `);

    // Add comment
    await queryRunner.query(`
      COMMENT ON TABLE kb.data_source_sync_jobs IS 
      'Tracks async sync operations for data source integrations with progress and logs'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove RLS policies
    await queryRunner.query(`
      DROP POLICY IF EXISTS data_source_sync_jobs_write_policy 
      ON kb.data_source_sync_jobs
    `);

    await queryRunner.query(`
      DROP POLICY IF EXISTS data_source_sync_jobs_read_policy 
      ON kb.data_source_sync_jobs
    `);

    // Remove trigger
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_data_source_sync_jobs_updated_at 
      ON kb.data_source_sync_jobs
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS kb.update_data_source_sync_jobs_updated_at()
    `);

    // Drop table
    await queryRunner.query(
      `DROP TABLE IF EXISTS kb.data_source_sync_jobs CASCADE`
    );
  }
}
