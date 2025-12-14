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
import { ChatMessage } from './chat-message.entity';
import { UserProfile } from './user-profile.entity';
import { Project } from './project.entity';
import { GraphObject } from './graph-object.entity';

@Entity({ schema: 'kb', name: 'chat_conversations' })
@Index(['objectId'], { unique: true, where: 'object_id IS NOT NULL' })
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
   * The unique partial index ensures only one conversation per object.
   */
  @Column({ name: 'object_id', type: 'uuid', nullable: true })
  objectId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ChatMessage, (message) => message.conversation)
  messages: ChatMessage[];

  @ManyToOne(() => UserProfile, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner: UserProfile;

  @ManyToOne(() => Project, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @ManyToOne(() => GraphObject, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'object_id' })
  object: GraphObject | null;
}
