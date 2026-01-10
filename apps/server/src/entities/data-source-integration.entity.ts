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
 * Sync mode for data source integrations
 */
export type DataSourceSyncMode = 'manual' | 'recurring';

/**
 * Status of a data source integration
 */
export type DataSourceIntegrationStatus = 'active' | 'error' | 'disabled';

/**
 * Well-known provider types for data source integrations.
 * This is not exhaustive - new providers can be added without schema changes.
 */
export const DATA_SOURCE_PROVIDER_TYPES = {
  IMAP: 'imap',
  GMAIL_API: 'gmail_api',
  OUTLOOK_API: 'outlook_api',
} as const;

/**
 * Well-known source types for documents.
 * This is not exhaustive - new source types can be added without schema changes.
 */
export const SOURCE_TYPES = {
  UPLOAD: 'upload',
  EMAIL: 'email',
  URL: 'url',
} as const;

/**
 * DataSourceIntegration Entity
 *
 * Generic integration entity for data sources that produce documents.
 * Supports multiple provider types (IMAP, Gmail API, etc.) without schema changes.
 *
 * Key concepts:
 * - `providerType`: The implementation (e.g., 'imap', 'gmail_api')
 * - `sourceType`: What kind of documents it produces (e.g., 'email')
 * - `name`: User-defined display name (e.g., "Work Gmail", "Personal Outlook")
 *
 * Multiple integrations can share the same source type:
 * - "Work Gmail" (provider: imap, source: email)
 * - "Personal Outlook" (provider: imap, source: email)
 *
 * @entity kb.data_source_integrations
 */
@Entity({ schema: 'kb', name: 'data_source_integrations' })
@Index(['projectId'])
@Index(['projectId', 'providerType'])
@Index(['projectId', 'sourceType'])
@Index(['status'])
@Index(['syncMode', 'status', 'lastSyncedAt'])
export class DataSourceIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /**
   * Provider type - the implementation (e.g., 'imap', 'gmail_api', 'outlook_api')
   */
  @Column({ name: 'provider_type', type: 'text' })
  providerType!: string;

  /**
   * Source type - what kind of documents this integration produces (e.g., 'email')
   */
  @Column({ name: 'source_type', type: 'text' })
  sourceType!: string;

  /**
   * User-defined display name (e.g., "Work Gmail", "Personal Outlook")
   */
  @Column({ type: 'text' })
  name!: string;

  /**
   * Optional description
   */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Encrypted configuration (AES-256-GCM)
   * Contains provider-specific config including credentials
   *
   * Example for IMAP:
   * {
   *   host: 'imap.gmail.com',
   *   port: 993,
   *   encryption: 'ssl',
   *   username: 'user@gmail.com',
   *   password: 'app-password',
   *   filters: {
   *     folders: ['INBOX'],
   *     from: [],
   *     to: [],
   *     subject: '',
   *     dateFrom: null,
   *     dateTo: null,
   *   }
   * }
   */
  @Column({ name: 'config_encrypted', type: 'text', nullable: true })
  configEncrypted!: string | null;

  /**
   * Sync mode: 'manual' or 'recurring'
   */
  @Column({ name: 'sync_mode', type: 'text', default: 'manual' })
  syncMode!: DataSourceSyncMode;

  /**
   * Sync interval in minutes (only used when sync_mode = 'recurring')
   * Common values: 15, 60, 360, 1440 (15min, 1hr, 6hr, 24hr)
   */
  @Column({ name: 'sync_interval_minutes', type: 'int', nullable: true })
  syncIntervalMinutes!: number | null;

  /**
   * Last successful sync timestamp
   */
  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  /**
   * Next scheduled sync timestamp (calculated from last_synced_at + sync_interval)
   */
  @Column({ name: 'next_sync_at', type: 'timestamptz', nullable: true })
  nextSyncAt!: Date | null;

  /**
   * Integration status
   */
  @Column({ type: 'text', default: 'active' })
  status!: DataSourceIntegrationStatus;

  /**
   * Error message if status = 'error'
   */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /**
   * Last error timestamp
   */
  @Column({ name: 'last_error_at', type: 'timestamptz', nullable: true })
  lastErrorAt!: Date | null;

  /**
   * Count of consecutive errors (for backoff)
   */
  @Column({ name: 'error_count', type: 'int', default: 0 })
  errorCount!: number;

  /**
   * Provider-specific metadata (non-sensitive, not encrypted)
   * Can be used to store sync state, cursor positions, etc.
   */
  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, any>;

  /**
   * User ID who created this integration
   */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @ManyToOne('Project', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @OneToMany('Document', 'dataSourceIntegration')
  documents!: Document[];
}
