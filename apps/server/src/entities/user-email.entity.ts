import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { UserProfile } from './user-profile.entity';

@Entity({ schema: 'core', name: 'user_emails' })
@Index(['userId'])
@Index(['email'], { unique: true })
export class UserEmail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'boolean', default: false })
  verified: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne('UserProfile', 'emails', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserProfile;
}
