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
import { UserProfile } from './user-profile.entity';

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

  @Column({ name: 'chunking_config', type: 'jsonb', nullable: true })
  chunkingConfig: {
    strategy: 'character' | 'sentence' | 'paragraph';
    maxChunkSize?: number;
    minChunkSize?: number;
    overlap?: number;
  } | null;

  @Column({
    name: 'allow_parallel_extraction',
    type: 'boolean',
    default: false,
  })
  allowParallelExtraction: boolean;

  @Column({ name: 'extraction_config', type: 'jsonb', nullable: true })
  extractionConfig: {
    /** Chunk size for LLM extraction in characters (default: 30000) */
    chunkSize?: number;
    /** Extraction method: 'function_calling' or 'responseSchema' (default: 'function_calling') */
    method?: 'function_calling' | 'responseSchema';
    /** Per-LLM-call timeout in seconds (default: 180) */
    timeoutSeconds?: number;
  } | null;

  /** Soft delete timestamp (null = active, timestamp = deleted) */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** User who performed the deletion (for audit trail) */
  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

  @ManyToOne(() => UserProfile, { nullable: true })
  @JoinColumn({ name: 'deleted_by' })
  deletedByUser: UserProfile | null;
}
