import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity({ schema: 'kb', name: 'graph_objects' })
@Index(['projectId', 'branchId', 'type', 'key'], {
  unique: true,
  where: 'deleted_at IS NULL AND supersedes_id IS NULL AND key IS NOT NULL',
})
@Index(['canonicalId'])
@Index(['type'])
export class GraphObject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text', nullable: true })
  status!: string | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'supersedes_id', type: 'uuid', nullable: true })
  supersedesId!: string | null;

  @Column({ name: 'canonical_id', type: 'uuid' })
  canonicalId!: string;

  @Column({ type: 'jsonb', default: '{}' })
  properties!: Record<string, any>;

  @Column({ type: 'text', array: true, default: '{}' })
  labels!: string[];

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'change_summary', type: 'jsonb', nullable: true })
  changeSummary!: Record<string, any> | null;

  @Column({ name: 'content_hash', type: 'bytea', nullable: true })
  contentHash!: Buffer | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  @Column({ type: 'tsvector', nullable: true })
  fts!: any | null;

  @Column({ name: 'embedding_updated_at', type: 'timestamptz', nullable: true })
  embeddingUpdatedAt!: Date | null;

  /**
   * Active embedding column for vector similarity search.
   * Uses 768 dimensions to match Gemini text-embedding-004 model output.
   * Indexed with ivfflat for fast cosine similarity queries.
   */
  @Column({
    name: 'embedding_v2',
    type: 'vector',
    length: 768,
    nullable: true,
  })
  embeddingV2!: number[] | null;

  @Column({ name: 'extraction_job_id', type: 'uuid', nullable: true })
  extractionJobId!: string | null;

  @Column({ name: 'extraction_confidence', type: 'real', nullable: true })
  extractionConfidence!: number | null;

  @Column({
    name: 'needs_review',
    type: 'boolean',
    default: false,
    nullable: true,
  })
  needsReview!: boolean | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
