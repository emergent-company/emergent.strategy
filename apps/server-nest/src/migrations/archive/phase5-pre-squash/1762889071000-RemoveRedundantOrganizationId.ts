import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRedundantOrganizationId1762889071000
  implements MigrationInterface
{
  name = 'RemoveRedundantOrganizationId1762889071000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."tags" DROP CONSTRAINT "FK_tags_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."product_versions" DROP CONSTRAINT "FK_product_versions_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_type_schemas" DROP CONSTRAINT "FK_object_type_schemas_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."documents" DROP CONSTRAINT "FK_documents_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "FK_object_extraction_jobs_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" DROP CONSTRAINT "FK_notifications_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."invites" DROP CONSTRAINT "FK_invites_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."integrations" DROP CONSTRAINT "FK_integrations_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" DROP CONSTRAINT "FK_graph_relationships_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP CONSTRAINT "FK_graph_objects_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."embedding_policies" DROP CONSTRAINT "FK_embedding_policies_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" DROP CONSTRAINT "FK_chat_conversations_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."branches" DROP CONSTRAINT "FK_branches_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_template_packs" DROP CONSTRAINT "FK_project_template_packs_project_id"`
    );
    await queryRunner.query(`DROP INDEX "kb"."IDX_a62c6bec50c07764e19636a5a4"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_587ec50ea3409700ba7299c3b0"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_cb7b1fb018b296f2107e998b2f"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_2927d35a99e3f8b3d443496525"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_d2e1c350bb54247677a298ec6f"`);
    await queryRunner.query(
      `ALTER TABLE "kb"."tags" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."product_versions" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP COLUMN "organization_id"`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3bbf4ea30357bf556110f034d4" ON "kb"."documents" ("project_id", "content_hash") WHERE content_hash IS NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a0dadc1ffc4ee153226f786e99" ON "kb"."graph_relationships" ("project_id") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5cbe2822f76435535640d37da9" ON "kb"."graph_objects" ("project_id", "type", "key") WHERE deleted_at IS NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."tags" ADD CONSTRAINT "FK_7ab852bb0ada09a0fc3adb7e5de" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."product_versions" ADD CONSTRAINT "FK_befe8619b468202250e33d16bd0" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_type_schemas" ADD CONSTRAINT "FK_f9b1a295fa838a7b20d80f084bb" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."documents" ADD CONSTRAINT "FK_e156b298c20873e14c362e789bf" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "FK_1c7f91f13d7e1a438519d37ec3b" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" ADD CONSTRAINT "FK_95464140d7dc04d7efb0afd6be0" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."invites" ADD CONSTRAINT "FK_9a75a544ecb579c8203efab71d9" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."integrations" ADD CONSTRAINT "FK_12243f40cd3f2b20dd3009cca71" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" ADD CONSTRAINT "FK_a0dadc1ffc4ee153226f786e99a" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD CONSTRAINT "FK_ff6be6062964f2462ee8e8b2ac1" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."embedding_policies" ADD CONSTRAINT "FK_057b973371cc00d7df2e95a6d57" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" ADD CONSTRAINT "FK_e49dcd93d3f2653f21dff81e180" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."branches" ADD CONSTRAINT "FK_6dab82d7024195ac691c50f6942" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_template_packs" ADD CONSTRAINT "FK_359c704937c9f1857fd80898ef2" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "kb"."project_template_packs" DROP CONSTRAINT "FK_359c704937c9f1857fd80898ef2"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."branches" DROP CONSTRAINT "FK_6dab82d7024195ac691c50f6942"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" DROP CONSTRAINT "FK_e49dcd93d3f2653f21dff81e180"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."embedding_policies" DROP CONSTRAINT "FK_057b973371cc00d7df2e95a6d57"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" DROP CONSTRAINT "FK_ff6be6062964f2462ee8e8b2ac1"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" DROP CONSTRAINT "FK_a0dadc1ffc4ee153226f786e99a"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."integrations" DROP CONSTRAINT "FK_12243f40cd3f2b20dd3009cca71"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."invites" DROP CONSTRAINT "FK_9a75a544ecb579c8203efab71d9"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" DROP CONSTRAINT "FK_95464140d7dc04d7efb0afd6be0"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" DROP CONSTRAINT "FK_1c7f91f13d7e1a438519d37ec3b"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."documents" DROP CONSTRAINT "FK_e156b298c20873e14c362e789bf"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_type_schemas" DROP CONSTRAINT "FK_f9b1a295fa838a7b20d80f084bb"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."product_versions" DROP CONSTRAINT "FK_befe8619b468202250e33d16bd0"`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."tags" DROP CONSTRAINT "FK_7ab852bb0ada09a0fc3adb7e5de"`
    );
    await queryRunner.query(`DROP INDEX "kb"."IDX_5cbe2822f76435535640d37da9"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_a0dadc1ffc4ee153226f786e99"`);
    await queryRunner.query(`DROP INDEX "kb"."IDX_3bbf4ea30357bf556110f034d4"`);
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD "organization_id" uuid NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" ADD "organization_id" uuid NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" ADD "organization_id" uuid NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD "organization_id" uuid NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."product_versions" ADD "organization_id" uuid`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."tags" ADD "organization_id" uuid`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d2e1c350bb54247677a298ec6f" ON "kb"."graph_objects" ("organization_id", "project_id", "type", "key") WHERE (deleted_at IS NULL)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2927d35a99e3f8b3d443496525" ON "kb"."graph_relationships" ("organization_id", "project_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cb7b1fb018b296f2107e998b2f" ON "kb"."notifications" ("organization_id") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_587ec50ea3409700ba7299c3b0" ON "kb"."object_extraction_jobs" ("organization_id") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a62c6bec50c07764e19636a5a4" ON "kb"."documents" ("project_id", "content_hash") WHERE (content_hash IS NOT NULL)`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."project_template_packs" ADD CONSTRAINT "FK_project_template_packs_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."branches" ADD CONSTRAINT "FK_branches_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."chat_conversations" ADD CONSTRAINT "FK_chat_conversations_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."embedding_policies" ADD CONSTRAINT "FK_embedding_policies_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_objects" ADD CONSTRAINT "FK_graph_objects_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."graph_relationships" ADD CONSTRAINT "FK_graph_relationships_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."integrations" ADD CONSTRAINT "FK_integrations_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."invites" ADD CONSTRAINT "FK_invites_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."notifications" ADD CONSTRAINT "FK_notifications_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_extraction_jobs" ADD CONSTRAINT "FK_object_extraction_jobs_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."documents" ADD CONSTRAINT "FK_documents_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."object_type_schemas" ADD CONSTRAINT "FK_object_type_schemas_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."product_versions" ADD CONSTRAINT "FK_product_versions_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "kb"."tags" ADD CONSTRAINT "FK_tags_project_id" FOREIGN KEY ("project_id") REFERENCES "kb"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }
}
