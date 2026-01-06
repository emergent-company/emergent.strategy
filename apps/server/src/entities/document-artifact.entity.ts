import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Document } from './document.entity';

/**
 * Types of artifacts that can be extracted from documents
 */
export type DocumentArtifactType =
  | 'table'
  | 'image'
  | 'chart'
  | 'figure'
  | 'equation';

/**
 * Document artifact entity for storing extracted content from documents.
 * This includes tables, images, charts, and other structured content
 * extracted during document parsing.
 */
@Entity({ schema: 'kb', name: 'document_artifacts' })
@Index(['documentId'])
@Index(['documentId', 'artifactType'])
export class DocumentArtifact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId!: string;

  @Column({ name: 'artifact_type', type: 'text' })
  artifactType!: DocumentArtifactType;

  @Column({ type: 'jsonb', nullable: true })
  content!: Record<string, any> | null;

  @Column({ name: 'storage_key', type: 'text', nullable: true })
  storageKey!: string | null;

  @Column({ name: 'position_in_document', type: 'int', nullable: true })
  positionInDocument!: number | null;

  @Column({ name: 'page_number', type: 'int', nullable: true })
  pageNumber!: number | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: Document;
}
