import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocumentOrgProjectMetadata1762586504310 implements MigrationInterface {
    name = 'AddDocumentOrgProjectMetadata1762586504310'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add organization_id column
        await queryRunner.query(`
            ALTER TABLE "kb"."documents" 
            ADD COLUMN IF NOT EXISTS "organization_id" uuid
        `);

        // Add project_id column
        await queryRunner.query(`
            ALTER TABLE "kb"."documents" 
            ADD COLUMN IF NOT EXISTS "project_id" uuid
        `);

        // Add integration_metadata column
        await queryRunner.query(`
            ALTER TABLE "kb"."documents" 
            ADD COLUMN IF NOT EXISTS "integration_metadata" jsonb
        `);

        // Create indexes for better query performance
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_documents_organization_id" 
            ON "kb"."documents" ("organization_id")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_documents_project_id" 
            ON "kb"."documents" ("project_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.query(`DROP INDEX IF EXISTS "kb"."IDX_documents_project_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "kb"."IDX_documents_organization_id"`);
        
        // Drop columns
        await queryRunner.query(`ALTER TABLE "kb"."documents" DROP COLUMN IF EXISTS "integration_metadata"`);
        await queryRunner.query(`ALTER TABLE "kb"."documents" DROP COLUMN IF EXISTS "project_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."documents" DROP COLUMN IF EXISTS "organization_id"`);
    }
}
