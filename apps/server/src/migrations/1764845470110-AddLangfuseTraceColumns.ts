import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLangfuseTraceColumns1764845470110
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."system_process_logs" ADD "langfuse_trace_id" text`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."llm_call_logs" ADD "langfuse_observation_id" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."llm_call_logs" DROP COLUMN "langfuse_observation_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."system_process_logs" DROP COLUMN "langfuse_trace_id"`
    );
  }
}
