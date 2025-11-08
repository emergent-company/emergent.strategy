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

@Entity({ schema: 'kb', name: 'notifications' })
@Index(['userId'])
@Index(['organizationId'])
@Index(['projectId'])
@Index(['read'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserProfile;
}
