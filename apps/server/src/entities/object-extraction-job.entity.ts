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
import { Document } from './document.entity';
import { Project } from './project.entity';

@Entity({ schema: 'kb', name: 'object_extraction_jobs' })
@Index(['status'])
@Index(['projectId'])
export class ObjectExtractionJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId!: string | null;

  @Column({ name: 'chunk_id', type: 'uuid', nullable: true })
  chunkId!: string | null;

  @Column({ name: 'job_type', type: 'text', default: 'full_extraction' })
  jobType!: string;

  @Column({
    type: 'text',
    default: 'queued',
  })
  status!: string;

  @Column({ name: 'enabled_types', type: 'text', array: true, default: '{}' })
  enabledTypes!: string[];

  @Column({ name: 'extraction_config', type: 'jsonb', default: '{}' })
  extractionConfig!: Record<string, any>;

  @Column({ name: 'objects_created', type: 'int', default: 0 })
  objectsCreated!: number;

  @Column({ name: 'relationships_created', type: 'int', default: 0 })
  relationshipsCreated!: number;

  @Column({ name: 'suggestions_created', type: 'int', default: 0 })
  suggestionsCreated!: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries!: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'reprocessing_of', type: 'uuid', nullable: true })
  reprocessingOf!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'source_type', type: 'text', nullable: true })
  sourceType!: string | null;

  @Column({ name: 'source_id', type: 'text', nullable: true })
  sourceId!: string | null;

  @Column({ name: 'source_metadata', type: 'jsonb', default: '{}' })
  sourceMetadata!: Record<string, any>;

  @Column({ name: 'debug_info', type: 'jsonb', nullable: true })
  debugInfo!: Record<string, any> | null;

  @Column({ name: 'total_items', type: 'int', default: 0 })
  totalItems!: number;

  @Column({ name: 'processed_items', type: 'int', default: 0 })
  processedItems!: number;

  @Column({ name: 'successful_items', type: 'int', default: 0 })
  successfulItems!: number;

  @Column({ name: 'failed_items', type: 'int', default: 0 })
  failedItems!: number;

  @Column({ name: 'logs', type: 'jsonb', default: '[]' })
  logs!: any[];

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => Document, { nullable: true })
  @JoinColumn({ name: 'document_id' })
  document!: Document | null;
}
