import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentParsingJobs1767189000000 implements MigrationInterface {
  name = 'AddDocumentParsingJobs1767189000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create document_parsing_jobs table for tracking document extraction
    await queryRunner.query(`
      CREATE TABLE kb.document_parsing_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        project_id UUID NOT NULL REFERENCES kb.projects(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        source_type TEXT NOT NULL,
        source_filename TEXT,
        mime_type TEXT,
        file_size_bytes BIGINT,
        storage_key TEXT,
        document_id UUID REFERENCES kb.documents(id) ON DELETE SET NULL,
        extraction_job_id UUID REFERENCES kb.object_extraction_jobs(id) ON DELETE SET NULL,
        parsed_content TEXT,
        metadata JSONB DEFAULT '{}',
        error_message TEXT,
        retry_count INT DEFAULT 0,
        max_retries INT DEFAULT 3,
        next_retry_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Index for worker polling - find pending jobs
    await queryRunner.query(`
      CREATE INDEX idx_document_parsing_jobs_pending
      ON kb.document_parsing_jobs (status, created_at)
      WHERE status = 'pending'
    `);

    // Index for finding jobs ready for retry
    await queryRunner.query(`
      CREATE INDEX idx_document_parsing_jobs_retry
      ON kb.document_parsing_jobs (status, next_retry_at)
      WHERE status = 'retry_pending' AND next_retry_at IS NOT NULL
    `);

    // Index for project queries
    await queryRunner.query(`
      CREATE INDEX idx_document_parsing_jobs_project
      ON kb.document_parsing_jobs (project_id)
    `);

    // Index for document relationship
    await queryRunner.query(`
      CREATE INDEX idx_document_parsing_jobs_document
      ON kb.document_parsing_jobs (document_id)
      WHERE document_id IS NOT NULL
    `);

    // Index for orphaned job recovery (processing but no recent update)
    await queryRunner.query(`
      CREATE INDEX idx_document_parsing_jobs_orphaned
      ON kb.document_parsing_jobs (status, updated_at)
      WHERE status = 'processing'
    `);

    // Add comments for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN kb.document_parsing_jobs.status IS 'Job status: pending, processing, completed, failed, retry_pending'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.document_parsing_jobs.source_type IS 'Source type: upload, url. Determines how file content is acquired'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.document_parsing_jobs.storage_key IS 'S3/MinIO storage key for the original file'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS kb.document_parsing_jobs`);
  }
}
