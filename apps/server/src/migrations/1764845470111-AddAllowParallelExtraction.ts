import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllowParallelExtraction1764845470111
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."projects" ADD COLUMN IF NOT EXISTS "allow_parallel_extraction" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "kb"."projects"."allow_parallel_extraction" IS 'When true, multiple extraction jobs can run simultaneously for this project. When false (default), jobs are queued and run one at a time.'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."projects" DROP COLUMN "allow_parallel_extraction"`
    );
  }
}
