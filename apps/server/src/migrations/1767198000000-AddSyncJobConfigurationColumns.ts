import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add configuration tracking columns to sync jobs
 *
 * This enables:
 * 1. Tracking which named configuration was used for a sync job
 * 2. Storing the configuration name as a snapshot (in case config is renamed/deleted)
 * 3. Querying sync job history by configuration
 */
export class AddSyncJobConfigurationColumns1767198000000
  implements MigrationInterface
{
  name = 'AddSyncJobConfigurationColumns1767198000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add configuration tracking columns
    await queryRunner.query(`
      ALTER TABLE kb.data_source_sync_jobs
      ADD COLUMN configuration_id UUID,
      ADD COLUMN configuration_name TEXT
    `);

    // Index for querying jobs by configuration
    await queryRunner.query(`
      CREATE INDEX idx_sync_jobs_configuration_id
      ON kb.data_source_sync_jobs (configuration_id)
      WHERE configuration_id IS NOT NULL
    `);

    // Add comment for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN kb.data_source_sync_jobs.configuration_id IS 
      'UUID of the sync configuration used (stored in integration metadata.syncConfigurations)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.data_source_sync_jobs.configuration_name IS 
      'Snapshot of configuration name at time of sync (for display even if config renamed/deleted)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_sync_jobs_configuration_id
    `);
    await queryRunner.query(`
      ALTER TABLE kb.data_source_sync_jobs
      DROP COLUMN IF EXISTS configuration_id,
      DROP COLUMN IF EXISTS configuration_name
    `);
  }
}
