import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Chunk } from './chunk.entity';

@Entity({ schema: 'kb', name: 'documents' })
@Index(['contentHash'], { unique: true, where: 'content_hash IS NOT NULL' })
@Index(['organizationId'])
@Index(['projectId'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => Chunk, (chunk) => chunk.document, { cascade: true })
  chunks!: Chunk[];
}
