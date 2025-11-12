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

@Entity({ schema: 'kb', name: 'embedding_policies' })
@Index(['projectId', 'objectType'], { unique: true })
export class EmbeddingPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'object_type', type: 'text' })
  objectType: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'max_property_size', type: 'int', nullable: true })
  maxPropertySize: number | null;

  @Column({ name: 'required_labels', type: 'text', array: true, default: '{}' })
  requiredLabels: string[];

  @Column({ name: 'excluded_labels', type: 'text', array: true, default: '{}' })
  excludedLabels: string[];

  @Column({ name: 'relevant_paths', type: 'text', array: true, default: '{}' })
  relevantPaths: string[];

  @Column({
    name: 'excluded_statuses',
    type: 'text',
    array: true,
    default: '{}',
  })
  excludedStatuses: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
