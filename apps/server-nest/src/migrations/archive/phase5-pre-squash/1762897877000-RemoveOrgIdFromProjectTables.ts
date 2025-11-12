import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOrgIdFromProjectTables1762897877000
  implements MigrationInterface
{
  name = 'RemoveOrgIdFromProjectTables1762897877000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop organization_id columns from remaining project-scoped tables
    // These tables can derive organization context via project_id -> projects.organization_id
    
    await queryRunner.query(
      `ALTER TABLE "kb"."branches" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_type_schemas" DROP COLUMN "organization_id"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore organization_id columns if migration is rolled back
    await queryRunner.query(
      `ALTER TABLE "kb"."object_type_schemas" ADD "organization_id" uuid`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" ADD "organization_id" uuid`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."branches" ADD "organization_id" uuid`
    );
  }
}
