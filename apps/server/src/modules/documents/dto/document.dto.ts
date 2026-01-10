import { ApiProperty } from '@nestjs/swagger';

export class DocumentDto {
  @ApiProperty({ example: 'doc_1' })
  id!: string;
  @ApiProperty({
    example: '11111111-2222-3333-4444-555555555555',
    required: false,
    nullable: true,
  })
  orgId?: string;
  @ApiProperty({
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    required: false,
    nullable: true,
  })
  projectId?: string;
  @ApiProperty({ example: 'Spec.md' })
  name!: string;
  @ApiProperty({
    required: false,
    nullable: true,
    example: 'https://example.com/file.pdf',
  })
  sourceUrl?: string | null;
  @ApiProperty({ required: false, nullable: true, example: 'text/markdown' })
  mimeType?: string | null;
  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt!: string;
  @ApiProperty({ example: '2025-01-01T00:05:00.000Z' })
  updatedAt!: string;
  @ApiProperty({
    required: false,
    nullable: true,
    example: '# Document Title\n\nDocument content here...',
    description: 'The full text content of the document',
  })
  content?: string | null;
  @ApiProperty({
    required: false,
    nullable: true,
    example: 7332286,
    description: 'The byte length of the content field',
  })
  contentLength?: number | null;
  @ApiProperty({
    example: 12,
    description: 'Number of chunks associated with this document',
  })
  chunks!: number;
  @ApiProperty({
    required: false,
    example: 15420,
    description: 'Total character count of all chunks in this document',
  })
  totalChars?: number;
  @ApiProperty({
    required: false,
    example: 10,
    description: 'Number of chunks that have embeddings generated',
  })
  embeddedChunks?: number;
  @ApiProperty({
    required: false,
    nullable: true,
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    description:
      'Parent document ID for hierarchical structures (e.g., ClickUp page hierarchy)',
  })
  parentDocumentId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 5,
    description:
      'Number of child documents (e.g., attachments for emails, files in a folder)',
  })
  childCount?: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: {
      source: 'clickup',
      doc_id: '4bj41-33735',
      workspace_id: '4573313',
    },
    description:
      'Integration-specific metadata (ClickUp IDs, creator info, etc.)',
  })
  integrationMetadata?: Record<string, any> | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: {
      originalFilename: 'document.pdf',
      originalMimeType: 'application/pdf',
      processingTimeMs: 1234,
    },
    description:
      'Document metadata (processing info, original file details, etc.)',
  })
  metadata?: Record<string, any> | null;
  @ApiProperty({
    required: false,
    nullable: true,
    example: 'completed',
    description:
      'Status of the most recent extraction job for this document (pending, running, completed, failed)',
    enum: ['pending', 'running', 'completed', 'failed'],
  })
  extractionStatus?: string;
  @ApiProperty({
    required: false,
    nullable: true,
    example: '2025-01-01T00:10:00.000Z',
    description: 'Timestamp when the most recent extraction job was completed',
  })
  extractionCompletedAt?: string;
  @ApiProperty({
    required: false,
    nullable: true,
    example: 15,
    description:
      'Number of objects extracted in the most recent extraction job',
  })
  extractionObjectsCount?: number;

  // Conversion status fields (for text extraction from uploaded files)
  @ApiProperty({
    required: false,
    nullable: true,
    example: 'completed',
    description:
      'Status of document conversion (text extraction): pending, processing, completed, failed, not_required',
    enum: ['pending', 'processing', 'completed', 'failed', 'not_required'],
  })
  conversionStatus?: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'The file format is not supported for text extraction',
    description:
      'Human-friendly error message explaining why conversion failed (only set when status is failed)',
  })
  conversionError?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: '2025-01-01T00:05:00.000Z',
    description: 'Timestamp when conversion was completed (success or failure)',
  })
  conversionCompletedAt?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'documents/abc123/original.pdf',
    description: 'Storage key for the original uploaded file in MinIO',
  })
  storageKey?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 1048576,
    description: 'Size of the original file in bytes',
  })
  fileSizeBytes?: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'upload',
    description:
      'Source type of the document: upload, url, google_drive, dropbox, external, email, or a custom type',
  })
  sourceType?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    description:
      'ID of the DataSourceIntegration that created this document (null for manual uploads)',
  })
  dataSourceIntegrationId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    description: 'ID of the external source this document was imported from',
  })
  externalSourceId?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 1,
    description: 'Sync version number for incremental sync support',
  })
  syncVersion?: number | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'https://storage.example.com/documents/abc123.pdf',
    description: 'Public or signed URL for accessing the stored file',
  })
  storageUrl?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'sha256:abc123def456...',
    description: 'Hash of the original uploaded file for deduplication',
  })
  fileHash?: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'sha256:abc123def456...',
    description: 'Hash of the extracted text content',
  })
  contentHash?: string | null;
}
