import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * Integration Entity
 *
 * Stores third-party integration configurations (ClickUp, Jira, etc.)
 * Settings are encrypted in the database using BYTEA column
 *
 * @entity kb.integrations
 */
@Entity({ schema: 'kb', name: 'integrations' })
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Integration type identifier (e.g., 'clickup', 'jira')
   * Unique per project
   */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /**
   * Human-readable display name
   */
  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  displayName!: string;

  /**
   * Optional description of the integration
   */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * Whether the integration is enabled
   */
  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  /**
   * Organization ID (tenant isolation)
   * Maps to org_id column in database
   */
  @Column({ type: 'text', name: 'org_id' })
  organizationId!: string;

  /**
   * Project this integration belongs to
   */
  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  /**
   * Encrypted settings (BYTEA column)
   * Contains auth tokens, API keys, configuration
   *
   * Note: This is stored as Buffer in TypeScript but read/written as base64 string
   * Use IntegrationsService methods to encrypt/decrypt properly
   */
  @Column({ type: 'bytea', nullable: true, name: 'settings_encrypted' })
  settingsEncrypted?: Buffer;

  /**
   * URL to integration logo image
   */
  @Column({ type: 'text', nullable: true, name: 'logo_url' })
  logoUrl?: string;

  /**
   * Secret for webhook signature validation
   */
  @Column({ type: 'text', nullable: true, name: 'webhook_secret' })
  webhookSecret?: string;

  /**
   * User ID who created this integration
   */
  @Column({ type: 'text', nullable: true, name: 'created_by' })
  createdBy?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
