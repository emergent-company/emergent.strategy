import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity({ schema: 'kb', name: 'project_object_type_registry' })
export class ProjectObjectTypeRegistry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'type_name', type: 'text' })
  typeName: string;

  @Column({ type: 'text' })
  source: string;

  @Column({ name: 'template_pack_id', type: 'uuid', nullable: true })
  templatePackId: string | null;

  @Column({ name: 'schema_version', type: 'int', default: 1 })
  schemaVersion: number;

  @Column({ name: 'json_schema', type: 'jsonb' })
  jsonSchema: Record<string, any>;

  @Column({ name: 'ui_config', type: 'jsonb', nullable: true })
  uiConfig: Record<string, any> | null;

  @Column({ name: 'extraction_config', type: 'jsonb', nullable: true })
  extractionConfig: Record<string, any> | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'discovery_confidence', type: 'float', nullable: true })
  discoveryConfidence: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
