import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrgProjectTables1762553978599 implements MigrationInterface {
    name = 'AddOrgProjectTables1762553978599'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "kb"."chunks" DROP CONSTRAINT "chunks_document_id_fkey"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_chunks_doc"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_chunks_doc_chunkindex"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_chunks_embedding"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_chunks_tsv"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_documents_content_hash"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_object_extraction_jobs_organization"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_object_extraction_jobs_project"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_object_extraction_jobs_status"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_graph_embedding_jobs_object"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_graph_embedding_jobs_status"`);
        await queryRunner.query(`DROP INDEX "kb"."idx_auth_introspection_cache_expires_at"`);
        await queryRunner.query(`COMMENT ON TABLE "kb"."auth_introspection_cache" IS NULL`);
        await queryRunner.query(`CREATE TABLE "kb"."projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "name" text NOT NULL, "kb_purpose" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "auto_extract_objects" boolean NOT NULL DEFAULT false, "auto_extract_config" jsonb NOT NULL DEFAULT '{}', "chat_prompt_template" text, CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."project_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "subject_id" text NOT NULL, "role" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_856d7bae2d9bddc94861d41eded" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_38a73cbcc58fbed8e62a66d79b" ON "kb"."project_memberships" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f98976203e259f07762a66307b" ON "kb"."project_memberships" ("subject_id") `);
        await queryRunner.query(`CREATE TABLE "kb"."organization_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "subject_id" text NOT NULL, "role" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_86ae2efbb9ce84dd652e0c96a4" ON "kb"."organization_memberships" ("organization_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_90b73980ac8456d6d82a53cc21" ON "kb"."organization_memberships" ("subject_id") `);
        await queryRunner.query(`CREATE TABLE "kb"."orgs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9eed8bfad4c9e0dc8648e090efe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."token_hash" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."introspection_data" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."expires_at" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."created_at" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."created_at" IS 'Timestamp when cache entry was created'`);
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."expires_at" IS 'Timestamp when cache entry expires (based on token expiry and configured TTL)'`);
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."introspection_data" IS 'Full introspection response from Zitadel stored as JSONB (includes user info, roles, scopes)'`);
        await queryRunner.query(`COMMENT ON COLUMN "kb"."auth_introspection_cache"."token_hash" IS 'SHA-512 hash of the access token (used as cache key for security)'`);
        await queryRunner.query(`DROP TABLE "kb"."orgs"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_90b73980ac8456d6d82a53cc21"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_86ae2efbb9ce84dd652e0c96a4"`);
        await queryRunner.query(`DROP TABLE "kb"."organization_memberships"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_f98976203e259f07762a66307b"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_38a73cbcc58fbed8e62a66d79b"`);
        await queryRunner.query(`DROP TABLE "kb"."project_memberships"`);
        await queryRunner.query(`DROP TABLE "kb"."projects"`);
        await queryRunner.query(`COMMENT ON TABLE "kb"."auth_introspection_cache" IS 'Caches Zitadel OAuth2 token introspection results to reduce API calls and improve authentication performance'`);
        await queryRunner.query(`CREATE INDEX "idx_auth_introspection_cache_expires_at" ON "kb"."auth_introspection_cache" ("expires_at") `);
        await queryRunner.query(`CREATE INDEX "idx_graph_embedding_jobs_status" ON "kb"."graph_embedding_jobs" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_graph_embedding_jobs_object" ON "kb"."graph_embedding_jobs" ("object_id") `);
        await queryRunner.query(`CREATE INDEX "idx_object_extraction_jobs_status" ON "kb"."object_extraction_jobs" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_object_extraction_jobs_project" ON "kb"."object_extraction_jobs" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "idx_object_extraction_jobs_organization" ON "kb"."object_extraction_jobs" ("organization_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_documents_content_hash" ON "kb"."documents" ("content_hash") `);
        await queryRunner.query(`CREATE INDEX "idx_chunks_tsv" ON "kb"."chunks" ("tsv") `);
        await queryRunner.query(`CREATE INDEX "idx_chunks_embedding" ON "kb"."chunks" ("embedding") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_chunks_doc_chunkindex" ON "kb"."chunks" ("document_id", "chunk_index") `);
        await queryRunner.query(`CREATE INDEX "idx_chunks_doc" ON "kb"."chunks" ("document_id") `);
        await queryRunner.query(`ALTER TABLE "kb"."chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "kb"."documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
