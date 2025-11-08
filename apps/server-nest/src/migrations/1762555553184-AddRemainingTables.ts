import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRemainingTables1762555553184 implements MigrationInterface {
    name = 'AddRemainingTables1762555553184'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "kb"."settings" ("key" text NOT NULL, "value" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY ("key"))`);
        await queryRunner.query(`CREATE TABLE "kb"."product_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid NOT NULL, "name" text NOT NULL, "description" text, "base_product_version_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_dbd6ab6ae9343c6c6f2df5e76db" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."product_version_members" ("product_version_id" uuid NOT NULL, "object_canonical_id" uuid NOT NULL, "object_version_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b5b8707471c0c5c16f64f95f75c" PRIMARY KEY ("product_version_id", "object_canonical_id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."object_type_schemas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid, "type" text NOT NULL, "version" integer NOT NULL DEFAULT '1', "supersedes_id" uuid, "canonical_id" uuid, "json_schema" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_10b0ea5bce13b0404825a0c94cd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."merge_provenance" ("child_version_id" uuid NOT NULL, "parent_version_id" uuid NOT NULL, "role" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c6759cdb97dce23f85bb11cb5c1" PRIMARY KEY ("child_version_id", "parent_version_id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "project_id" uuid, "email" text NOT NULL, "role" text NOT NULL, "token" text NOT NULL, "status" text NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP WITH TIME ZONE, "accepted_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_aa52e96b44a714372f4dd31a0af" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."chat_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" text NOT NULL, "owner_subject_id" text, "is_private" boolean NOT NULL DEFAULT true, "organization_id" uuid, "project_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ff117d9f57807c4f2e3034a39f3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "role" text NOT NULL, "content" text NOT NULL, "citations" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid, "name" text NOT NULL, "parent_branch_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f37d3b42defea97f1df0d19535" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."branch_lineage" ("branch_id" uuid NOT NULL, "ancestor_branch_id" uuid NOT NULL, "depth" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1f87552be159d70c1e49bc394d4" PRIMARY KEY ("branch_id", "ancestor_branch_id"))`);
        await queryRunner.query(`ALTER TABLE "kb"."chat_messages" ADD CONSTRAINT "FK_3d623662d4ee1219b23cf61e649" FOREIGN KEY ("conversation_id") REFERENCES "kb"."chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "kb"."chat_messages" DROP CONSTRAINT "FK_3d623662d4ee1219b23cf61e649"`);
        await queryRunner.query(`DROP TABLE "kb"."branch_lineage"`);
        await queryRunner.query(`DROP TABLE "kb"."branches"`);
        await queryRunner.query(`DROP TABLE "kb"."chat_messages"`);
        await queryRunner.query(`DROP TABLE "kb"."chat_conversations"`);
        await queryRunner.query(`DROP TABLE "kb"."invites"`);
        await queryRunner.query(`DROP TABLE "kb"."merge_provenance"`);
        await queryRunner.query(`DROP TABLE "kb"."object_type_schemas"`);
        await queryRunner.query(`DROP TABLE "kb"."product_version_members"`);
        await queryRunner.query(`DROP TABLE "kb"."product_versions"`);
        await queryRunner.query(`DROP TABLE "kb"."settings"`);
    }

}
