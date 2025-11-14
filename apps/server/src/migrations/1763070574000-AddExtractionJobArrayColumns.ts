import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExtractionJobArrayColumns1763070574000
  implements MigrationInterface
{
  name = 'AddExtractionJobArrayColumns1763070574000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add discovered_types JSONB column
    await queryRunner.query(`
      ALTER TABLE "kb"."object_extraction_jobs" 
      ADD COLUMN "discovered_types" jsonb DEFAULT '[]'::jsonb
    `);

    // Add created_objects JSONB column (note: different from objects_created integer)
    await queryRunner.query(`
      ALTER TABLE "kb"."object_extraction_jobs" 
      ADD COLUMN "created_objects" jsonb DEFAULT '[]'::jsonb
    `);

    // Add error_details JSONB column if it doesn't exist
    await queryRunner.query(`
      ALTER TABLE "kb"."object_extraction_jobs" 
      ADD COLUMN IF NOT EXISTS "error_details" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "kb"."object_extraction_jobs" 
      DROP COLUMN IF EXISTS "discovered_types"
    `);

    await queryRunner.query(`
      ALTER TABLE "kb"."object_extraction_jobs" 
      DROP COLUMN IF EXISTS "created_objects"
    `);

    await queryRunner.query(`
      ALTER TABLE "kb"."object_extraction_jobs" 
      DROP COLUMN IF EXISTS "error_details"
    `);
  }
}
