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
import type { Project } from './project.entity';
import type { DataSourceIntegration } from './data-source-integration.entity';

/**
 * Status values for data source sync jobs
 */
export type DataSourceSyncJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Log entry for sync job progress
 */
export interface SyncJobLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: Record<string, any>;
}

/**
 * DataSourceSyncJob Entity
 *
 * Tracks async sync operations for data source integrations.
 * Provides progress tracking and detailed logs for user visibility.
 *
 * @entity kb.data_source_sync_jobs
 */
@Entity({ schema: 'kb', name: 'data_source_sync_jobs' })
@Index(['integrationId'])
@Index(['projectId'])
@Index(['status', 'createdAt'])
@Index(['integrationId', 'status'])
export class DataSourceSyncJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'integration_id', type: 'uuid' })
  integrationId!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /**
   * Current job status
   */
  @Column({ type: 'text', default: 'pending' })
  status!: DataSourceSyncJobStatus;

  /**
   * Total items to sync (set after discovery phase)
   */
  @Column({ name: 'total_items', type: 'int', default: 0 })
  totalItems!: number;

  /**
   * Items processed so far
   */
  @Column({ name: 'processed_items', type: 'int', default: 0 })
  processedItems!: number;

  /**
   * Items successfully imported
   */
  @Column({ name: 'successful_items', type: 'int', default: 0 })
  successfulItems!: number;

  /**
   * Items that failed to import
   */
  @Column({ name: 'failed_items', type: 'int', default: 0 })
  failedItems!: number;

  /**
   * Items skipped (already imported)
   */
  @Column({ name: 'skipped_items', type: 'int', default: 0 })
  skippedItems!: number;

  /**
   * Current phase of sync operation
   */
  @Column({ name: 'current_phase', type: 'text', nullable: true })
  currentPhase!: string | null;

  /**
   * Human-readable status message
   */
  @Column({ name: 'status_message', type: 'text', nullable: true })
  statusMessage!: string | null;

  /**
   * Sync options that were used (limit, filters, etc.)
   */
  @Column({ name: 'sync_options', type: 'jsonb', default: '{}' })
  syncOptions!: Record<string, any>;

  /**
   * IDs of documents created during this sync
   */
  @Column({ name: 'document_ids', type: 'jsonb', default: '[]' })
  documentIds!: string[];

  /**
   * Detailed log entries for progress tracking
   */
  @Column({ type: 'jsonb', default: '[]' })
  logs!: SyncJobLogEntry[];

  /**
   * Error message if status = 'failed'
   */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /**
   * Detailed error info
   */
  @Column({ name: 'error_details', type: 'jsonb', nullable: true })
  errorDetails!: Record<string, any> | null;

  /**
   * User who triggered the sync
   */
  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy!: string | null;

  /**
   * Whether this was a manual or scheduled sync
   */
  @Column({ name: 'trigger_type', type: 'text', default: 'manual' })
  triggerType!: 'manual' | 'scheduled';

  /**
   * ID of the sync configuration used (from integration metadata.syncConfigurations)
   * Null if sync was triggered with inline options (not from a saved configuration)
   */
  @Column({ name: 'configuration_id', type: 'uuid', nullable: true })
  configurationId!: string | null;

  /**
   * Name of the configuration at the time of sync
   * Stored as snapshot so it remains accurate even if config is renamed/deleted
   */
  @Column({ name: 'configuration_name', type: 'text', nullable: true })
  configurationName!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Relations
  @ManyToOne('DataSourceIntegration', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'integration_id' })
  integration!: DataSourceIntegration;

  @ManyToOne('Project', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
