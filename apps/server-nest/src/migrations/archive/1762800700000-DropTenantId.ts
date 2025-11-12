import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTenantId1762800700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop tenant_id column from object_extraction_jobs table
    // tenant_id was a legacy column that duplicated organization_id
    await queryRunner.query(`
      ALTER TABLE kb.object_extraction_jobs 
      DROP COLUMN IF EXISTS tenant_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore tenant_id column if rollback is needed
    await queryRunner.query(`
      ALTER TABLE kb.object_extraction_jobs 
      ADD COLUMN tenant_id uuid;
    `);

    // Copy organization_id to tenant_id for backward compatibility
    await queryRunner.query(`
      UPDATE kb.object_extraction_jobs 
      SET tenant_id = organization_id 
      WHERE tenant_id IS NULL;
    `);

    // Make it NOT NULL
    await queryRunner.query(`
      ALTER TABLE kb.object_extraction_jobs 
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
  }
}
