import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { EmailTemplate, TemplateVariable } from './email-template.entity';
import { UserProfile } from './user-profile.entity';

@Entity({ schema: 'kb', name: 'email_template_versions' })
@Index(['templateId'])
@Index(['createdAt'])
@Unique(['templateId', 'versionNumber'])
export class EmailTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  @Column({ name: 'subject_template', type: 'varchar', length: 500 })
  subjectTemplate!: string;

  @Column({ name: 'mjml_content', type: 'text' })
  mjmlContent!: string;

  @Column({ type: 'jsonb', default: '[]' })
  variables!: TemplateVariable[];

  @Column({ name: 'sample_data', type: 'jsonb', default: '{}' })
  sampleData!: Record<string, any>;

  @Column({
    name: 'change_summary',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  changeSummary!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById!: string | null;

  @ManyToOne(() => EmailTemplate, (template) => template.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template!: EmailTemplate;

  @ManyToOne(() => UserProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserProfile | null;
}
