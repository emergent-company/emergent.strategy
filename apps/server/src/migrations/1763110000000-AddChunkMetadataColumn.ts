import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds metadata JSONB column to kb.chunks table.
 *
 * This column stores chunking strategy metadata:
 * - strategy: 'character' | 'sentence' | 'paragraph'
 * - startOffset: character offset in original document
 * - endOffset: character offset end
 * - boundaryType: 'sentence' | 'paragraph' | 'character' | 'section'
 *
 * Example:
 * {
 *   "strategy": "sentence",
 *   "startOffset": 0,
 *   "endOffset": 1150,
 *   "boundaryType": "sentence"
 * }
 */
export class AddChunkMetadataColumn1763110000000 implements MigrationInterface {
  name = 'AddChunkMetadataColumn1763110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add nullable JSONB column for chunk metadata
    await queryRunner.query(
      `ALTER TABLE "kb"."chunks" ADD COLUMN IF NOT EXISTS "metadata" JSONB DEFAULT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."chunks" DROP COLUMN IF EXISTS "metadata"`
    );
  }
}
