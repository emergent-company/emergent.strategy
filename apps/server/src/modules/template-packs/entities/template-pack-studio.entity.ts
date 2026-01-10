import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { GraphTemplatePack } from './graph-template-pack.entity';

/**
 * Template Pack Studio session status
 */
export type StudioSessionStatus = 'active' | 'completed' | 'discarded';

/**
 * Template Pack Studio session entity
 *
 * Tracks an active editing session in the Template Pack Studio.
 * Each session is associated with a draft template pack being created or edited.
 */
@Entity({ schema: 'kb', name: 'template_pack_studio_sessions' })
export class TemplatePackStudioSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  user_id: string;

  @Column({ type: 'uuid' })
  project_id: string;

  /**
   * Reference to the draft template pack being edited.
   * Null if the session was discarded and the pack was deleted.
   */
  @Column({ type: 'uuid', nullable: true })
  pack_id?: string;

  @ManyToOne(() => GraphTemplatePack, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pack_id' })
  pack?: GraphTemplatePack;

  @Column({
    type: 'text',
    default: 'active',
  })
  status: StudioSessionStatus;

  @OneToMany(() => TemplatePackStudioMessage, (message) => message.session)
  messages: TemplatePackStudioMessage[];

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;
}

/**
 * Message role in studio conversation
 */
export type StudioMessageRole = 'user' | 'assistant' | 'system';

/**
 * Suggestion status
 */
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Schema suggestion from the LLM
 */
export interface SchemaSuggestion {
  id: string;
  type:
    | 'add_object_type'
    | 'modify_object_type'
    | 'remove_object_type'
    | 'add_relationship_type'
    | 'modify_relationship_type'
    | 'remove_relationship_type'
    | 'update_ui_config'
    | 'update_extraction_prompt';
  target_type?: string;
  description: string;
  before?: any;
  after?: any;
  status: SuggestionStatus;
}

/**
 * Template Pack Studio message entity
 *
 * Stores chat messages in a studio session, including
 * user messages, assistant responses, and any schema suggestions.
 */
@Entity({ schema: 'kb', name: 'template_pack_studio_messages' })
export class TemplatePackStudioMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  session_id: string;

  @ManyToOne(() => TemplatePackStudioSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: TemplatePackStudioSession;

  @Column({ type: 'text' })
  role: StudioMessageRole;

  @Column({ type: 'text' })
  content: string;

  /**
   * Schema suggestions included in assistant messages.
   * Empty array for user messages.
   */
  @Column({ type: 'jsonb', default: [] })
  suggestions: SchemaSuggestion[];

  /**
   * Additional metadata (e.g., model used, latency, tokens)
   */
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  created_at: Date;
}
