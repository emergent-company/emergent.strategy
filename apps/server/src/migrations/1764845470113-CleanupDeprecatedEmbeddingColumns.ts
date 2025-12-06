import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Remove deprecated embedding columns from kb.graph_objects
 *
 * Context:
 * - embedding (bytea): Legacy pre-pgvector format, no longer used
 * - embedding_vec (vector(32)): First pgvector attempt, wrong dimension
 * - embedding_v1 (vector(1536)): Proposed for OpenAI, never populated (wrong dim for Gemini)
 * - embedding_v2 (vector(768)): ACTIVE - correct dimension for Gemini text-embedding-004
 *
 * This migration removes the deprecated columns to:
 * 1. Reduce storage overhead
 * 2. Eliminate confusion about which column to use
 * 3. Clean up technical debt
 *
 * The embedding_updated_at column is retained as it tracks when embeddings were last updated.
 *
 * Related: docs/bugs/004-embedding-column-mismatch.md
 */
export class CleanupDeprecatedEmbeddingColumns1764845470113
  implements MigrationInterface
{
  name = 'CleanupDeprecatedEmbeddingColumns1764845470113';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first (if they exist)
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_graph_objects_embedding_vec"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."IDX_graph_objects_embedding_vec_ivfflat"`
    );

    // Drop deprecated columns
    // embedding_v2 is kept - it's the active column
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP COLUMN IF EXISTS "embedding"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP COLUMN IF EXISTS "embedding_vec"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP COLUMN IF EXISTS "embedding_v1"`
    );

    console.log('✅ Removed deprecated embedding columns:');
    console.log('   - embedding (bytea) - legacy pre-pgvector format');
    console.log('   - embedding_vec (vector(32)) - wrong dimension');
    console.log('   - embedding_v1 (vector(1536)) - never populated');
    console.log('✅ Retained embedding_v2 (vector(768)) as the active column');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore columns (without data - data is lost)
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD COLUMN IF NOT EXISTS "embedding" bytea`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD COLUMN IF NOT EXISTS "embedding_vec" vector(32)`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD COLUMN IF NOT EXISTS "embedding_v1" vector(1536)`
    );

    // Recreate index for embedding_vec
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_graph_objects_embedding_vec" 
       ON "kb"."graph_objects" 
       USING ivfflat (embedding_vec vector_cosine_ops) 
       WITH (lists = 100)`
    );

    console.log('⚠️  Restored deprecated embedding columns (without data)');
  }
}
