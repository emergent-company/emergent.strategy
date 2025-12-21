import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { EmailJob } from './email-job.entity';

/**
 * Email Log Entity
 *
 * Tracks email events for audit and debugging purposes.
 * Events include: queued, sent, delivered, failed, bounced, complained
 */
@Entity({ schema: 'kb', name: 'email_logs' })
@Index(['emailJobId'])
@Index(['eventType'])
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'email_job_id', type: 'uuid', nullable: true })
  emailJobId!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  eventType!: string;

  @Column({
    name: 'mailgun_event_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  mailgunEventId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => EmailJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'email_job_id' })
  emailJob!: EmailJob | null;
}
