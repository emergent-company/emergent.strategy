import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectOrgForeignKey1763069753715
  implements MigrationInterface
{
  name = 'AddProjectOrgForeignKey1763069753715';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Clean up orphaned projects (projects with organization_id that doesn't exist in orgs table)
    await queryRunner.query(`
            DELETE FROM "kb"."projects" 
            WHERE "organization_id" NOT IN (SELECT "id" FROM "kb"."orgs")
        `);

    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_embedding"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_tsv"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_5cbe2822f76435535640d37da9"`);
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" DROP COLUMN "tenant_id"`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fa75fed9ce3b25732c0bf7bf24" ON "kb"."graph_objects" ("project_id", "branch_id", "type", "key") WHERE deleted_at IS NULL AND supersedes_id IS NULL AND key IS NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."projects" ADD CONSTRAINT "FK_585c8ce06628c70b70100bfb842" FOREIGN KEY ("organization_id") REFERENCES "kb"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );

    // Recreate the performance indexes with proper types
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_embedding" ON "kb"."chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)`
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_tsv" ON "kb"."chunks" USING gin ("tsv")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the performance indexes first
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_tsv"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_embedding"`);

    await queryRunner.query(
      `ALTER TABLE "kb"."projects" DROP CONSTRAINT "FK_585c8ce06628c70b70100bfb842"`
    );
    await queryRunner.query(`DROP INDEX "kb"."IDX_fa75fed9ce3b25732c0bf7bf24"`);
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD "tenant_id" uuid NOT NULL`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5cbe2822f76435535640d37da9" ON "kb"."graph_objects" ("project_id", "type", "key", "branch_id") WHERE ((deleted_at IS NULL) AND (supersedes_id IS NULL) AND (key IS NOT NULL))`
    );

    // Recreate the indexes in their original simple form (before the performance migration)
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_tsv" ON "kb"."chunks" ("tsv") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_embedding" ON "kb"."chunks" ("embedding") `
    );
  }
}
