import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveExtractionJobsOrganizationId1762937500000
  implements MigrationInterface
{
  name = 'RemoveExtractionJobsOrganizationId1762937500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the organization_id column from object_extraction_jobs
    // This aligns extraction jobs with the Phase 5 migration where all graph tables
    // moved from organization-scoped to project-scoped
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" DROP COLUMN IF EXISTS "organization_id"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back the organization_id column
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD "organization_id" uuid`
    );

    // Backfill organization_id from projects
    await queryRunner.query(`
      UPDATE "kb"."object_extraction_jobs" j
      SET "organization_id" = p."organization_id"
      FROM "kb"."projects" p
      WHERE j."project_id" = p."id"
    `);

    // Make the column NOT NULL after backfilling
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "organization_id" SET NOT NULL`
    );
  }
}
