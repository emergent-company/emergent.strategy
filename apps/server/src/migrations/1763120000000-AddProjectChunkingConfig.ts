import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectChunkingConfig1763120000000
  implements MigrationInterface
{
  name = 'AddProjectChunkingConfig1763120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add chunking_config JSONB column to projects table
    await queryRunner.query(`
      ALTER TABLE kb.projects
      ADD COLUMN IF NOT EXISTS chunking_config JSONB DEFAULT NULL
    `);

    // Add a comment explaining the column purpose
    await queryRunner.query(`
      COMMENT ON COLUMN kb.projects.chunking_config IS 
      'Project-level document chunking configuration: { strategy: character|sentence|paragraph, maxChunkSize?: number, minChunkSize?: number, overlap?: number }'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE kb.projects
      DROP COLUMN IF EXISTS chunking_config
    `);
  }
}
