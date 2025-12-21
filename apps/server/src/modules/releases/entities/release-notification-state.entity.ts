import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tracks the last notified commit for release notifications.
 * Currently only supports main branch.
 */
@Entity({ schema: 'kb', name: 'release_notification_state' })
export class ReleaseNotificationState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, default: 'main', unique: true })
  branch!: string;

  @Column({ name: 'last_notified_commit', type: 'varchar', length: 40 })
  lastNotifiedCommit!: string;

  @Column({ name: 'last_notified_at', type: 'timestamptz' })
  lastNotifiedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
