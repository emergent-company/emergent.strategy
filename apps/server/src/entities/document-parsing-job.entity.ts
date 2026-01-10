import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import { Document } from './document.entity';
import type { ObjectExtractionJob } from './object-extraction-job.entity';

/**
 * Status values for document parsing jobs
 */
export type DocumentParsingJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retry_pending';

/**
 * Source type for document parsing jobs
 */
export type DocumentParsingJobSourceType =
  | 'upload'
  | 'url'
  | 'email_attachment'
  | 'drive';

/**
 * Document parsing job entity for tracking document extraction via Kreuzberg.
 * This handles parsing of PDFs, DOCX, images, and other complex document formats.
 */
@Entity({ schema: 'kb', name: 'document_parsing_jobs' })
@Index(['status', 'createdAt'])
@Index(['projectId'])
export class DocumentParsingJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: DocumentParsingJobStatus;

  @Column({ name: 'source_type', type: 'text' })
  sourceType!: DocumentParsingJobSourceType;

  @Column({ name: 'source_filename', type: 'text', nullable: true })
  sourceFilename!: string | null;

  @Column({ name: 'mime_type', type: 'text', nullable: true })
  mimeType!: string | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes!: number | null;

  @Column({ name: 'storage_key', type: 'text', nullable: true })
  storageKey!: string | null;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId!: string | null;

  @Column({ name: 'extraction_job_id', type: 'uuid', nullable: true })
  extractionJobId!: string | null;

  @Column({ name: 'parsed_content', type: 'text', nullable: true })
  parsedContent!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries!: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => Document, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'document_id' })
  document!: Document | null;

  @ManyToOne('ObjectExtractionJob', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'extraction_job_id' })
  extractionJob!: ObjectExtractionJob | null;
}
