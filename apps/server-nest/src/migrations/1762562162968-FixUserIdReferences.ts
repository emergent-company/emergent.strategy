import { MigrationInterface, QueryRunner } from "typeorm";

export class FixUserIdReferences1762562162968 implements MigrationInterface {
    name = 'FixUserIdReferences1762562162968'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop old indexes on subject_id
        await queryRunner.query(`DROP INDEX "kb"."IDX_f98976203e259f07762a66307b"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_90b73980ac8456d6d82a53cc21"`);
        
        // ==========================================
        // Data Migration: subject_id (TEXT) → user_id (UUID)
        // ==========================================
        
        // 1. Add new user_id column (nullable initially for data migration)
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" ADD "user_id" uuid`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" ADD "user_id" uuid`);
        await queryRunner.query(`ALTER TABLE "kb"."chat_conversations" ADD "owner_user_id" uuid`);
        
        // 2. Migrate data: Convert subject_id (Zitadel ID) to user_id (internal UUID)
        await queryRunner.query(`
            UPDATE kb.project_memberships pm
            SET user_id = up.id
            FROM core.user_profiles up
            WHERE up.zitadel_user_id = pm.subject_id
        `);
        
        await queryRunner.query(`
            UPDATE kb.organization_memberships om
            SET user_id = up.id
            FROM core.user_profiles up
            WHERE up.zitadel_user_id = om.subject_id
        `);
        
        await queryRunner.query(`
            UPDATE kb.chat_conversations cc
            SET owner_user_id = up.id
            FROM core.user_profiles up
            WHERE up.zitadel_user_id = cc.owner_subject_id
        `);
        
        // 3. Make user_id NOT NULL (chat_conversations.owner_user_id stays nullable)
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" ALTER COLUMN "user_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" ALTER COLUMN "user_id" SET NOT NULL`);
        
        // 4. Drop old subject_id columns
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" DROP COLUMN "subject_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" DROP COLUMN "subject_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."chat_conversations" DROP COLUMN "owner_subject_id"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_b877acbf8d466f2889a2eeb147" ON "kb"."project_memberships" ("project_id", "user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_7cb6c36ad5bf1bd4a413823ace" ON "kb"."project_memberships" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_caa73db1b161fa6b3a042290fe" ON "kb"."organization_memberships" ("organization_id", "user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_5352fc550034d507d6c76dd290" ON "kb"."organization_memberships" ("user_id") `);
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" ADD CONSTRAINT "FK_7cb6c36ad5bf1bd4a413823acec" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" ADD CONSTRAINT "FK_38a73cbcc58fbed8e62a66d79b8" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY ("organization_id") REFERENCES "kb"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kb"."chat_conversations" ADD CONSTRAINT "FK_14ad2d35eccbe22a4bc61a9a065" FOREIGN KEY ("owner_user_id") REFERENCES "core"."user_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "kb"."chat_conversations" DROP CONSTRAINT "FK_14ad2d35eccbe22a4bc61a9a065"`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" DROP CONSTRAINT "FK_5352fc550034d507d6c76dd2901"`);
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" DROP CONSTRAINT "FK_38a73cbcc58fbed8e62a66d79b8"`);
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" DROP CONSTRAINT "FK_7cb6c36ad5bf1bd4a413823acec"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_5352fc550034d507d6c76dd290"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_caa73db1b161fa6b3a042290fe"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_7cb6c36ad5bf1bd4a413823ace"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_b877acbf8d466f2889a2eeb147"`);
        await queryRunner.query(`ALTER TABLE "kb"."chat_conversations" DROP COLUMN "owner_user_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."chat_conversations" ADD "owner_user_id" text`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" ADD "user_id" text NOT NULL`);
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" ADD "user_id" text NOT NULL`);
        await queryRunner.query(`ALTER TABLE "kb"."chat_conversations" RENAME COLUMN "owner_user_id" TO "owner_subject_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."organization_memberships" RENAME COLUMN "user_id" TO "subject_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."project_memberships" RENAME COLUMN "user_id" TO "subject_id"`);
        await queryRunner.query(`CREATE INDEX "IDX_90b73980ac8456d6d82a53cc21" ON "kb"."organization_memberships" ("subject_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f98976203e259f07762a66307b" ON "kb"."project_memberships" ("subject_id") `);
    }

}
