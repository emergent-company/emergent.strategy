import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import type { ChatMessage } from './chat-message.entity';
import type { UserProfile } from './user-profile.entity';
import type { Project } from './project.entity';
import type { GraphObject } from './graph-object.entity';

@Entity({ schema: 'kb', name: 'chat_conversations' })
@Index(['canonicalId'], { unique: true, where: 'canonical_id IS NOT NULL' })
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ name: 'is_private', type: 'boolean', default: true })
  isPrivate: boolean;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'draft_text', type: 'text', nullable: true })
  draftText: string | null;

  /**
   * Optional reference to a graph object for object-scoped refinement chats.
   * When set, this conversation is a shared refinement chat for the object.
   * @deprecated Use canonicalId instead for object refinement chats
   */
  @Column({ name: 'object_id', type: 'uuid', nullable: true })
  objectId: string | null;

  /**
   * Canonical ID of the graph object for object-scoped refinement chats.
   * This persists across object versions (patches create new version IDs but
   * keep the same canonical ID). The unique partial index ensures only one
   * conversation per canonical object.
   */
  @Column({ name: 'canonical_id', type: 'uuid', nullable: true })
  canonicalId: string | null;

  /**
   * Array of enabled tool names for this conversation.
   * NULL means all tools are enabled (default behavior).
   * Empty array means no tools are enabled.
   */
  @Column({ name: 'enabled_tools', type: 'text', array: true, nullable: true })
  enabledTools: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany('ChatMessage', 'conversation')
  messages!: ChatMessage[];

  @ManyToOne('UserProfile', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: UserProfile;

  @ManyToOne('Project', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project!: Project | null;

  @ManyToOne('GraphObject', { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'object_id' })
  object!: GraphObject | null;
}
