import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

/**
 * Changelog structure stored as JSON in the database.
 */
export interface ChangelogJson {
  features: string[];
  fixes: string[];
  improvements: string[];
  truncated?: boolean;
  truncatedCount?: number;
}

export type ReleaseTargetMode = 'single' | 'project' | 'all';

export type ReleaseStatus = 'draft' | 'published';

@Entity({ schema: 'kb', name: 'release_notifications' })
export class ReleaseNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  version!: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: ReleaseStatus;

  @Column({ name: 'from_commit', type: 'varchar', length: 40 })
  fromCommit!: string;

  @Column({ name: 'to_commit', type: 'varchar', length: 40 })
  toCommit!: string;

  @Column({ name: 'commit_count', type: 'int' })
  commitCount!: number;

  @Column({ name: 'changelog_json', type: 'jsonb' })
  changelogJson!: ChangelogJson;

  @Column({ name: 'target_mode', type: 'varchar', length: 20 })
  targetMode!: ReleaseTargetMode;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  // Use string for lazy loading to avoid circular dependency
  @OneToMany('ReleaseNotificationRecipient', 'releaseNotification')
  recipients!: any[];
}
