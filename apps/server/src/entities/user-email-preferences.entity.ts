import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

@Entity({ schema: 'core', name: 'user_email_preferences' })
@Index(['unsubscribeToken'], { unique: true })
export class UserEmailPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserProfile;

  @Column({ name: 'release_emails_enabled', type: 'boolean', default: true })
  releaseEmailsEnabled: boolean;

  @Column({ name: 'marketing_emails_enabled', type: 'boolean', default: true })
  marketingEmailsEnabled: boolean;

  @Column({ name: 'unsubscribe_token', type: 'varchar', length: 64 })
  unsubscribeToken: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
