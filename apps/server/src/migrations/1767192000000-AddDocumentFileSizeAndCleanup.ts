import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentFileSizeAndCleanup1767192000000
  implements MigrationInterface
{
  name = 'AddDocumentFileSizeAndCleanup1767192000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add file_size_bytes column to documents table
    await queryRunner.query(`
      ALTER TABLE kb.documents
      ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT
    `);

    // Add comment for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN kb.documents.file_size_bytes IS 'Size of the original file in bytes'
    `);

    // Find documents to delete (content in DB but no storage_key)
    const docsToDelete = await queryRunner.query(`
      SELECT id, filename FROM kb.documents 
      WHERE content IS NOT NULL 
      AND storage_key IS NULL
    `);

    if (docsToDelete && docsToDelete.length > 0) {
      const docIds = docsToDelete.map((d: any) => d.id);
      const docIdList = docIds.map((id: string) => `'${id}'`).join(',');

      console.log(
        `Found ${docIds.length} documents to delete (content in DB, no storage_key)`
      );

      // First, clean up object_extraction_jobs that reference these documents
      await queryRunner.query(`
        UPDATE kb.object_extraction_jobs 
        SET document_id = NULL 
        WHERE document_id IN (${docIdList})
      `);

      // Clean up document parsing jobs that reference these documents
      await queryRunner.query(`
        UPDATE kb.document_parsing_jobs 
        SET document_id = NULL 
        WHERE document_id IN (${docIdList})
      `);

      // Now delete the documents (chunks will cascade delete)
      const result = await queryRunner.query(`
        DELETE FROM kb.documents 
        WHERE id IN (${docIdList})
        RETURNING id, filename
      `);

      console.log(
        `Deleted ${
          result?.length ?? 0
        } documents with content stored in DB (no storage_key)`
      );
    } else {
      console.log(
        'No documents to clean up (all have storage_key or no content)'
      );
    }

    // Also clean up any orphaned chunks that might remain
    await queryRunner.query(`
      DELETE FROM kb.chunks 
      WHERE document_id NOT IN (SELECT id FROM kb.documents)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove file_size_bytes column
    await queryRunner.query(`
      ALTER TABLE kb.documents
      DROP COLUMN IF EXISTS file_size_bytes
    `);

    // Note: Deleted documents cannot be restored
  }
}
