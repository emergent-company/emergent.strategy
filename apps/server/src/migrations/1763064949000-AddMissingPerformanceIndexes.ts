import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds critical performance indexes that were present in pre-squash migrations
 * but missing from the squashed schema.
 *
 * These indexes are essential for:
 * - Vector similarity search (pgvector) on chunks.embedding
 * - Full-text search (GIN) on chunks.tsv
 */
export class AddMissingPerformanceIndexes1763064949000
  implements MigrationInterface
{
  name = 'AddMissingPerformanceIndexes1763064949000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create vector index for semantic search (if not exists)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chunks_embedding" ON "kb"."chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)`
    );

    // Create GIN index for full-text search (if not exists)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_chunks_tsv" ON "kb"."chunks" USING gin ("tsv")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_tsv"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_embedding"`);
  }
}
