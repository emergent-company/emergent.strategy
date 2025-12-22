import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { UserEmail } from './user-email.entity';

@Entity({ schema: 'core', name: 'user_profiles' })
@Index(['zitadelUserId'], { unique: true })
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'zitadel_user_id', type: 'text' })
  zitadelUserId: string;

  @Column({ name: 'first_name', type: 'text', nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'text', nullable: true })
  lastName: string | null;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName: string | null;

  @Column({ name: 'phone_e164', type: 'text', nullable: true })
  phoneE164: string | null;

  @Column({ name: 'avatar_object_key', type: 'text', nullable: true })
  avatarObjectKey: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({
    name: 'welcome_email_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  welcomeEmailSentAt: Date | null;

  /** Timestamp when profile was last synced from Zitadel */
  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  /** Timestamp of last authenticated API activity (debounced, ~60s granularity) */
  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  /** Soft delete timestamp (null = active, timestamp = deleted) */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** User who performed the deletion (for audit trail) */
  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

  @ManyToOne(() => UserProfile, { nullable: true })
  @JoinColumn({ name: 'deleted_by' })
  deletedByUser: UserProfile | null;

  @OneToMany('UserEmail', 'user')
  emails!: UserEmail[];
}
