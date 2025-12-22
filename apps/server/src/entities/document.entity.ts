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

/**
 * Source type for documents
 */
export type DocumentSourceType =
  | 'upload'
  | 'url'
  | 'google_drive'
  | 'dropbox'
  | 'external';

@Entity({ schema: 'kb', name: 'documents' })
@Index(['projectId', 'contentHash'], {
  unique: true,
  where: 'content_hash IS NOT NULL',
})
@Index(['projectId'])
@Index(['externalSourceId'])
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

  @Column({ name: 'sync_version', type: 'int', default: 1 })
  syncVersion!: number;

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
}
