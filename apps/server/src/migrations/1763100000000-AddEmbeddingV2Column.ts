import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add embedding_v2 column with correct dimension (768)
 *
 * Context:
 * - Current system has embedding_vec (vector(32)) and embedding_v1 (vector(1536))
 * - Gemini text-embedding-004 produces 768-dimensional embeddings
 * - Embedding worker was writing to 'embedding' (bytea) instead of vector column
 * - Vector search was reading from 'embedding_vec' (wrong dimension, always NULL)
 *
 * This migration:
 * 1. Adds embedding_v2 column with correct dimension (768)
 * 2. Creates ivfflat index for fast cosine similarity search
 * 3. Prepares for worker update to write to this column
 *
 * Related Bug: docs/bugs/004-embedding-column-mismatch.md
 */
export class AddEmbeddingV2Column1763100000000 implements MigrationInterface {
  name = 'AddEmbeddingV2Column1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure pgvector extension is available
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    // Add new embedding column with correct dimension (768)
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" 
       ADD COLUMN IF NOT EXISTS "embedding_v2" vector(768)`
    );

    // Create ivfflat index for fast cosine similarity search
    // lists parameter set to 100 (recommended for < 1M rows)
    // Can be adjusted based on dataset size:
    //   - < 100K rows: lists = 100
    //   - 100K-1M rows: lists = 1000
    //   - > 1M rows: lists = sqrt(rows)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_graph_objects_embedding_v2_ivfflat"
       ON "kb"."graph_objects"
       USING ivfflat (embedding_v2 vector_cosine_ops)
       WITH (lists = 100)`
    );

    console.log('✅ Added embedding_v2 column (768 dimensions)');
    console.log('✅ Created ivfflat index for cosine similarity search');
    console.log(
      '📋 Next: Update EmbeddingWorkerService to write to embedding_v2'
    );
    console.log(
      '📋 Next: Update GraphVectorSearchService to read from embedding_v2'
    );
    console.log(
      '📋 Next: Run reset-embedding-jobs.ts to reprocess all objects'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index first
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."IDX_graph_objects_embedding_v2_ivfflat"`
    );

    // Drop column
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" 
       DROP COLUMN IF EXISTS "embedding_v2"`
    );

    console.log('⚠️  Rolled back embedding_v2 column');
    console.log('⚠️  Vector search will not work');
  }
}
