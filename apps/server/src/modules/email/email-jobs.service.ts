import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { EmailJob } from '../../entities/email-job.entity';
import { EmailConfig } from './email.config';

export interface EmailJobRow {
  id: string;
  template_name: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  template_data: Record<string, any>;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  mailgun_message_id: string | null;
  created_at: string;
  processed_at: string | null;
  next_retry_at: string | null;
  source_type: string | null;
  source_id: string | null;
}

export type EmailJobStatus = 'pending' | 'processing' | 'sent' | 'failed';

export interface EnqueueEmailJobOptions {
  templateName: string;
  toEmail: string;
  toName?: string;
  subject: string;
  templateData?: Record<string, any>;
  sourceType?: string;
  sourceId?: string;
  maxAttempts?: number;
}

/**
 * EmailJobsService
 *
 * Manages the email job queue. Provides methods to:
 * - Enqueue new email jobs
 * - Dequeue jobs for processing (with FOR UPDATE SKIP LOCKED for concurrency)
 * - Mark jobs as sent/failed
 * - Get job stats and status
 *
 * Uses the same atomic dequeue pattern as EmbeddingJobsService for concurrent workers.
 */
@Injectable()
export class EmailJobsService {
  private readonly logger = new Logger(EmailJobsService.name);

  constructor(
    @InjectRepository(EmailJob)
    private readonly emailJobRepository: Repository<EmailJob>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EmailConfig) private readonly config: EmailConfig
  ) {}

  /**
   * 🔒 STRATEGIC RAW SQL - DO NOT MIGRATE TO TYPEORM
   *
   * enqueue - Create a new email job ready for immediate processing
   *
   * Why Strategic SQL:
   * ------------------
   * Uses PostgreSQL now() for next_retry_at to ensure clock consistency
   * with the dequeue() query. JavaScript's new Date() may have clock skew
   * relative to the database server, causing jobs to appear "in the future"
   * and be skipped by dequeue().
   *
   * @param options Email job options
   * @returns The created job row
   */
  async enqueue(options: EnqueueEmailJobOptions): Promise<EmailJobRow> {
    const maxAttempts = options.maxAttempts ?? this.config.maxRetries;

    const result = await this.dataSource.query(
      `INSERT INTO kb.email_jobs (
        template_name, to_email, to_name, subject, template_data,
        status, attempts, max_attempts, source_type, source_id, next_retry_at
      ) VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, $7, $8, now())
      RETURNING id, template_name, to_email, to_name, subject,
                template_data, status, attempts, max_attempts,
                last_error, mailgun_message_id, created_at,
                processed_at, next_retry_at, source_type, source_id`,
      [
        options.templateName,
        options.toEmail,
        options.toName ?? null,
        options.subject,
        JSON.stringify(options.templateData ?? {}),
        maxAttempts,
        options.sourceType ?? null,
        options.sourceId ?? null,
      ]
    );

    const row = Array.isArray(result) ? result[0] : result;

    this.logger.debug(
      `Enqueued email job ${row.id} for ${row.to_email} (template: ${row.template_name})`
    );

    return row as EmailJobRow;
  }

  /**
   * 🔒 STRATEGIC RAW SQL - DO NOT MIGRATE TO TYPEORM
   *
   * dequeue - Atomically claim and lock email jobs for processing
   *
   * Why Strategic SQL:
   * ------------------
   * Uses PostgreSQL's FOR UPDATE SKIP LOCKED for concurrent workers.
   * See EmbeddingJobsService.dequeue() for detailed documentation.
   *
   * What It Does:
   * -------------
   * - Finds up to batchSize jobs WHERE status='pending' AND next_retry_at <= now()
   * - Orders by created_at ASC (FIFO)
   * - Locks selected rows with FOR UPDATE SKIP LOCKED (non-blocking)
   * - Updates status='processing', attempts++
   * - Returns all fields of claimed jobs
   */
  async dequeue(batchSize?: number): Promise<EmailJobRow[]> {
    const batch = batchSize ?? this.config.workerBatchSize;

    const result = await this.dataSource.query(
      `WITH cte AS (
         SELECT id FROM kb.email_jobs
         WHERE status='pending' 
           AND (next_retry_at IS NULL OR next_retry_at <= now())
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE kb.email_jobs j 
       SET status='processing', 
           attempts=attempts+1
       FROM cte WHERE j.id = cte.id
       RETURNING j.id, j.template_name, j.to_email, j.to_name, j.subject,
                 j.template_data, j.status, j.attempts, j.max_attempts,
                 j.last_error, j.mailgun_message_id, j.created_at,
                 j.processed_at, j.next_retry_at, j.source_type, j.source_id`,
      [batch]
    );

    // TypeORM returns UPDATE...RETURNING as [[rows], affectedCount] or just [rows]
    if (
      Array.isArray(result) &&
      result.length === 2 &&
      Array.isArray(result[0])
    ) {
      return result[0] as EmailJobRow[];
    }
    return (result || []) as EmailJobRow[];
  }

  /**
   * Mark an email job as sent successfully.
   *
   * @param id Job ID
   * @param messageId Mailgun message ID
   */
  async markSent(id: string, messageId: string): Promise<void> {
    await this.emailJobRepository.update(id, {
      status: 'sent',
      mailgunMessageId: messageId,
      processedAt: new Date(),
      lastError: null,
    });

    this.logger.debug(
      `Email job ${id} marked as sent (messageId: ${messageId})`
    );
  }

  /**
   * Mark an email job as failed.
   * If attempts < maxAttempts, requeue with exponential backoff.
   * Otherwise, mark as permanently failed.
   *
   * @param id Job ID
   * @param error Error that caused the failure
   */
  async markFailed(id: string, error: Error): Promise<void> {
    const job = await this.emailJobRepository.findOne({
      where: { id },
      select: ['id', 'attempts', 'maxAttempts'],
    });

    if (!job) {
      this.logger.warn(`Email job ${id} not found when marking as failed`);
      return;
    }

    const errorMessage = error.message.slice(0, 1000);

    if (job.attempts < job.maxAttempts) {
      // Calculate exponential backoff: base * attempt^2, capped at 1 hour
      const delaySeconds = Math.min(
        3600,
        this.config.retryDelaySec * job.attempts * job.attempts
      );

      // Requeue for retry using raw SQL for interval calculation
      await this.dataSource.query(
        `UPDATE kb.email_jobs 
         SET status='pending', 
             last_error=$2, 
             next_retry_at=now() + ($3 || ' seconds')::interval
         WHERE id=$1`,
        [id, errorMessage, delaySeconds.toString()]
      );

      this.logger.warn(
        `Email job ${id} failed (attempt ${job.attempts}/${job.maxAttempts}), ` +
          `retrying in ${delaySeconds}s: ${errorMessage}`
      );
    } else {
      // Max retries exceeded - mark as permanently failed
      await this.emailJobRepository.update(id, {
        status: 'failed',
        lastError: errorMessage,
        processedAt: new Date(),
      });

      this.logger.error(
        `Email job ${id} permanently failed after ${job.attempts} attempts: ${errorMessage}`
      );
    }
  }

  /**
   * Recover stale jobs that got stuck in 'processing' status.
   * This can happen when the server is restarted while jobs are being processed.
   *
   * @param staleThresholdMinutes Jobs stuck in processing longer than this are considered stale
   * @returns Number of jobs recovered
   */
  async recoverStaleJobs(staleThresholdMinutes = 10): Promise<number> {
    const result = await this.dataSource.query(
      `UPDATE kb.email_jobs 
       SET status = 'pending', 
           next_retry_at = now()
       WHERE status = 'processing' 
         AND created_at < now() - ($1 || ' minutes')::interval
       RETURNING id`,
      [staleThresholdMinutes.toString()]
    );

    const count = Array.isArray(result) ? result.length : 0;

    if (count > 0) {
      this.logger.warn(
        `Recovered ${count} stale email job(s) stuck in 'processing' for > ${staleThresholdMinutes} minutes`
      );
    }

    return count;
  }

  /**
   * Get job by ID.
   */
  async getJob(id: string): Promise<EmailJobRow | null> {
    const job = await this.emailJobRepository.findOne({ where: { id } });
    return job ? this.toJobRow(job) : null;
  }

  /**
   * Get jobs by source (e.g., all emails for a specific invite).
   */
  async getJobsBySource(
    sourceType: string,
    sourceId: string
  ): Promise<EmailJobRow[]> {
    const jobs = await this.emailJobRepository.find({
      where: { sourceType, sourceId },
      order: { createdAt: 'DESC' },
    });
    return jobs.map((j) => this.toJobRow(j));
  }

  /**
   * Get queue statistics.
   */
  async stats(): Promise<{
    pending: number;
    processing: number;
    sent: number;
    failed: number;
  }> {
    const [pending, processing, sent, failed] = await Promise.all([
      this.emailJobRepository.count({ where: { status: 'pending' } }),
      this.emailJobRepository.count({ where: { status: 'processing' } }),
      this.emailJobRepository.count({ where: { status: 'sent' } }),
      this.emailJobRepository.count({ where: { status: 'failed' } }),
    ]);

    return { pending, processing, sent, failed };
  }

  /**
   * Convert entity to row format (snake_case for consistency with raw SQL).
   */
  private toJobRow(job: EmailJob): EmailJobRow {
    return {
      id: job.id,
      template_name: job.templateName,
      to_email: job.toEmail,
      to_name: job.toName,
      subject: job.subject,
      template_data: job.templateData,
      status: job.status,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      last_error: job.lastError,
      mailgun_message_id: job.mailgunMessageId,
      created_at: job.createdAt.toISOString(),
      processed_at: job.processedAt?.toISOString() ?? null,
      next_retry_at: job.nextRetryAt?.toISOString() ?? null,
      source_type: job.sourceType,
      source_id: job.sourceId,
    };
  }
}
