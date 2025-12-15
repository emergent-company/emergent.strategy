import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add canonical_id to chat_conversations
 *
 * This fixes the issue where object refinement conversations are tied to
 * specific version IDs instead of canonical IDs. When an object is patched,
 * a new version is created with a new ID, but the conversation should persist
 * across versions.
 *
 * Changes:
 * 1. Add nullable canonical_id column to chat_conversations
 * 2. Migrate existing conversations to set canonical_id from their object's canonical_id
 * 3. Clean up duplicate conversations (keep the one with most messages, or latest)
 * 4. Create unique partial index on canonical_id (replaces object_id for uniqueness)
 * 5. Drop the old unique index on object_id (keep object_id column for reference)
 */
export class AddChatConversationCanonicalId1765712952000
  implements MigrationInterface
{
  name = 'AddChatConversationCanonicalId1765712952000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add canonical_id column for object refinement chats
    await queryRunner.query(`
      ALTER TABLE kb.chat_conversations
      ADD COLUMN IF NOT EXISTS canonical_id UUID
    `);

    // Migrate existing conversations: set canonical_id from the object's canonical_id
    await queryRunner.query(`
      UPDATE kb.chat_conversations c
      SET canonical_id = go.canonical_id
      FROM kb.graph_objects go
      WHERE c.object_id = go.id 
        AND c.object_id IS NOT NULL
        AND c.canonical_id IS NULL
    `);

    // Clean up duplicate conversations per canonical_id:
    // Keep the conversation with the most messages, or if tied, the most recent one.
    // Move messages from duplicate conversations to the keeper before deleting.
    await queryRunner.query(`
      WITH conversation_stats AS (
        SELECT 
          c.id,
          c.canonical_id,
          COUNT(m.id) as message_count,
          c.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY c.canonical_id 
            ORDER BY COUNT(m.id) DESC, c.created_at DESC
          ) as rn
        FROM kb.chat_conversations c
        LEFT JOIN kb.chat_messages m ON m.conversation_id = c.id
        WHERE c.canonical_id IS NOT NULL
        GROUP BY c.id, c.canonical_id, c.created_at
      ),
      keepers AS (
        SELECT id, canonical_id FROM conversation_stats WHERE rn = 1
      ),
      duplicates AS (
        SELECT cs.id as duplicate_id, k.id as keeper_id
        FROM conversation_stats cs
        JOIN keepers k ON cs.canonical_id = k.canonical_id
        WHERE cs.rn > 1
      )
      -- First, move messages from duplicates to keepers
      UPDATE kb.chat_messages m
      SET conversation_id = d.keeper_id
      FROM duplicates d
      WHERE m.conversation_id = d.duplicate_id
    `);

    // Now delete the empty duplicate conversations
    await queryRunner.query(`
      WITH conversation_stats AS (
        SELECT 
          c.id,
          c.canonical_id,
          COUNT(m.id) as message_count,
          c.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY c.canonical_id 
            ORDER BY COUNT(m.id) DESC, c.created_at DESC
          ) as rn
        FROM kb.chat_conversations c
        LEFT JOIN kb.chat_messages m ON m.conversation_id = c.id
        WHERE c.canonical_id IS NOT NULL
        GROUP BY c.id, c.canonical_id, c.created_at
      )
      DELETE FROM kb.chat_conversations
      WHERE id IN (SELECT id FROM conversation_stats WHERE rn > 1)
    `);

    // Drop the old unique index on object_id
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_chat_conversations_object_id"
    `);

    // Create new unique partial index on canonical_id
    // This ensures only one conversation per canonical object
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_conversations_canonical_id"
      ON kb.chat_conversations (canonical_id)
      WHERE canonical_id IS NOT NULL
    `);

    // Note: We don't add a foreign key constraint because canonical_id in graph_objects
    // is not unique (multiple versions share the same canonical_id). We rely on
    // application-level integrity and the ON DELETE CASCADE behavior is handled
    // by the graph service when deleting objects.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the unique index on canonical_id
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb."IDX_chat_conversations_canonical_id"
    `);

    // Recreate the old unique index on object_id
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_chat_conversations_object_id"
      ON kb.chat_conversations (object_id)
      WHERE object_id IS NOT NULL
    `);

    // Drop the canonical_id column
    await queryRunner.query(`
      ALTER TABLE kb.chat_conversations
      DROP COLUMN IF EXISTS canonical_id
    `);
  }
}
