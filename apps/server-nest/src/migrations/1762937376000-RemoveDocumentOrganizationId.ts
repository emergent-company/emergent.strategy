import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDocumentOrganizationId1762937376000
  implements MigrationInterface
{
  name = 'RemoveDocumentOrganizationId1762937376000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the index on organization_id
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."IDX_69427761f37533ae7767601a64"`
    );

    // Drop the organization_id column from documents
    await queryRunner.query(
      `ALTER TABLE "kb"."documents" DROP COLUMN IF EXISTS "organization_id"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back the organization_id column
    await queryRunner.query(
      `ALTER TABLE "kb"."documents" ADD "organization_id" uuid`
    );

    // Recreate the index on organization_id
    await queryRunner.query(
      `CREATE INDEX "IDX_69427761f37533ae7767601a64" ON "kb"."documents" ("organization_id")`
    );

    // Backfill organization_id from projects
    await queryRunner.query(`
      UPDATE "kb"."documents" d
      SET "organization_id" = p."organization_id"
      FROM "kb"."projects" p
      WHERE d."project_id" = p."id"
    `);
  }
}
