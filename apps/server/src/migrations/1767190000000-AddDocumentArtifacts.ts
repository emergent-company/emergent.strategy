import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentArtifacts1767190000000 implements MigrationInterface {
  name = 'AddDocumentArtifacts1767190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create document_artifacts table for storing extracted content (tables, images, etc.)
    await queryRunner.query(`
      CREATE TABLE kb.document_artifacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES kb.documents(id) ON DELETE CASCADE,
        artifact_type TEXT NOT NULL,
        content JSONB,
        storage_key TEXT,
        position_in_document INT,
        page_number INT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Index for document lookups
    await queryRunner.query(`
      CREATE INDEX idx_document_artifacts_document
      ON kb.document_artifacts (document_id)
    `);

    // Index for artifact type queries
    await queryRunner.query(`
      CREATE INDEX idx_document_artifacts_type
      ON kb.document_artifacts (document_id, artifact_type)
    `);

    // Add comments for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN kb.document_artifacts.artifact_type IS 'Artifact type: table, image, chart, figure, equation'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.document_artifacts.content IS 'Structured content for the artifact (e.g., table data as JSON)'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN kb.document_artifacts.storage_key IS 'S3/MinIO storage key for binary artifacts (images)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS kb.document_artifacts`);
  }
}
