import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add chunk_embedding_jobs table
 *
 * Creates a job queue table for chunk embedding generation, similar to
 * graph_embedding_jobs. This enables async processing with retry logic
 * when embedding generation fails during document upload.
 *
 * Related: apps/server/src/modules/chunks/chunk-embedding-jobs.service.ts
 */
export class AddChunkEmbeddingJobs1763130000000 implements MigrationInterface {
  name = 'AddChunkEmbeddingJobs1763130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the chunk embedding jobs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS kb.chunk_embedding_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chunk_id UUID NOT NULL REFERENCES kb.chunks(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Create indexes for efficient queue operations
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chunk_embedding_jobs_chunk_id 
      ON kb.chunk_embedding_jobs(chunk_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chunk_embedding_jobs_status 
      ON kb.chunk_embedding_jobs(status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_chunk_embedding_jobs_dequeue 
      ON kb.chunk_embedding_jobs(status, scheduled_at, priority DESC)
      WHERE status = 'pending'
    `);

    // Add RLS policy for the new table (matching existing patterns)
    await queryRunner.query(`
      ALTER TABLE kb.chunk_embedding_jobs ENABLE ROW LEVEL SECURITY
    `);

    // Policy: Allow access based on chunk's document's project
    await queryRunner.query(`
      CREATE POLICY chunk_embedding_jobs_project_access ON kb.chunk_embedding_jobs
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM kb.chunks c
          JOIN kb.documents d ON c.document_id = d.id
          WHERE c.id = chunk_embedding_jobs.chunk_id
          AND (
            current_setting('app.current_project_id', true) = '' 
            OR d.project_id::text = current_setting('app.current_project_id', true)
          )
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS chunk_embedding_jobs_project_access ON kb.chunk_embedding_jobs`
    );
    await queryRunner.query(`DROP TABLE IF EXISTS kb.chunk_embedding_jobs`);
  }
}
