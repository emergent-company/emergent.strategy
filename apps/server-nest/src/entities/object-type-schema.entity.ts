import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'kb', name: 'object_type_schemas' })
export class ObjectTypeSchema {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'supersedes_id', type: 'uuid', nullable: true })
  supersedesId: string | null;

  @Column({ name: 'canonical_id', type: 'uuid', nullable: true })
  canonicalId: string | null;

  @Column({ name: 'json_schema', type: 'jsonb' })
  jsonSchema: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
