import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixDocumentContentHashConstraint1762819200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing global unique constraint on content_hash
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_a62c6bec50c07764e19636a5a4";
    `);

    // Create a new unique constraint on (project_id, content_hash)
    // This allows the same content to exist in different projects
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_a62c6bec50c07764e19636a5a4" 
      ON kb.documents (project_id, content_hash) 
      WHERE content_hash IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the composite unique constraint
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_a62c6bec50c07764e19636a5a4";
    `);

    // Restore the original global unique constraint on content_hash
    // WARNING: This may fail if there are duplicate content_hash values across projects
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_a62c6bec50c07764e19636a5a4" 
      ON kb.documents (content_hash) 
      WHERE content_hash IS NOT NULL;
    `);
  }
}
