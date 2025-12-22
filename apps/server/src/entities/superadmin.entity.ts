import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

/**
 * Superadmin Entity
 *
 * Represents a system-wide superadmin grant. Superadmins have access to all
 * organizations and projects, can view-as any user, and access the superadmin
 * dashboard.
 *
 * Key design decisions:
 * - Separate table (not a flag) for audit trail and future extensions
 * - Soft revocation via revoked_at (preserves history)
 * - Self-grant via API is blocked; requires DB/CLI access
 */
@Entity({ schema: 'core', name: 'superadmins' })
@Index(['userId'], { where: '"revoked_at" IS NULL' })
export class Superadmin {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserProfile;

  @Column({ name: 'granted_by', type: 'uuid', nullable: true })
  grantedBy: string | null;

  @ManyToOne(() => UserProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'granted_by' })
  grantedByUser: UserProfile | null;

  @Column({ name: 'granted_at', type: 'timestamptz', default: () => 'now()' })
  grantedAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy: string | null;

  @ManyToOne(() => UserProfile, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'revoked_by' })
  revokedByUser: UserProfile | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /**
   * Helper to check if superadmin grant is currently active
   */
  get isActive(): boolean {
    return this.revokedAt === null;
  }
}
