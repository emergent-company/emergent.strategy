import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add unique index on email messageId for deduplication
 *
 * This enables:
 * 1. Database-level deduplication of emails by messageId
 * 2. Re-syncing deleted emails (if document is deleted, email can be re-imported)
 * 3. Efficient lookup by messageId during sync operations
 *
 * The index is partial - only applies to email documents with a messageId.
 */
export class AddEmailMessageIdUniqueIndex1767197000000
  implements MigrationInterface
{
  name = 'AddEmailMessageIdUniqueIndex1767197000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create unique index on (project_id, messageId) for email documents
    // This allows the same messageId to exist in different projects
    // and enables re-syncing if the document was deleted
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_documents_email_message_id
      ON kb.documents (project_id, (metadata->>'messageId'))
      WHERE source_type = 'email' AND metadata->>'messageId' IS NOT NULL
    `);

    // Also create a regular index for fast lookups by messageId alone
    // (useful for checking duplicates without full unique constraint)
    await queryRunner.query(`
      CREATE INDEX idx_documents_email_message_id_lookup
      ON kb.documents ((metadata->>'messageId'))
      WHERE source_type = 'email' AND metadata->>'messageId' IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_email_message_id_lookup
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_email_message_id
    `);
  }
}
