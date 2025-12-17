import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

/**
 * Global template pack registry entity
 *
 * Represents a reusable template pack containing:
 * - Object type schemas (JSON Schema definitions)
 * - Relationship type schemas
 * - UI configurations
 * - Extraction prompts for LLM
 * - SQL views for analytics
 *
 * Template packs are GLOBAL resources shared across all organizations.
 * Use ProjectTemplatePack for project-specific installations.
 *
 * Version lineage is tracked via parent_version_id for template pack studio.
 */
@Entity({ schema: 'kb', name: 'graph_template_packs' })
export class GraphTemplatePack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  version: string;

  /**
   * Reference to the parent version for version lineage tracking.
   * Used by Template Pack Studio for version history.
   */
  @Column({ type: 'uuid', nullable: true })
  parent_version_id?: string;

  @ManyToOne(() => GraphTemplatePack, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_version_id' })
  parentVersion?: GraphTemplatePack;

  /**
   * Draft flag for work-in-progress packs.
   * Draft packs cannot be installed in projects until finalized.
   */
  @Column({ type: 'boolean', default: false })
  draft: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  author?: string;

  @Column({ type: 'text', nullable: true })
  license?: string;

  @Column({ type: 'text', nullable: true })
  repository_url?: string;

  @Column({ type: 'text', nullable: true })
  documentation_url?: string;

  @Column({
    type: 'text',
    nullable: true,
    default: 'manual',
  })
  source?: 'manual' | 'discovered' | 'imported' | 'system';

  @Column({ type: 'uuid', nullable: true })
  discovery_job_id?: string;

  @Column({ type: 'boolean', default: false })
  pending_review?: boolean;

  /**
   * JSON Schema definitions for object types
   * Key: type name, Value: JSON Schema object
   */
  @Column({ type: 'jsonb' })
  object_type_schemas: Record<string, any>;

  /**
   * Relationship type schemas
   * Key: relationship name, Value: schema definition
   */
  @Column({ type: 'jsonb', default: {} })
  relationship_type_schemas: Record<string, any>;

  /**
   * UI configuration per type
   * Key: type name, Value: UI config (icons, colors, display settings)
   */
  @Column({ type: 'jsonb', default: {} })
  ui_configs: Record<string, any>;

  /**
   * LLM extraction prompts per type
   * Key: type name, Value: extraction prompt configuration
   */
  @Column({ type: 'jsonb', default: {} })
  extraction_prompts: Record<string, any>;

  /**
   * SQL views for analytics/reporting
   * Array of SQL view definitions
   */
  @Column({ type: 'jsonb', default: [] })
  sql_views: any[];

  @Column({ type: 'text', nullable: true })
  signature?: string;

  @Column({ type: 'text', nullable: true })
  checksum?: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  published_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deprecated_at?: Date;

  @Column({ type: 'text', nullable: true })
  superseded_by?: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
