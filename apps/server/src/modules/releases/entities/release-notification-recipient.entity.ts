import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ReleaseNotification } from './release-notification.entity';

/**
 * Email delivery status values.
 */
export type EmailDeliveryStatus = 'pending' | 'delivered' | 'opened' | 'failed';

/**
 * Per-user delivery tracking for release notifications.
 */
@Entity({ schema: 'kb', name: 'release_notification_recipients' })
export class ReleaseNotificationRecipient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'release_notification_id', type: 'uuid' })
  releaseNotificationId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'email_sent', type: 'boolean', default: false })
  emailSent!: boolean;

  @Column({ name: 'email_sent_at', type: 'timestamptz', nullable: true })
  emailSentAt?: Date;

  @Column({
    name: 'mailgun_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  mailgunMessageId?: string;

  @Column({
    name: 'email_status',
    type: 'varchar',
    length: 50,
    default: 'pending',
  })
  emailStatus!: EmailDeliveryStatus;

  @Column({
    name: 'email_status_updated_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailStatusUpdatedAt?: Date;

  @Column({ name: 'in_app_notification_id', type: 'uuid', nullable: true })
  inAppNotificationId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => ReleaseNotification, (release) => release.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'release_notification_id' })
  releaseNotification!: ReleaseNotification;
}
