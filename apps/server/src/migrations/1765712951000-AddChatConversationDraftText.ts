import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add draft_text to chat_conversations
 *
 * This supports saving unsent message drafts in conversations.
 * The draft is stored server-side so users can continue editing
 * across sessions or devices.
 *
 * Changes:
 * 1. Add nullable draft_text column to chat_conversations
 */
export class AddChatConversationDraftText1765712951000
  implements MigrationInterface
{
  name = 'AddChatConversationDraftText1765712951000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add draft_text column for storing unsent message drafts
    await queryRunner.query(`
      ALTER TABLE kb.chat_conversations
      ADD COLUMN IF NOT EXISTS draft_text TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the column
    await queryRunner.query(`
      ALTER TABLE kb.chat_conversations
      DROP COLUMN IF EXISTS draft_text
    `);
  }
}
