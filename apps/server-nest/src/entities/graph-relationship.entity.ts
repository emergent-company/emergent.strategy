import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity({ schema: 'kb', name: 'graph_relationships' })
@Index(['srcId'])
@Index(['dstId'])
@Index(['type'])
@Index(['projectId'])
export class GraphRelationship {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ name: 'src_id', type: 'uuid' })
  srcId!: string;

  @Column({ name: 'dst_id', type: 'uuid' })
  dstId!: string;

  @Column({ type: 'jsonb', default: '{}' })
  properties!: Record<string, any>;

  @Column({ type: 'real', nullable: true })
  weight!: number | null;

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom!: Date | null;

  @Column({ name: 'valid_to', type: 'timestamptz', nullable: true })
  validTo!: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'change_summary', type: 'jsonb', nullable: true })
  changeSummary!: Record<string, any> | null;

  @Column({ name: 'content_hash', type: 'bytea', nullable: true })
  contentHash!: Buffer | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'canonical_id', type: 'uuid' })
  canonicalId!: string;

  @Column({ name: 'supersedes_id', type: 'uuid', nullable: true })
  supersedesId!: string | null;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
