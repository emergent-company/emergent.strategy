import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Email Delivery Status from Mailgun events
 */
export type EmailDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'soft_bounced'
  | 'complained'
  | 'unsubscribed'
  | 'failed';

/**
 * Email Job Entity
 *
 * Represents a queued email to be sent. The email worker processes pending jobs
 * and sends them via Mailgun. Failed jobs are retried with exponential backoff.
 */
@Entity({ schema: 'kb', name: 'email_jobs' })
@Index(['status', 'nextRetryAt'])
@Index(['sourceType', 'sourceId'])
export class EmailJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_name', type: 'varchar', length: 100 })
  templateName!: string;

  @Column({ name: 'to_email', type: 'varchar', length: 320 })
  toEmail!: string;

  @Column({ name: 'to_name', type: 'varchar', length: 255, nullable: true })
  toName!: string | null;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ name: 'template_data', type: 'jsonb', default: '{}' })
  templateData!: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: 'pending' | 'processing' | 'sent' | 'failed';

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 3 })
  maxAttempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({
    name: 'mailgun_message_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  mailgunMessageId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: 'source_type', type: 'varchar', length: 50, nullable: true })
  sourceType!: string | null;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId!: string | null;

  // Delivery status fields (from Mailgun events sync)
  @Column({
    name: 'delivery_status',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  deliveryStatus!: EmailDeliveryStatus | null;

  @Column({ name: 'delivery_status_at', type: 'timestamptz', nullable: true })
  deliveryStatusAt!: Date | null;

  @Column({
    name: 'delivery_status_synced_at',
    type: 'timestamptz',
    nullable: true,
  })
  deliveryStatusSyncedAt!: Date | null;
}
