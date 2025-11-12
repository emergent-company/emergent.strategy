import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GraphTemplatePack } from './graph-template-pack.entity';
import { Project } from '../../../entities/project.entity';

/**
 * Project-specific template pack installation entity
 *
 * Represents the installation of a template pack in a specific project.
 * Tracks:
 * - Which template pack is installed
 * - Installation metadata (by whom, when)
 * - Active status
 * - Customizations (enabled/disabled types, schema overrides)
 *
 * Scoped to: Project (RLS enforced)
 */
@Entity({ schema: 'kb', name: 'project_template_packs' })
export class ProjectTemplatePack {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  project_id: string;

  @Column({ type: 'uuid' })
  template_pack_id: string;

  @ManyToOne(() => GraphTemplatePack)
  @JoinColumn({ name: 'template_pack_id' })
  template_pack?: GraphTemplatePack;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: Project;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  installed_at: Date;

  /**
   * User ID from core.user_profiles who installed the pack
   * May be null if user doesn't exist yet
   */
  @Column({ type: 'uuid', nullable: true })
  installed_by?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  /**
   * Installation customizations
   * - enabledTypes: Array of type names to install (whitelist)
   * - disabledTypes: Array of type names to skip (blacklist)
   * - schemaOverrides: Type-specific schema modifications
   */
  @Column({ type: 'jsonb', default: {} })
  customizations: {
    enabledTypes?: string[];
    disabledTypes?: string[];
    schemaOverrides?: Record<string, any>;
  };

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}
