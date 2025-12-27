import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

export interface TemplateVariable {
  name: string;
  type: 'string' | 'url' | 'date' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
}

@Entity({ schema: 'kb', name: 'email_templates' })
@Index(['name'])
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'subject_template', type: 'varchar', length: 500 })
  subjectTemplate!: string;

  @Column({ name: 'mjml_content', type: 'text' })
  mjmlContent!: string;

  @Column({ type: 'jsonb', default: '[]' })
  variables!: TemplateVariable[];

  @Column({ name: 'sample_data', type: 'jsonb', default: '{}' })
  sampleData!: Record<string, any>;

  @Column({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId!: string | null;

  @Column({ name: 'is_customized', type: 'boolean', default: false })
  isCustomized!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedById!: string | null;

  @ManyToOne(() => UserProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updatedBy!: UserProfile | null;

  @OneToMany(
    'EmailTemplateVersion',
    (version: { template: EmailTemplate }) => version.template
  )
  versions!: import('./email-template-version.entity').EmailTemplateVersion[];
}
