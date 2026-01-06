import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentStorageColumns1767191000000
  implements MigrationInterface
{
  name = 'AddDocumentStorageColumns1767191000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add storage-related columns to documents table
    await queryRunner.query(`
      ALTER TABLE kb.documents
      ADD COLUMN IF NOT EXISTS storage_key TEXT,
      ADD COLUMN IF NOT EXISTS storage_url TEXT,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'
    `);

    // Index for storage_key lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_storage_key
      ON kb.documents (storage_key)
      WHERE storage_key IS NOT NULL
    `);

    // GIN index for metadata JSONB queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_metadata
      ON kb.documents USING GIN (metadata)
      WHERE metadata IS NOT NULL AND metadata != '{}'
    `);

    // Add comments for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.storage_key IS 'S3/MinIO storage key for the original file: {project_id}/{org_id}/{uuid}-{filename}'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.storage_url IS 'Public or signed URL for accessing the document (may be temporary)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.metadata IS 'Document metadata from parsing: page count, word count, language, etc.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_metadata;
      DROP INDEX IF EXISTS kb.idx_documents_storage_key;
    `);

    await queryRunner.query(`
      ALTER TABLE kb.documents
      DROP COLUMN IF EXISTS storage_key,
      DROP COLUMN IF EXISTS storage_url,
      DROP COLUMN IF EXISTS metadata
    `);
  }
}
