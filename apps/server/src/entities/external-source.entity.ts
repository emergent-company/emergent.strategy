import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import type { Project } from './project.entity';
import type { Document } from './document.entity';

/**
 * Type of external source provider
 */
export type ExternalSourceType =
  | 'google_drive'
  | 'dropbox'
  | 'url'
  | 'onedrive'
  | 's3'
  | 'notion'
  | 'external';

/**
 * Sync policy for external sources
 */
export type SyncPolicy = 'manual' | 'on_access' | 'periodic' | 'webhook';

/**
 * Status of an external source
 */
export type ExternalSourceStatus = 'active' | 'error' | 'disabled';

/**
 * ExternalSource entity - tracks external document sources
 *
 * Represents the canonical external reference (e.g., a Google Drive file)
 * and manages sync state, error tracking, and provider-specific metadata.
 *
 * Relationships:
 * - Many-to-One with Project (belongs to a project)
 * - One-to-Many with Document (can have multiple document versions from syncs)
 */
@Entity({ schema: 'kb', name: 'external_sources' })
@Index(['projectId', 'providerType', 'externalId'], { unique: true })
@Index(['status', 'syncPolicy', 'lastCheckedAt'])
@Index(['projectId', 'normalizedUrl'])
export class ExternalSource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'provider_type', type: 'text' })
  providerType!: ExternalSourceType;

  @Column({ name: 'external_id', type: 'text' })
  externalId!: string;

  @Column({ name: 'original_url', type: 'text' })
  originalUrl!: string;

  @Column({ name: 'normalized_url', type: 'text' })
  normalizedUrl!: string;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName!: string | null;

  @Column({ name: 'mime_type', type: 'text', nullable: true })
  mimeType!: string | null;

  @Column({ name: 'sync_policy', type: 'text', default: 'manual' })
  syncPolicy!: SyncPolicy;

  @Column({ name: 'sync_interval_minutes', type: 'int', nullable: true })
  syncIntervalMinutes!: number | null;

  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt!: Date | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ name: 'last_etag', type: 'text', nullable: true })
  lastEtag!: string | null;

  @Column({ name: 'status', type: 'text', default: 'active' })
  status!: ExternalSourceStatus;

  @Column({ name: 'error_count', type: 'int', default: 0 })
  errorCount!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true })
  lastErrorAt!: Date | null;

  @Column({ name: 'provider_metadata', type: 'jsonb', nullable: true })
  providerMetadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @ManyToOne('Project', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @OneToMany('Document', 'externalSource')
  documents!: Document[];
}
