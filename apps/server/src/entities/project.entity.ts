import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Org } from './org.entity';

@Entity({ schema: 'kb', name: 'projects' })
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Org, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Org;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'kb_purpose', type: 'text', nullable: true })
  kbPurpose: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'auto_extract_objects', type: 'boolean', default: false })
  autoExtractObjects: boolean;

  @Column({ name: 'auto_extract_config', type: 'jsonb', default: {} })
  autoExtractConfig: Record<string, any>;

  @Column({ name: 'chat_prompt_template', type: 'text', nullable: true })
  chatPromptTemplate: string | null;
}
