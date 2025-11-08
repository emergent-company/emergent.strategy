import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { UserProfile } from './user-profile.entity';
import { Org } from './org.entity';

@Entity({ schema: 'kb', name: 'organization_memberships' })
@Index(['userId'])
@Index(['organizationId'])
@Index(['organizationId', 'userId'], { unique: true })
export class OrganizationMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  role: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // Relations
  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserProfile;

  @ManyToOne(() => Org, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Org;
}
