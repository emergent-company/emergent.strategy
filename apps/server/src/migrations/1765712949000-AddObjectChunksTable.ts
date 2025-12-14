import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add object_chunks join table for provenance tracking
 *
 * This table links graph_objects to the source chunks they were extracted from,
 * providing proper provenance tracking for the object refinement feature.
 *
 * Replaces the previous approach of storing _extraction_source_id in properties.
 *
 * Changes:
 * 1. Create kb.object_chunks table
 * 2. Add indexes for efficient lookups
 */
export class AddObjectChunksTable1765712949000 implements MigrationInterface {
  name = 'AddObjectChunksTable1765712949000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create the object_chunks join table
    await queryRunner.query(`
      CREATE TABLE kb.object_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        object_id UUID NOT NULL REFERENCES kb.graph_objects(id) ON DELETE CASCADE,
        chunk_id UUID NOT NULL REFERENCES kb.chunks(id) ON DELETE CASCADE,
        extraction_job_id UUID REFERENCES kb.object_extraction_jobs(id) ON DELETE SET NULL,
        confidence REAL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(object_id, chunk_id)
      )
    `);

    // 2. Add indexes for efficient lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_object_chunks_object_id" ON kb.object_chunks(object_id)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_object_chunks_chunk_id" ON kb.object_chunks(chunk_id)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_object_chunks_extraction_job_id" ON kb.object_chunks(extraction_job_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_object_chunks_extraction_job_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_object_chunks_chunk_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_object_chunks_object_id"
    `);

    // Drop the table
    await queryRunner.query(`
      DROP TABLE IF EXISTS kb.object_chunks
    `);
  }
}
