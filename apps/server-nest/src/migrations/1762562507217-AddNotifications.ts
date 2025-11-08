import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotifications1762562507217 implements MigrationInterface {
    name = 'AddNotifications1762562507217'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "kb"."notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "project_id" uuid NOT NULL, "user_id" uuid NOT NULL, "title" text NOT NULL, "message" text NOT NULL, "type" text, "severity" text NOT NULL DEFAULT 'info', "related_resource_type" text, "related_resource_id" uuid, "read" boolean NOT NULL DEFAULT false, "dismissed" boolean NOT NULL DEFAULT false, "dismissed_at" TIMESTAMP WITH TIME ZONE, "actions" jsonb NOT NULL DEFAULT '[]', "expires_at" TIMESTAMP WITH TIME ZONE, "read_at" TIMESTAMP WITH TIME ZONE, "importance" text NOT NULL DEFAULT 'other', "cleared_at" TIMESTAMP WITH TIME ZONE, "snoozed_until" TIMESTAMP WITH TIME ZONE, "category" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f8b7ed75170d2d7dca4477cc94" ON "kb"."notifications" ("read") `);
        await queryRunner.query(`CREATE INDEX "IDX_95464140d7dc04d7efb0afd6be" ON "kb"."notifications" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_cb7b1fb018b296f2107e998b2f" ON "kb"."notifications" ("organization_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9a8a82462cab47c73d25f49261" ON "kb"."notifications" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "kb"."notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_9a8a82462cab47c73d25f49261"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_cb7b1fb018b296f2107e998b2f"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_95464140d7dc04d7efb0afd6be"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_f8b7ed75170d2d7dca4477cc94"`);
        await queryRunner.query(`DROP TABLE "kb"."notifications"`);
    }

}
