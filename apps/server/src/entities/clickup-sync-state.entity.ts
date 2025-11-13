import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'kb', name: 'clickup_sync_state' })
export class ClickUpSyncState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'integration_id', type: 'uuid', unique: true })
  integrationId: string;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt: Date | null;

  @Column({
    name: 'last_successful_sync_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSuccessfulSyncAt: Date | null;

  @Column({ name: 'sync_status', type: 'text', nullable: true })
  syncStatus: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'documents_imported', type: 'int', default: 0 })
  documentsImported: number;

  @Column({ name: 'spaces_synced', type: 'jsonb', nullable: true })
  spacesSynced: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
