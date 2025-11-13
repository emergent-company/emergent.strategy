import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectIdForeignKeys1762883806000
  implements MigrationInterface
{
  name = 'AddProjectIdForeignKeys1762883806000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add foreign key constraints for project_id columns that reference kb.projects

    // 1. branches.project_id
    await queryRunner.query(
      `ALTER TABLE kb.branches ADD CONSTRAINT "FK_branches_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 2. chat_conversations.project_id
    await queryRunner.query(
      `ALTER TABLE kb.chat_conversations ADD CONSTRAINT "FK_chat_conversations_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE SET NULL`
    );

    // 3. documents.project_id
    await queryRunner.query(
      `ALTER TABLE kb.documents ADD CONSTRAINT "FK_documents_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 4. embedding_policies.project_id
    await queryRunner.query(
      `ALTER TABLE kb.embedding_policies ADD CONSTRAINT "FK_embedding_policies_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 5. graph_objects.project_id
    await queryRunner.query(
      `ALTER TABLE kb.graph_objects ADD CONSTRAINT "FK_graph_objects_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 6. graph_relationships.project_id
    await queryRunner.query(
      `ALTER TABLE kb.graph_relationships ADD CONSTRAINT "FK_graph_relationships_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 7. integrations.project_id
    await queryRunner.query(
      `ALTER TABLE kb.integrations ADD CONSTRAINT "FK_integrations_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 8. invites.project_id
    await queryRunner.query(
      `ALTER TABLE kb.invites ADD CONSTRAINT "FK_invites_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 9. notifications.project_id
    await queryRunner.query(
      `ALTER TABLE kb.notifications ADD CONSTRAINT "FK_notifications_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 10. object_extraction_jobs.project_id
    await queryRunner.query(
      `ALTER TABLE kb.object_extraction_jobs ADD CONSTRAINT "FK_object_extraction_jobs_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 11. object_type_schemas.project_id
    await queryRunner.query(
      `ALTER TABLE kb.object_type_schemas ADD CONSTRAINT "FK_object_type_schemas_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 12. product_versions.project_id
    await queryRunner.query(
      `ALTER TABLE kb.product_versions ADD CONSTRAINT "FK_product_versions_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 13. project_template_packs.project_id
    await queryRunner.query(
      `ALTER TABLE kb.project_template_packs ADD CONSTRAINT "FK_project_template_packs_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );

    // 14. tags.project_id
    await queryRunner.query(
      `ALTER TABLE kb.tags ADD CONSTRAINT "FK_tags_project_id" FOREIGN KEY (project_id) REFERENCES kb.projects(id) ON DELETE CASCADE`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints in reverse order
    await queryRunner.query(
      `ALTER TABLE kb.tags DROP CONSTRAINT "FK_tags_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.project_template_packs DROP CONSTRAINT "FK_project_template_packs_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.product_versions DROP CONSTRAINT "FK_product_versions_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.object_type_schemas DROP CONSTRAINT "FK_object_type_schemas_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.object_extraction_jobs DROP CONSTRAINT "FK_object_extraction_jobs_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.notifications DROP CONSTRAINT "FK_notifications_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.invites DROP CONSTRAINT "FK_invites_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.integrations DROP CONSTRAINT "FK_integrations_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.graph_relationships DROP CONSTRAINT "FK_graph_relationships_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.graph_objects DROP CONSTRAINT "FK_graph_objects_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.embedding_policies DROP CONSTRAINT "FK_embedding_policies_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.documents DROP CONSTRAINT "FK_documents_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.chat_conversations DROP CONSTRAINT "FK_chat_conversations_project_id"`
    );
    await queryRunner.query(
      `ALTER TABLE kb.branches DROP CONSTRAINT "FK_branches_project_id"`
    );
  }
}
