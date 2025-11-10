import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1762797725044 implements MigrationInterface {
  name = 'InitialSchema1762797725044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create schemas if they don't exist
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "core"`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "kb"`);

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
    await queryRunner.query(
      `CREATE TABLE "kb"."tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid NOT NULL, "product_version_id" uuid NOT NULL, "name" text NOT NULL, "description" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."system_process_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "process_id" text NOT NULL, "process_type" text NOT NULL, "level" text NOT NULL, "message" text NOT NULL, "metadata" jsonb, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_734385c231b8c9ce4b9157913ae" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."settings" ("key" text NOT NULL, "value" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c8639b7626fa94ba8265628f214" PRIMARY KEY ("key"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "name" text NOT NULL, "kb_purpose" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "auto_extract_objects" boolean NOT NULL DEFAULT false, "auto_extract_config" jsonb NOT NULL DEFAULT '{}', "chat_prompt_template" text, CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."project_object_type_registry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "type_name" text NOT NULL, "source" text NOT NULL, "template_pack_id" uuid, "schema_version" integer NOT NULL DEFAULT '1', "json_schema" jsonb NOT NULL, "ui_config" jsonb, "extraction_config" jsonb, "enabled" boolean NOT NULL DEFAULT true, "discovery_confidence" double precision, "description" text, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_734eabf182ef87e9b747c864d71" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."project_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_856d7bae2d9bddc94861d41eded" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b877acbf8d466f2889a2eeb147" ON "kb"."project_memberships" ("project_id", "user_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_38a73cbcc58fbed8e62a66d79b" ON "kb"."project_memberships" ("project_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7cb6c36ad5bf1bd4a413823ace" ON "kb"."project_memberships" ("user_id") `
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."product_versions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid NOT NULL, "name" text NOT NULL, "description" text, "base_product_version_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_dbd6ab6ae9343c6c6f2df5e76db" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."product_version_members" ("product_version_id" uuid NOT NULL, "object_canonical_id" uuid NOT NULL, "object_version_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b5b8707471c0c5c16f64f95f75c" PRIMARY KEY ("product_version_id", "object_canonical_id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."orgs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9eed8bfad4c9e0dc8648e090efe" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."organization_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_caa73db1b161fa6b3a042290fe" ON "kb"."organization_memberships" ("organization_id", "user_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_86ae2efbb9ce84dd652e0c96a4" ON "kb"."organization_memberships" ("organization_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5352fc550034d507d6c76dd290" ON "kb"."organization_memberships" ("user_id") `
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."object_type_schemas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid, "type" text NOT NULL, "version" integer NOT NULL DEFAULT '1', "supersedes_id" uuid, "canonical_id" uuid, "json_schema" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_10b0ea5bce13b0404825a0c94cd" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."object_extraction_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "extraction_job_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completed_at" TIMESTAMP WITH TIME ZONE, "step_index" integer NOT NULL, "operation_type" text NOT NULL, "operation_name" text, "step" text NOT NULL, "status" text NOT NULL, "message" text, "input_data" jsonb, "output_data" jsonb, "error_message" text, "error_stack" text, "error_details" jsonb, "duration_ms" integer, "tokens_used" integer, "entity_count" integer, "relationship_count" integer, CONSTRAINT "PK_9ea0a4d02ba4f16f7f390589503" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."chunks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "document_id" uuid NOT NULL, "chunk_index" integer NOT NULL, "text" text NOT NULL, "embedding" vector(768), "tsv" tsvector, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a306e60b8fdf6e7de1be4be1e6a" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d841de45a719fe1f35213d7920" ON "kb"."chunks" ("document_id") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6f5a7e4467cdc44037f209122e" ON "kb"."chunks" ("document_id", "chunk_index") `
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid, "source_url" text, "filename" text, "mime_type" text, "content" text, "content_hash" text, "integration_metadata" jsonb, "parent_document_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e156b298c20873e14c362e789b" ON "kb"."documents" ("project_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_69427761f37533ae7767601a64" ON "kb"."documents" ("organization_id") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a62c6bec50c07764e19636a5a4" ON "kb"."documents" ("content_hash") WHERE content_hash IS NOT NULL`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."object_extraction_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "organization_id" uuid NOT NULL, "project_id" uuid NOT NULL, "document_id" uuid, "chunk_id" uuid, "job_type" text NOT NULL DEFAULT 'full_extraction', "status" text NOT NULL DEFAULT 'pending', "enabled_types" text array NOT NULL DEFAULT '{}', "extraction_config" jsonb NOT NULL DEFAULT '{}', "objects_created" integer NOT NULL DEFAULT '0', "relationships_created" integer NOT NULL DEFAULT '0', "suggestions_created" integer NOT NULL DEFAULT '0', "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "error_message" text, "retry_count" integer NOT NULL DEFAULT '0', "max_retries" integer NOT NULL DEFAULT '3', "created_by" uuid, "reprocessing_of" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "source_type" text, "source_id" text, "source_metadata" jsonb NOT NULL DEFAULT '{}', "debug_info" jsonb, "total_items" integer NOT NULL DEFAULT '0', "processed_items" integer NOT NULL DEFAULT '0', "successful_items" integer NOT NULL DEFAULT '0', "failed_items" integer NOT NULL DEFAULT '0', "logs" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_946f0b690e0a0972ebd0e6222d5" PRIMARY KEY ("id"))`
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
      `CREATE TABLE "kb"."notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "project_id" uuid NOT NULL, "user_id" uuid NOT NULL, "title" text NOT NULL, "message" text NOT NULL, "type" text, "severity" text NOT NULL DEFAULT 'info', "related_resource_type" text, "related_resource_id" uuid, "read" boolean NOT NULL DEFAULT false, "dismissed" boolean NOT NULL DEFAULT false, "dismissed_at" TIMESTAMP WITH TIME ZONE, "actions" jsonb NOT NULL DEFAULT '[]', "expires_at" TIMESTAMP WITH TIME ZONE, "read_at" TIMESTAMP WITH TIME ZONE, "importance" text NOT NULL DEFAULT 'other', "cleared_at" TIMESTAMP WITH TIME ZONE, "snoozed_until" TIMESTAMP WITH TIME ZONE, "category" text, "source_type" text, "source_id" text, "action_url" text, "action_label" text, "group_key" text, "details" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8b7ed75170d2d7dca4477cc94" ON "kb"."notifications" ("read") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_95464140d7dc04d7efb0afd6be" ON "kb"."notifications" ("project_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb7b1fb018b296f2107e998b2f" ON "kb"."notifications" ("organization_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9a8a82462cab47c73d25f49261" ON "kb"."notifications" ("user_id") `
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."merge_provenance" ("child_version_id" uuid NOT NULL, "parent_version_id" uuid NOT NULL, "role" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c6759cdb97dce23f85bb11cb5c1" PRIMARY KEY ("child_version_id", "parent_version_id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."llm_call_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "process_id" text NOT NULL, "process_type" text NOT NULL, "model_name" text NOT NULL, "request_payload" jsonb, "response_payload" jsonb, "status" text NOT NULL, "error_message" text, "input_tokens" integer, "output_tokens" integer, "total_tokens" integer, "cost_usd" numeric(10,6), "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completed_at" TIMESTAMP WITH TIME ZONE, "duration_ms" integer, CONSTRAINT "PK_ad84866fef0164fcee07558a67d" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."invites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "project_id" uuid, "email" text NOT NULL, "role" text NOT NULL, "token" text NOT NULL, "status" text NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP WITH TIME ZONE, "accepted_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_aa52e96b44a714372f4dd31a0af" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "display_name" character varying(255) NOT NULL, "description" text, "enabled" boolean NOT NULL DEFAULT false, "org_id" text NOT NULL, "project_id" uuid NOT NULL, "settings_encrypted" bytea, "logo_url" text, "webhook_secret" text, "created_by" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9adcdc6d6f3922535361ce641e8" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."graph_relationships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "project_id" uuid NOT NULL, "type" text NOT NULL, "src_id" uuid NOT NULL, "dst_id" uuid NOT NULL, "properties" jsonb NOT NULL DEFAULT '{}', "weight" real, "valid_from" TIMESTAMP WITH TIME ZONE, "valid_to" TIMESTAMP WITH TIME ZONE, "deleted_at" TIMESTAMP WITH TIME ZONE, "change_summary" jsonb, "content_hash" bytea, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "canonical_id" uuid NOT NULL, "supersedes_id" uuid, "version" integer NOT NULL DEFAULT '1', "branch_id" uuid, CONSTRAINT "PK_e858a7876b4b8a382c481bded76" PRIMARY KEY ("id"))`
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
      `CREATE TABLE "kb"."graph_objects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid NOT NULL, "project_id" uuid NOT NULL, "type" text NOT NULL, "key" text NOT NULL, "status" text, "version" integer NOT NULL DEFAULT '1', "supersedes_id" uuid, "canonical_id" uuid NOT NULL, "properties" jsonb NOT NULL DEFAULT '{}', "labels" text array NOT NULL DEFAULT '{}', "deleted_at" TIMESTAMP WITH TIME ZONE, "change_summary" jsonb, "content_hash" bytea, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "branch_id" uuid, "fts" tsvector, "embedding" bytea, "embedding_updated_at" TIMESTAMP WITH TIME ZONE, "embedding_vec" vector(32), "extraction_job_id" uuid, "extraction_confidence" real, "needs_review" boolean DEFAULT false, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "embedding_v1" vector(1536), CONSTRAINT "PK_078aacf1069493166009e2f1f5d" PRIMARY KEY ("id"))`
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
      `CREATE TABLE "kb"."graph_embedding_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "object_id" uuid NOT NULL, "status" text NOT NULL, "attempt_count" integer NOT NULL DEFAULT '0', "last_error" text, "priority" integer NOT NULL DEFAULT '0', "scheduled_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_29374bc3691491e73c6170ff8e3" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f0021c2230e47af51928f35975" ON "kb"."graph_embedding_jobs" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_df895a2e1799c53ef660d0aae6" ON "kb"."graph_embedding_jobs" ("object_id") `
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."embedding_policies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "object_type" text NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "max_property_size" integer, "required_labels" text array NOT NULL DEFAULT '{}', "excluded_labels" text array NOT NULL DEFAULT '{}', "relevant_paths" text array NOT NULL DEFAULT '{}', "excluded_statuses" text array NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_923c15ce099ae3991a1d1a6b6b0" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_26573c7e713682c72216747770" ON "kb"."embedding_policies" ("project_id", "object_type") `
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."clickup_sync_state" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_id" uuid NOT NULL, "last_sync_at" TIMESTAMP WITH TIME ZONE, "last_successful_sync_at" TIMESTAMP WITH TIME ZONE, "sync_status" text, "last_error" text, "documents_imported" integer NOT NULL DEFAULT '0', "spaces_synced" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9693cb36fc36f7f3f36d8ff53b0" UNIQUE ("integration_id"), CONSTRAINT "PK_623fe43bafbc630a829e51c0024" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."clickup_import_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_id" uuid NOT NULL, "import_session_id" text NOT NULL, "logged_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "step_index" integer NOT NULL, "operation_type" text NOT NULL, "operation_name" text, "status" text NOT NULL, "input_data" jsonb, "output_data" jsonb, "error_message" text, "error_stack" text, "duration_ms" integer, "items_processed" integer, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_13e7092bd89052a1db253d0a6af" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."chat_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" text NOT NULL, "owner_user_id" uuid, "is_private" boolean NOT NULL DEFAULT true, "organization_id" uuid, "project_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ff117d9f57807c4f2e3034a39f3" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "role" text NOT NULL, "content" text NOT NULL, "citations" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."branches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" uuid, "project_id" uuid, "name" text NOT NULL, "parent_branch_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7f37d3b42defea97f1df0d19535" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."branch_lineage" ("branch_id" uuid NOT NULL, "ancestor_branch_id" uuid NOT NULL, "depth" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1f87552be159d70c1e49bc394d4" PRIMARY KEY ("branch_id", "ancestor_branch_id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."auth_introspection_cache" ("token_hash" character varying(128) NOT NULL, "introspection_data" jsonb NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_95b04c40e975a4b426cd21a07f5" PRIMARY KEY ("token_hash"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d05c07bafeabc0850f94db035b" ON "kb"."auth_introspection_cache" ("expires_at") `
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "event_type" text NOT NULL, "outcome" text NOT NULL, "user_id" uuid, "user_email" text, "resource_type" text, "resource_id" text, "action" text NOT NULL, "endpoint" text NOT NULL, "http_method" text NOT NULL, "status_code" integer, "error_code" text, "error_message" text, "ip_address" text, "user_agent" text, "request_id" text, "details" jsonb, CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."graph_template_packs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "version" text NOT NULL, "description" text, "author" text, "license" text, "repository_url" text, "documentation_url" text, "source" text DEFAULT 'manual', "discovery_job_id" uuid, "pending_review" boolean NOT NULL DEFAULT false, "object_type_schemas" jsonb NOT NULL, "relationship_type_schemas" jsonb NOT NULL DEFAULT '{}', "ui_configs" jsonb NOT NULL DEFAULT '{}', "extraction_prompts" jsonb NOT NULL DEFAULT '{}', "sql_views" jsonb NOT NULL DEFAULT '[]', "signature" text, "checksum" text, "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deprecated_at" TIMESTAMP WITH TIME ZONE, "superseded_by" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5bdff6c04be4775e82f1cef130b" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "kb"."project_template_packs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "template_pack_id" uuid NOT NULL, "installed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "installed_by" uuid, "active" boolean NOT NULL DEFAULT true, "customizations" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c3edf237839b7a0dd374437a670" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `ALTER TABLE "core"."user_emails" ADD CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_object_type_registry" ADD CONSTRAINT "FK_b8a4633d03d7ce7bc67701f8efb" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_memberships" ADD CONSTRAINT "FK_7cb6c36ad5bf1bd4a413823acec" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_memberships" ADD CONSTRAINT "FK_38a73cbcc58fbed8e62a66d79b8" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."organization_memberships" ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."organization_memberships" ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY ("organization_id") REFERENCES "kb"."orgs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chunks" ADD CONSTRAINT "FK_d841de45a719fe1f35213d79207" FOREIGN KEY ("document_id") REFERENCES "kb"."documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "FK_543b356bd6204a84bc8c038d309" FOREIGN KEY ("document_id") REFERENCES "kb"."documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "core"."user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" ADD CONSTRAINT "FK_14ad2d35eccbe22a4bc61a9a065" FOREIGN KEY ("owner_user_id") REFERENCES "core"."user_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_messages" ADD CONSTRAINT "FK_3d623662d4ee1219b23cf61e649" FOREIGN KEY ("conversation_id") REFERENCES "kb"."chat_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_template_packs" ADD CONSTRAINT "FK_440cc8aae6f630830193b703f54" FOREIGN KEY ("template_pack_id") REFERENCES "kb"."graph_template_packs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."project_template_packs" DROP CONSTRAINT "FK_440cc8aae6f630830193b703f54"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_messages" DROP CONSTRAINT "FK_3d623662d4ee1219b23cf61e649"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" DROP CONSTRAINT "FK_14ad2d35eccbe22a4bc61a9a065"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "FK_543b356bd6204a84bc8c038d309"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chunks" DROP CONSTRAINT "FK_d841de45a719fe1f35213d79207"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."organization_memberships" DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."organization_memberships" DROP CONSTRAINT "FK_5352fc550034d507d6c76dd2901"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_memberships" DROP CONSTRAINT "FK_38a73cbcc58fbed8e62a66d79b8"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_memberships" DROP CONSTRAINT "FK_7cb6c36ad5bf1bd4a413823acec"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_object_type_registry" DROP CONSTRAINT "FK_b8a4633d03d7ce7bc67701f8efb"`
    );
    await queryRunner.query(
      `ALTER TABLE "core"."user_emails" DROP CONSTRAINT "FK_2e88b95787b903d46ab3cc3eb91"`
    );
    await queryRunner.query(`DROP TABLE "kb"."project_template_packs"`);
    await queryRunner.query(`DROP TABLE "kb"."graph_template_packs"`);
    await queryRunner.query(`DROP TABLE "kb"."audit_log"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_d05c07bafeabc0850f94db035b"`);
    await queryRunner.query(`DROP TABLE "kb"."auth_introspection_cache"`);
    await queryRunner.query(`DROP TABLE "kb"."branch_lineage"`);
    await queryRunner.query(`DROP TABLE "kb"."branches"`);
    await queryRunner.query(`DROP TABLE "kb"."chat_messages"`);
    await queryRunner.query(`DROP TABLE "kb"."chat_conversations"`);
    await queryRunner.query(`DROP TABLE "kb"."clickup_import_logs"`);
    await queryRunner.query(`DROP TABLE "kb"."clickup_sync_state"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_26573c7e713682c72216747770"`);
    await queryRunner.query(`DROP TABLE "kb"."embedding_policies"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_df895a2e1799c53ef660d0aae6"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_f0021c2230e47af51928f35975"`);
    await queryRunner.query(`DROP TABLE "kb"."graph_embedding_jobs"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_d2e1c350bb54247677a298ec6f"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_c04db004625a1c8be8abb6c046"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_b8c7752534a444c2f16ebf3d91"`);
    await queryRunner.query(`DROP TABLE "kb"."graph_objects"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_a970f04cced6336cb2b1ad1f4e"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_f8d6b0b40d75cdabb27cf81084"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_f35de415032037ea629b1772e4"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_2927d35a99e3f8b3d443496525"`);
    await queryRunner.query(`DROP TABLE "kb"."graph_relationships"`);
    await queryRunner.query(`DROP TABLE "kb"."integrations"`);
    await queryRunner.query(`DROP TABLE "kb"."invites"`);
    await queryRunner.query(`DROP TABLE "kb"."llm_call_logs"`);
    await queryRunner.query(`DROP TABLE "kb"."merge_provenance"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_9a8a82462cab47c73d25f49261"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_cb7b1fb018b296f2107e998b2f"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_95464140d7dc04d7efb0afd6be"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_f8b7ed75170d2d7dca4477cc94"`);
    await queryRunner.query(`DROP TABLE "kb"."notifications"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_3844c9efd6d2e06105a117f90c"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_1c7f91f13d7e1a438519d37ec3"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_587ec50ea3409700ba7299c3b0"`);
    await queryRunner.query(`DROP TABLE "kb"."object_extraction_jobs"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_a62c6bec50c07764e19636a5a4"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_69427761f37533ae7767601a64"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_e156b298c20873e14c362e789b"`);
    await queryRunner.query(`DROP TABLE "kb"."documents"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_6f5a7e4467cdc44037f209122e"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_d841de45a719fe1f35213d7920"`);
    await queryRunner.query(`DROP TABLE "kb"."chunks"`);
    await queryRunner.query(`DROP TABLE "kb"."object_extraction_logs"`);
    await queryRunner.query(`DROP TABLE "kb"."object_type_schemas"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_5352fc550034d507d6c76dd290"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_86ae2efbb9ce84dd652e0c96a4"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_caa73db1b161fa6b3a042290fe"`);
    await queryRunner.query(`DROP TABLE "kb"."organization_memberships"`);
    await queryRunner.query(`DROP TABLE "kb"."orgs"`);
    await queryRunner.query(`DROP TABLE "kb"."product_version_members"`);
    await queryRunner.query(`DROP TABLE "kb"."product_versions"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_7cb6c36ad5bf1bd4a413823ace"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_38a73cbcc58fbed8e62a66d79b"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_b877acbf8d466f2889a2eeb147"`);
    await queryRunner.query(`DROP TABLE "kb"."project_memberships"`);
    await queryRunner.query(`DROP TABLE "kb"."project_object_type_registry"`);
    await queryRunner.query(`DROP TABLE "kb"."projects"`);
    await queryRunner.query(`DROP TABLE "kb"."settings"`);
    await queryRunner.query(`DROP TABLE "kb"."system_process_logs"`);
    await queryRunner.query(`DROP TABLE "kb"."tags"`);
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

    // Drop schemas
    await queryRunner.query(`DROP SCHEMA IF EXISTS "kb" CASCADE`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "core" CASCADE`);
  }
}
