import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1762552930798 implements MigrationInterface {
  name = 'InitialSchema1762552930798';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create schemas first
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "core"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "kb"`);

    // Use IF EXISTS for all DROP statements to work on fresh databases
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chunks_document_id_fkey' AND table_schema = 'kb') THEN
          ALTER TABLE "kb"."chunks" DROP CONSTRAINT "chunks_document_id_fkey";
        END IF;
      END $$;`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_doc"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_chunks_doc_chunkindex"`
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_embedding"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "kb"."idx_chunks_tsv"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_documents_content_hash"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_object_extraction_jobs_organization"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_object_extraction_jobs_project"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_object_extraction_jobs_status"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_graph_embedding_jobs_object"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_graph_embedding_jobs_status"`
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "kb"."idx_auth_introspection_cache_expires_at"`
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'check_progress_consistency' AND table_schema = 'kb') THEN
          ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "check_progress_consistency";
        END IF;
      END $$;`
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'object_extraction_jobs_check' AND table_schema = 'kb') THEN
          ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "object_extraction_jobs_check";
        END IF;
      END $$;`
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'object_extraction_jobs_retry_count_check' AND table_schema = 'kb') THEN
          ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "object_extraction_jobs_retry_count_check";
        END IF;
      END $$;`
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'object_extraction_jobs_status_check' AND table_schema = 'kb') THEN
          ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "object_extraction_jobs_status_check";
        END IF;
      END $$;`
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'graph_objects_extraction_confidence_check' AND table_schema = 'kb') THEN
          ALTER TABLE "kb"."graph_objects" DROP CONSTRAINT "graph_objects_extraction_confidence_check";
        END IF;
      END $$;`
    );
    await queryRunner.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'graph_embedding_jobs_status_check' AND table_schema = 'kb') THEN
          ALTER TABLE "kb"."graph_embedding_jobs" DROP CONSTRAINT "graph_embedding_jobs_status_check";
        END IF;
      END $$;`
    );
    // Removed COMMENT statement - not needed for fresh DB and causes transaction abort
    await queryRunner.query(
      `CREATE TABLE "core"."user_emails" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "email" text NOT NULL, "verified" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3ef6c4be97ba94ea3ba65362ad0" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6594597afde633cfeab9a806e4" ON "core"."user_emails" ("email") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2e88b95787b903d46ab3cc3eb9" ON "core"."user_emails" ("user_id") `
    );
    await queryRunner.query(
      `CREATE TABLE "core"."user_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "zitadel_user_id" text NOT NULL, "first_name" text, "last_name" text, "display_name" text, "phone_e164" text, "avatar_object_key" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1ec6662219f4605723f1e41b6cb" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3ef997e65ad4f83f35356a1a6e" ON "core"."user_profiles" ("zitadel_user_id") `
    );
    try {
      await queryRunner.query(
        `ALTER TABLE "kb"."graph_objects" DROP COLUMN "embedding_v2"`
      );
    } catch {}
    try {
      await queryRunner.query(
        `ALTER TABLE "kb"."graph_objects" DROP COLUMN "tsv"`
      );
    } catch {}
    try {
      await queryRunner.query(
        `ALTER TABLE "kb"."graph_objects" DROP COLUMN "expires_at"`
      );
    } catch {}
    try {
      await queryRunner.query(
        `ALTER TABLE "kb"."tags" ADD CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id")`
      );
    } catch {}
    try {
      await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "enabled_types" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "extraction_config" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "objects_created" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "relationships_created" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "suggestions_created" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "retry_count" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "max_retries" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "source_metadata" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "total_items" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "processed_items" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "successful_items" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "failed_items" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "logs" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" ADD CONSTRAINT "PK_e858a7876b4b8a382c481bded76" PRIMARY KEY ("id")`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD CONSTRAINT "PK_078aacf1069493166009e2f1f5d" PRIMARY KEY ("id")`
    );
    // Removed COMMENT statements for non-existent auth_introspection_cache table
    await queryRunner.query(
      `CREATE INDEX "IDX_d841de45a719fe1f35213d7920" ON "kb"."chunks" ("document_id") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6f5a7e4467cdc44037f209122e" ON "kb"."chunks" ("document_id", "chunk_index") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a62c6bec50c07764e19636a5a4" ON "kb"."documents" ("content_hash") WHERE content_hash IS NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_587ec50ea3409700ba7299c3b0" ON "kb"."object_extraction_jobs" ("organization_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1c7f91f13d7e1a438519d37ec3" ON "kb"."object_extraction_jobs" ("project_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3844c9efd6d2e06105a117f90c" ON "kb"."object_extraction_jobs" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2927d35a99e3f8b3d443496525" ON "kb"."graph_relationships" ("organization_id", "project_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f35de415032037ea629b1772e4" ON "kb"."graph_relationships" ("type") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8d6b0b40d75cdabb27cf81084" ON "kb"."graph_relationships" ("dst_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a970f04cced6336cb2b1ad1f4e" ON "kb"."graph_relationships" ("src_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b8c7752534a444c2f16ebf3d91" ON "kb"."graph_objects" ("type") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c04db004625a1c8be8abb6c046" ON "kb"."graph_objects" ("canonical_id") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d2e1c350bb54247677a298ec6f" ON "kb"."graph_objects" ("organization_id", "project_id", "type", "key") WHERE deleted_at IS NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f0021c2230e47af51928f35975" ON "kb"."graph_embedding_jobs" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_df895a2e1799c53ef660d0aae6" ON "kb"."graph_embedding_jobs" ("object_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d05c07bafeabc0850f94db035b" ON "kb"."auth_introspection_cache" ("expires_at") `
    );
    await queryRunner.query(
      `ALTER TABLE "core"."user_emails" ADD CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chunks" ADD CONSTRAINT "FK_d841de45a719fe1f35213d79207" FOREIGN KEY ("document_id") REFERENCES "kb"."documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "FK_543b356bd6204a84bc8c038d309" FOREIGN KEY ("document_id") REFERENCES "kb"."documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "FK_543b356bd6204a84bc8c038d309"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chunks" DROP CONSTRAINT "FK_d841de45a719fe1f35213d79207"`
    );
    await queryRunner.query(
      `ALTER TABLE "core"."user_emails" DROP CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91"`
    );
    await queryRunner.query(`DROP INDEX "kb"."IDX_d05c07bafeabc0850f94db035b"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_df895a2e1799c53ef660d0aae6"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_f0021c2230e47af51928f35975"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_d2e1c350bb54247677a298ec6f"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_c04db004625a1c8be8abb6c046"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_b8c7752534a444c2f16ebf3d91"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_a970f04cced6336cb2b1ad1f4e"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_f8d6b0b40d75cdabb27cf81084"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_f35de415032037ea629b1772e4"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_2927d35a99e3f8b3d443496525"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_3844c9efd6d2e06105a117f90c"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_1c7f91f13d7e1a438519d37ec3"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_587ec50ea3409700ba7299c3b0"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_a62c6bec50c07764e19636a5a4"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_6f5a7e4467cdc44037f209122e"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_d841de45a719fe1f35213d7920"`);
    // Removed COMMENT statements for non-existent auth_introspection_cache table
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP CONSTRAINT "PK_078aacf1069493166009e2f1f5d"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" DROP CONSTRAINT "PK_e858a7876b4b8a382c481bded76"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "logs" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "failed_items" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "successful_items" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "processed_items" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "total_items" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "source_metadata" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "max_retries" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "retry_count" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "suggestions_created" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "relationships_created" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "objects_created" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "extraction_config" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ALTER COLUMN "enabled_types" DROP NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."tags" DROP CONSTRAINT "PK_e7dc17249a1148a1970748eda99"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD "expires_at" TIMESTAMP WITH TIME ZONE`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD "tsv" tsvector`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD "embedding_v2" vector(1536)`
    );
    await queryRunner.query(
      `DROP INDEX "core"."IDX_3ef997e65ad4f83f35356a1a6e"`
    );
    await queryRunner.query(`DROP TABLE "core"."user_profiles"`);
    await queryRunner.query(
      `DROP INDEX "core"."IDX_2e88b95787b903d46ab3cc3eb9"`
    );
    await queryRunner.query(
      `DROP INDEX "core"."IDX_6594597afde633cfeab9a806e4"`
    );
    await queryRunner.query(`DROP TABLE "core"."user_emails"`);
    // Removed COMMENT statement for non-existent auth_introspection_cache table
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_embedding_jobs" ADD CONSTRAINT "graph_embedding_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'failed'::text, 'completed'::text])))`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD CONSTRAINT "graph_objects_extraction_confidence_check" CHECK (((extraction_confidence IS NULL) OR ((extraction_confidence >= (0.0)::double precision) AND (extraction_confidence <= (1.0)::double precision))))`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "object_extraction_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'processing'::text, 'completed'::text, 'requires_review'::text, 'failed'::text, 'cancelled'::text])))`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "object_extraction_jobs_retry_count_check" CHECK ((retry_count >= 0))`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "object_extraction_jobs_check" CHECK ((retry_count <= max_retries))`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "check_progress_consistency" CHECK (((processed_items >= 0) AND (total_items >= 0) AND (successful_items >= 0) AND (failed_items >= 0) AND (processed_items <= total_items) AND ((successful_items + failed_items) <= processed_items)))`
    );
    // Removed index creation for non-existent auth_introspection_cache table
    await queryRunner.query(
      `CREATE INDEX "idx_graph_embedding_jobs_status" ON "kb"."graph_embedding_jobs" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_graph_embedding_jobs_object" ON "kb"."graph_embedding_jobs" ("object_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_object_extraction_jobs_status" ON "kb"."object_extraction_jobs" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_object_extraction_jobs_project" ON "kb"."object_extraction_jobs" ("project_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_object_extraction_jobs_organization" ON "kb"."object_extraction_jobs" ("organization_id") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_documents_content_hash" ON "kb"."documents" ("content_hash") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_tsv" ON "kb"."chunks" ("tsv") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_embedding" ON "kb"."chunks" ("embedding") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_chunks_doc_chunkindex" ON "kb"."chunks" ("document_id", "chunk_index") `
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chunks_doc" ON "kb"."chunks" ("document_id") `
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "kb"."documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }
}
