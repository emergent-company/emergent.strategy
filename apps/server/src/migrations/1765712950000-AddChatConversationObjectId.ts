import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add object_id to chat_conversations for object-scoped chats
 *
 * This supports the object refinement feature where users can have
 * conversations about specific graph objects. The conversation is
 * shared among all project users.
 *
 * Changes:
 * 1. Add nullable object_id column to chat_conversations
 * 2. Add unique partial index for one conversation per object
 */
export class AddChatConversationObjectId1765712950000
  implements MigrationInterface
{
  name = 'AddChatConversationObjectId1765712950000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add object_id column
    await queryRunner.query(`
      ALTER TABLE kb.chat_conversations
      ADD COLUMN object_id UUID REFERENCES kb.graph_objects(id) ON DELETE CASCADE
    `);

    // 2. Create unique partial index for one conversation per object
    // This ensures each object has at most one refinement conversation
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_chat_conversations_object_id_unique"
      ON kb.chat_conversations(object_id)
      WHERE object_id IS NOT NULL
    `);

    // 3. Add regular index for lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_conversations_object_id"
      ON kb.chat_conversations(object_id)
      WHERE object_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_chat_conversations_object_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_chat_conversations_object_id_unique"
    `);

    // Drop the column
    await queryRunner.query(`
      ALTER TABLE kb.chat_conversations
      DROP COLUMN IF EXISTS object_id
    `);
  }
}
