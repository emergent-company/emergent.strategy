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

export type TaskStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type TaskSourceType = 'agent' | 'user' | 'system';

/**
 * Task Entity
 *
 * Represents a project-scoped actionable item that requires user decision.
 * Unlike notifications (which are personal), tasks are shared across all project members.
 *
 * Examples:
 * - Merge suggestions from the duplicate detection agent
 * - Review requests
 * - Approval workflows
 */
@Entity({ schema: 'kb', name: 'tasks' })
@Index(['projectId', 'status'])
@Index(['type'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  // Content
  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  type: string; // 'merge_suggestion', 'review_request', etc.

  // Resolution
  @Column({ type: 'text', default: 'pending' })
  status: TaskStatus;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes: string | null;

  // Source tracking
  @Column({ name: 'source_type', type: 'text', nullable: true })
  sourceType: TaskSourceType | null;

  @Column({ name: 'source_id', type: 'text', nullable: true })
  sourceId: string | null;

  // Task-specific data
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  // Timestamps
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
