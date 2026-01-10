import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import type { Chunk } from './chunk.entity';
import type { ExternalSource } from './external-source.entity';
import type { DocumentArtifact } from './document-artifact.entity';
import type { DataSourceIntegration } from './data-source-integration.entity';

/**
 * Source type for documents.
 *
 * This is now a plain string to support plugin extensibility.
 * Well-known values are defined in SOURCE_TYPES constant.
 *
 * @deprecated Use SOURCE_TYPES constant for well-known values.
 *             This type is kept for backward compatibility.
 */
export type DocumentSourceType =
  | 'upload'
  | 'url'
  | 'google_drive'
  | 'dropbox'
  | 'external'
  | 'email'
  | string;

/**
 * Conversion status for documents.
 * Tracks the status of text extraction from the original file.
 */
export type DocumentConversionStatus =
  | 'pending' // Awaiting conversion
  | 'processing' // Currently being converted
  | 'completed' // Successfully converted
  | 'failed' // Conversion failed (can retry)
  | 'not_required'; // Plain text, no conversion needed

@Entity({ schema: 'kb', name: 'documents' })
@Index(['projectId', 'contentHash'], {
  unique: true,
  where: 'content_hash IS NOT NULL',
})
@Index(['projectId'])
@Index(['externalSourceId'])
@Index(['sourceType'])
@Index(['dataSourceIntegrationId'])
@Index(['parentDocumentId'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  filename: string | null;

  @Column({ name: 'mime_type', type: 'text', nullable: true })
  mimeType!: string | null;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ name: 'content_hash', type: 'text', nullable: true })
  contentHash!: string | null;

  @Column({ name: 'integration_metadata', type: 'jsonb', nullable: true })
  integrationMetadata!: Record<string, any> | null;

  @Column({ name: 'parent_document_id', type: 'uuid', nullable: true })
  parentDocumentId!: string | null;

  // External source fields
  @Column({ name: 'source_type', type: 'text', default: 'upload' })
  sourceType!: DocumentSourceType;

  @Column({ name: 'external_source_id', type: 'uuid', nullable: true })
  externalSourceId!: string | null;

  /**
   * Reference to the DataSourceIntegration that created this document.
   * Null for manually uploaded documents (source_type = 'upload').
   */
  @Column({ name: 'data_source_integration_id', type: 'uuid', nullable: true })
  dataSourceIntegrationId!: string | null;

  @Column({ name: 'sync_version', type: 'int', default: 1 })
  syncVersion!: number;

  // Storage fields for original document files
  @Column({ name: 'storage_key', type: 'text', nullable: true })
  storageKey!: string | null;

  @Column({ name: 'storage_url', type: 'text', nullable: true })
  storageUrl!: string | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes!: number | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  // Conversion status tracking (for text extraction from files)
  @Column({
    name: 'conversion_status',
    type: 'text',
    default: 'not_required',
  })
  conversionStatus!: DocumentConversionStatus;

  @Column({ name: 'conversion_error', type: 'text', nullable: true })
  conversionError!: string | null;

  @Column({
    name: 'conversion_completed_at',
    type: 'timestamptz',
    nullable: true,
  })
  conversionCompletedAt!: Date | null;

  // File hash for duplicate detection at upload time (before parsing)
  @Column({ name: 'file_hash', type: 'text', nullable: true })
  fileHash!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;

  @OneToMany('Chunk', 'document', { cascade: true })
  chunks!: Chunk[];

  @ManyToOne('ExternalSource', 'documents', {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'external_source_id' })
  externalSource!: ExternalSource | null;

  @ManyToOne('DataSourceIntegration', 'documents', {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'data_source_integration_id' })
  dataSourceIntegration!: DataSourceIntegration | null;

  /**
   * Self-reference for parent document (e.g., email → attachment)
   */
  @ManyToOne('Document', 'children', {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_document_id' })
  parentDocument!: Document | null;

  /**
   * Child documents (e.g., attachments for an email)
   */
  @OneToMany('Document', 'parentDocument')
  children!: Document[];

  @OneToMany('DocumentArtifact', 'document', { cascade: true })
  artifacts!: DocumentArtifact[];
}
