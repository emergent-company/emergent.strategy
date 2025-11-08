import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { UserProfile } from './user-profile.entity';

@Entity({ schema: 'kb', name: 'chat_conversations' })
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ name: 'is_private', type: 'boolean', default: true })
  isPrivate: boolean;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ChatMessage, message => message.conversation)
  messages: ChatMessage[];

  @ManyToOne(() => UserProfile, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner: UserProfile;
}
