import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add updated_at column to chunks table
 *
 * The chunk_embedding_worker.service.ts expects to update an updated_at column
 * when setting embeddings. This column was missing from the chunks table.
 *
 * Related: apps/server/src/modules/chunks/chunk-embedding-worker.service.ts
 */
export class AddChunksUpdatedAt1764845470112 implements MigrationInterface {
  name = 'AddChunksUpdatedAt1764845470112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add updated_at column with default value
    await queryRunner.query(`
      ALTER TABLE kb.chunks 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    `);

    // Set existing rows to use created_at as initial updated_at
    await queryRunner.query(`
      UPDATE kb.chunks SET updated_at = created_at WHERE updated_at = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kb.chunks DROP COLUMN IF EXISTS updated_at
    `);
  }
}
