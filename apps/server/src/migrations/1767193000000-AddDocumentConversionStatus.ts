import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds conversion status tracking to documents table.
 *
 * This enables the "document-first" architecture where:
 * 1. Documents are created immediately on upload (visible to users)
 * 2. Conversion (text extraction) is a separate, optional step
 * 3. Users can see conversion status, errors, and retry if needed
 *
 * Also adds file_hash for duplicate detection at upload time (before parsing).
 */
export class AddDocumentConversionStatus1767193000000
  implements MigrationInterface
{
  name = 'AddDocumentConversionStatus1767193000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add conversion status enum type
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE kb.document_conversion_status AS ENUM (
          'pending',      -- Awaiting conversion
          'processing',   -- Currently being converted
          'completed',    -- Successfully converted
          'failed',       -- Conversion failed (can retry)
          'not_required'  -- Plain text, no conversion needed
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Add conversion_status column
    await queryRunner.query(`
      ALTER TABLE kb.documents
      ADD COLUMN IF NOT EXISTS conversion_status kb.document_conversion_status DEFAULT 'not_required'
    `);

    // Add conversion_error column for human-friendly error messages
    await queryRunner.query(`
      ALTER TABLE kb.documents
      ADD COLUMN IF NOT EXISTS conversion_error TEXT
    `);

    // Add conversion_completed_at timestamp
    await queryRunner.query(`
      ALTER TABLE kb.documents
      ADD COLUMN IF NOT EXISTS conversion_completed_at TIMESTAMPTZ
    `);

    // Add file_hash for duplicate detection at upload time
    // This is the hash of the original file (not parsed content)
    await queryRunner.query(`
      ALTER TABLE kb.documents
      ADD COLUMN IF NOT EXISTS file_hash TEXT
    `);

    // Add index for file_hash duplicate detection (per project)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_project_file_hash 
      ON kb.documents (project_id, file_hash) 
      WHERE file_hash IS NOT NULL
    `);

    // Add index for conversion_status to efficiently query pending/failed conversions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_conversion_status 
      ON kb.documents (conversion_status) 
      WHERE conversion_status IN ('pending', 'failed')
    `);

    // Add comments for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.conversion_status IS 'Status of text extraction/conversion: pending, processing, completed, failed, not_required'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.conversion_error IS 'Human-friendly error message if conversion failed'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.conversion_completed_at IS 'Timestamp when conversion completed successfully'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.file_hash IS 'SHA256 hash of original file for duplicate detection at upload'
    `);

    // Update existing documents that have storage_key but no content
    // These were uploaded via the new flow and need conversion
    await queryRunner.query(`
      UPDATE kb.documents
      SET conversion_status = 'completed'
      WHERE storage_key IS NOT NULL
        AND content IS NOT NULL
        AND conversion_status = 'not_required'
    `);

    // Mark documents with storage_key but no content as needing review
    // (These might be from failed conversions)
    const pendingDocs = await queryRunner.query(`
      SELECT id, filename FROM kb.documents
      WHERE storage_key IS NOT NULL
        AND content IS NULL
    `);

    if (pendingDocs && pendingDocs.length > 0) {
      console.log(
        `Found ${pendingDocs.length} documents with storage but no content - marking as pending`
      );
      await queryRunner.query(`
        UPDATE kb.documents
        SET conversion_status = 'pending'
        WHERE storage_key IS NOT NULL
          AND content IS NULL
      `);
    }

    // Plain text documents that have content but no storage_key
    // are legacy documents - mark as not_required
    await queryRunner.query(`
      UPDATE kb.documents
      SET conversion_status = 'not_required'
      WHERE content IS NOT NULL
        AND storage_key IS NULL
        AND conversion_status = 'not_required'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_project_file_hash
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS kb.idx_documents_conversion_status
    `);

    // Remove columns
    await queryRunner.query(`
      ALTER TABLE kb.documents
      DROP COLUMN IF EXISTS conversion_status
    `);
    await queryRunner.query(`
      ALTER TABLE kb.documents
      DROP COLUMN IF EXISTS conversion_error
    `);
    await queryRunner.query(`
      ALTER TABLE kb.documents
      DROP COLUMN IF EXISTS conversion_completed_at
    `);
    await queryRunner.query(`
      ALTER TABLE kb.documents
      DROP COLUMN IF EXISTS file_hash
    `);

    // Drop enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS kb.document_conversion_status
    `);
  }
}
