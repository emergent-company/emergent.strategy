import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMissingTables1762785009276 implements MigrationInterface {
    name = 'AddMissingTables1762785009276'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "kb"."IDX_documents_organization_id"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_documents_project_id"`);
        await queryRunner.query(`CREATE TABLE "kb"."system_process_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "process_id" text NOT NULL, "process_type" text NOT NULL, "level" text NOT NULL, "message" text NOT NULL, "metadata" jsonb, "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_734385c231b8c9ce4b9157913ae" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."project_object_type_registry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "type_name" text NOT NULL, "source" text NOT NULL, "template_pack_id" uuid, "schema_version" integer NOT NULL DEFAULT '1', "json_schema" jsonb NOT NULL, "ui_config" jsonb, "extraction_config" jsonb, "enabled" boolean NOT NULL DEFAULT true, "discovery_confidence" double precision, "description" text, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_734eabf182ef87e9b747c864d71" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."object_extraction_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "extraction_job_id" uuid NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completed_at" TIMESTAMP WITH TIME ZONE, "step_index" integer NOT NULL, "operation_type" text NOT NULL, "operation_name" text, "step" text NOT NULL, "status" text NOT NULL, "message" text, "input_data" jsonb, "output_data" jsonb, "error_message" text, "error_stack" text, "error_details" jsonb, "duration_ms" integer, "tokens_used" integer, "entity_count" integer, "relationship_count" integer, CONSTRAINT "PK_9ea0a4d02ba4f16f7f390589503" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."llm_call_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "process_id" text NOT NULL, "process_type" text NOT NULL, "model_name" text NOT NULL, "request_payload" jsonb, "response_payload" jsonb, "status" text NOT NULL, "error_message" text, "input_tokens" integer, "output_tokens" integer, "total_tokens" integer, "cost_usd" numeric(10,6), "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completed_at" TIMESTAMP WITH TIME ZONE, "duration_ms" integer, CONSTRAINT "PK_ad84866fef0164fcee07558a67d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "display_name" character varying(255) NOT NULL, "description" text, "enabled" boolean NOT NULL DEFAULT false, "org_id" text NOT NULL, "project_id" uuid NOT NULL, "settings_encrypted" bytea, "logo_url" text, "webhook_secret" text, "created_by" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9adcdc6d6f3922535361ce641e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."embedding_policies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "object_type" text NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "max_property_size" integer, "required_labels" text array NOT NULL DEFAULT '{}', "excluded_labels" text array NOT NULL DEFAULT '{}', "relevant_paths" text array NOT NULL DEFAULT '{}', "excluded_statuses" text array NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_923c15ce099ae3991a1d1a6b6b0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_26573c7e713682c72216747770" ON "kb"."embedding_policies" ("project_id", "object_type") `);
        await queryRunner.query(`CREATE TABLE "kb"."clickup_sync_state" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_id" uuid NOT NULL, "last_sync_at" TIMESTAMP WITH TIME ZONE, "last_successful_sync_at" TIMESTAMP WITH TIME ZONE, "sync_status" text, "last_error" text, "documents_imported" integer NOT NULL DEFAULT '0', "spaces_synced" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9693cb36fc36f7f3f36d8ff53b0" UNIQUE ("integration_id"), CONSTRAINT "PK_623fe43bafbc630a829e51c0024" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."clickup_import_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "integration_id" uuid NOT NULL, "import_session_id" text NOT NULL, "logged_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "step_index" integer NOT NULL, "operation_type" text NOT NULL, "operation_name" text, "status" text NOT NULL, "input_data" jsonb, "output_data" jsonb, "error_message" text, "error_stack" text, "duration_ms" integer, "items_processed" integer, "metadata" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_13e7092bd89052a1db253d0a6af" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "event_type" text NOT NULL, "outcome" text NOT NULL, "user_id" uuid, "user_email" text, "resource_type" text, "resource_id" text, "action" text NOT NULL, "endpoint" text NOT NULL, "http_method" text NOT NULL, "status_code" integer, "error_code" text, "error_message" text, "ip_address" text, "user_agent" text, "request_id" text, "details" jsonb, CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."graph_template_packs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "version" text NOT NULL, "description" text, "author" text, "license" text, "repository_url" text, "documentation_url" text, "source" text DEFAULT 'manual', "discovery_job_id" uuid, "pending_review" boolean NOT NULL DEFAULT false, "object_type_schemas" jsonb NOT NULL, "relationship_type_schemas" jsonb NOT NULL DEFAULT '{}', "ui_configs" jsonb NOT NULL DEFAULT '{}', "extraction_prompts" jsonb NOT NULL DEFAULT '{}', "sql_views" jsonb NOT NULL DEFAULT '[]', "signature" text, "checksum" text, "published_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deprecated_at" TIMESTAMP WITH TIME ZONE, "superseded_by" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5bdff6c04be4775e82f1cef130b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "kb"."project_template_packs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "project_id" uuid NOT NULL, "template_pack_id" uuid NOT NULL, "installed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "installed_by" uuid, "active" boolean NOT NULL DEFAULT true, "customizations" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c3edf237839b7a0dd374437a670" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "kb"."documents" ADD "parent_document_id" uuid`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" ADD "source_type" text`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" ADD "source_id" text`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" ADD "action_url" text`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" ADD "action_label" text`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" ADD "group_key" text`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" ADD "details" jsonb`);
        await queryRunner.query(`ALTER TABLE "kb"."graph_objects" DROP COLUMN "embedding_vec"`);
        await queryRunner.query(`ALTER TABLE "kb"."graph_objects" ADD "embedding_vec" vector(32)`);
        await queryRunner.query(`CREATE INDEX "IDX_e156b298c20873e14c362e789b" ON "kb"."documents" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_69427761f37533ae7767601a64" ON "kb"."documents" ("organization_id") `);
        await queryRunner.query(`ALTER TABLE "kb"."project_object_type_registry" ADD CONSTRAINT "FK_b8a4633d03d7ce7bc67701f8efb" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "kb"."project_template_packs" ADD CONSTRAINT "FK_440cc8aae6f630830193b703f54" FOREIGN KEY ("template_pack_id") REFERENCES "kb"."graph_template_packs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "kb"."project_template_packs" DROP CONSTRAINT "FK_440cc8aae6f630830193b703f54"`);
        await queryRunner.query(`ALTER TABLE "kb"."project_object_type_registry" DROP CONSTRAINT "FK_b8a4633d03d7ce7bc67701f8efb"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_69427761f37533ae7767601a64"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_e156b298c20873e14c362e789b"`);
        await queryRunner.query(`ALTER TABLE "kb"."graph_objects" DROP COLUMN "embedding_vec"`);
        await queryRunner.query(`ALTER TABLE "kb"."graph_objects" ADD "embedding_vec" vector(768)`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" DROP COLUMN "details"`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" DROP COLUMN "group_key"`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" DROP COLUMN "action_label"`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" DROP COLUMN "action_url"`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" DROP COLUMN "source_id"`);
        await queryRunner.query(`ALTER TABLE "kb"."notifications" DROP COLUMN "source_type"`);
        await queryRunner.query(`ALTER TABLE "kb"."documents" DROP COLUMN "parent_document_id"`);
        await queryRunner.query(`DROP TABLE "kb"."project_template_packs"`);
        await queryRunner.query(`DROP TABLE "kb"."graph_template_packs"`);
        await queryRunner.query(`DROP TABLE "kb"."audit_log"`);
        await queryRunner.query(`DROP TABLE "kb"."clickup_import_logs"`);
        await queryRunner.query(`DROP TABLE "kb"."clickup_sync_state"`);
        await queryRunner.query(`DROP INDEX "kb"."IDX_26573c7e713682c72216747770"`);
        await queryRunner.query(`DROP TABLE "kb"."embedding_policies"`);
        await queryRunner.query(`DROP TABLE "kb"."integrations"`);
        await queryRunner.query(`DROP TABLE "kb"."llm_call_logs"`);
        await queryRunner.query(`DROP TABLE "kb"."object_extraction_logs"`);
        await queryRunner.query(`DROP TABLE "kb"."project_object_type_registry"`);
        await queryRunner.query(`DROP TABLE "kb"."system_process_logs"`);
        await queryRunner.query(`CREATE INDEX "IDX_documents_project_id" ON "kb"."documents" ("project_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_documents_organization_id" ON "kb"."documents" ("organization_id") `);
    }

}
