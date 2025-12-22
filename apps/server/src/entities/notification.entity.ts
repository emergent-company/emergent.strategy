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
import { UserProfile } from './user-profile.entity';
import { Project } from './project.entity';
import { Task } from './task.entity';

@Entity({ schema: 'kb', name: 'notifications' })
@Index(['userId'])
@Index(['projectId'])
@Index(['read'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  type: string | null;

  @Column({ type: 'text', default: 'info' })
  severity: string;

  @Column({ name: 'related_resource_type', type: 'text', nullable: true })
  relatedResourceType: string | null;

  @Column({ name: 'related_resource_id', type: 'uuid', nullable: true })
  relatedResourceId: string | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: 'boolean', default: false })
  dismissed: boolean;

  @Column({ name: 'dismissed_at', type: 'timestamptz', nullable: true })
  dismissedAt: Date | null;

  @Column({ type: 'jsonb', default: [] })
  actions: any[];

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'text', default: 'other' })
  importance: string;

  @Column({ name: 'cleared_at', type: 'timestamptz', nullable: true })
  clearedAt: Date | null;

  @Column({ name: 'snoozed_until', type: 'timestamptz', nullable: true })
  snoozedUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  category: string | null;

  @Column({ name: 'source_type', type: 'text', nullable: true })
  sourceType: string | null;

  @Column({ name: 'source_id', type: 'text', nullable: true })
  sourceId: string | null;

  @Column({ name: 'action_url', type: 'text', nullable: true })
  actionUrl: string | null;

  @Column({ name: 'action_label', type: 'text', nullable: true })
  actionLabel: string | null;

  @Column({ name: 'group_key', type: 'text', nullable: true })
  groupKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any> | null;

  /**
   * Action status for actionable notifications (e.g., merge suggestions)
   * - 'pending': Action not yet taken (default for actionable notifications)
   * - 'accepted': User accepted/approved the action
   * - 'rejected': User rejected/dismissed the action
   * - null: Not an actionable notification
   */
  @Column({ name: 'action_status', type: 'text', nullable: true })
  actionStatus: 'pending' | 'accepted' | 'rejected' | null;

  @Column({ name: 'action_status_at', type: 'timestamptz', nullable: true })
  actionStatusAt: Date | null;

  @Column({ name: 'action_status_by', type: 'uuid', nullable: true })
  actionStatusBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserProfile;

  @ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  /**
   * Optional link to a task that this notification references.
   * When set, the notification serves as a personal alert about a project-scoped task.
   */
  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId: string | null;

  @ManyToOne(() => Task, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'task_id' })
  task: Task | null;
}
