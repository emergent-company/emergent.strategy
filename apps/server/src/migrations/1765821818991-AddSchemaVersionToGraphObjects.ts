import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchemaVersionToGraphObjects1765821818991
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add schema_version column to graph_objects
    // This stores the template pack version (e.g., "2.0.0") at the time the object was created
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD COLUMN IF NOT EXISTS "schema_version" TEXT`
    );

    // Add index for querying objects by schema version (useful for migrations)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_graph_objects_schema_version" ON "kb"."graph_objects" ("schema_version")`
    );

    // Add comment explaining the column's purpose
    await queryRunner.query(
      `COMMENT ON COLUMN "kb"."graph_objects"."schema_version" IS 'Template pack version at time of object creation (e.g., "2.0.0"). Used for schema migration tracking. NULL for objects created before this feature or without a template pack.'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_graph_objects_schema_version"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP COLUMN IF EXISTS "schema_version"`
    );
  }
}
