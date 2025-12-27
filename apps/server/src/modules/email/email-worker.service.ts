import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  Optional,
} from '@nestjs/common';
import { trace, SpanStatusCode, Tracer } from '@opentelemetry/api';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailJobsService, EmailJobRow } from './email-jobs.service';
import { EmailTemplateService } from './email-template.service';
import { MailgunProvider } from './mailgun.provider';
import { EmailConfig } from './email.config';
import { EmailLog } from '../../entities/email-log.entity';
import { DatabaseService } from '../../common/database/database.service';
import { LangfuseService } from '../langfuse/langfuse.service';

/**
 * EmailWorkerService
 *
 * Background worker that processes queued email jobs:
 * 1. Dequeues pending jobs from the queue
 * 2. Renders email templates
 * 3. Sends via Mailgun
 * 4. Logs results and updates job status
 *
 * Follows the same pattern as EmbeddingWorkerService:
 * - setTimeout-based polling loop
 * - Graceful shutdown with currentBatch tracking
 * - Stale job recovery on startup
 * - Disabled in tests unless ENABLE_WORKERS_IN_TESTS=true
 */
@Injectable()
export class EmailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentBatch: Promise<void> | null = null;

  // Lightweight metrics (reset on restart)
  private processedCount = 0;
  private successCount = 0;
  private failureCount = 0;

  // OpenTelemetry tracer for creating parent spans
  private readonly tracer: Tracer = trace.getTracer('email-worker');

  constructor(
    @Inject(EmailJobsService) private readonly jobs: EmailJobsService,
    @Inject(EmailTemplateService)
    private readonly templates: EmailTemplateService,
    @Inject(MailgunProvider) private readonly mailgun: MailgunProvider,
    @Inject(EmailConfig) private readonly config: EmailConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @InjectRepository(EmailLog)
    private readonly emailLogRepo: Repository<EmailLog>,
    @Optional()
    private readonly langfuseService?: LangfuseService
  ) {}

  onModuleInit() {
    // Don't start if email is disabled
    if (!this.config.enabled) {
      this.logger.log('Email worker not started (EMAIL_ENABLED=false)');
      return;
    }

    // Don't start if DB is offline
    if (!this.db.isOnline()) {
      this.logger.warn('Database offline at worker init; email worker idle.');
      return;
    }

    // Disable during tests unless explicitly enabled
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_WORKERS_IN_TESTS !== 'true'
    ) {
      this.logger.debug(
        'Email worker disabled during tests (set ENABLE_WORKERS_IN_TESTS=true to enable)'
      );
      return;
    }

    // Recover any stale jobs from previous server restart
    this.recoverStaleJobsOnStartup();

    this.start();
  }

  /**
   * Recover stale jobs on startup.
   * Runs async in background so it doesn't block module init.
   */
  private async recoverStaleJobsOnStartup() {
    try {
      const recovered = await this.jobs.recoverStaleJobs();
      if (recovered > 0) {
        this.logger.log(`Recovered ${recovered} stale email job(s) on startup`);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to recover stale jobs on startup: ${(err as Error).message}`
      );
    }
  }

  async onModuleDestroy() {
    await this.stop();
  }

  /**
   * Start the worker with the configured poll interval.
   */
  start(intervalMs?: number) {
    if (this.timer) return; // Already started

    const interval = intervalMs ?? this.config.workerIntervalMs;
    this.running = true;

    const tick = async () => {
      if (!this.running) return;

      try {
        this.currentBatch = this.processBatch();
        await this.currentBatch;
      } catch (e) {
        this.logger.warn('processBatch failed: ' + (e as Error).message);
      } finally {
        this.currentBatch = null;
      }

      this.timer = setTimeout(tick, interval);
    };

    this.timer = setTimeout(tick, interval);
    this.logger.log(`Email worker started (interval=${interval}ms)`);
  }

  /**
   * Stop the worker gracefully, waiting for current batch to complete.
   */
  async stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;

    // Wait for current batch to finish
    if (this.currentBatch) {
      this.logger.debug(
        'Waiting for current batch to complete before stopping...'
      );
      try {
        await this.currentBatch;
      } catch (error) {
        this.logger.warn('Current batch failed during shutdown', error);
      }
    }

    this.logger.log('Email worker stopped');
  }

  /**
   * Process a batch of email jobs.
   * Exposed for testing (can invoke directly without waiting for timer).
   */
  async processBatch(): Promise<void> {
    return this.tracer.startActiveSpan(
      'email-worker.processBatch',
      async (batchSpan) => {
        try {
          const batch: EmailJobRow[] = await this.jobs.dequeue();

          batchSpan.setAttribute('batch.size', batch.length);

          if (!batch.length) {
            batchSpan.setAttribute('batch.empty', true);
            batchSpan.setStatus({ code: SpanStatusCode.OK });
            return;
          }

          for (const job of batch) {
            await this.processJob(job);
          }

          batchSpan.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          batchSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err.message,
          });
          batchSpan.recordException(err);
          throw error;
        } finally {
          batchSpan.end();
        }
      }
    );
  }

  /**
   * Process a single email job.
   */
  private async processJob(job: EmailJobRow): Promise<void> {
    const startTime = Date.now();

    // Create a trace for this email job
    const shortJobId = job.id.split('-').pop() || job.id;
    const traceId = this.langfuseService?.createJobTrace(
      job.id,
      {
        name: `Email ${job.template_name} to ${job.to_email}`,
        template_name: job.template_name,
        to_email: job.to_email,
        job_type: 'email_send',
      },
      undefined, // environment (use default)
      'email' // traceType for filtering
    );

    try {
      // Render template
      const renderSpan = traceId
        ? this.langfuseService?.createSpan(traceId, 'render_template', {
            template_name: job.template_name,
          })
        : null;

      const rendered = await this.templates.render(
        job.template_name,
        job.template_data
      );

      if (renderSpan) {
        this.langfuseService?.endSpan(
          renderSpan,
          { html_length: rendered.html.length },
          'success'
        );
      }

      // Send via Mailgun
      const sendSpan = traceId
        ? this.langfuseService?.createSpan(traceId, 'send_mailgun', {
            to_email: job.to_email,
            subject: job.subject,
          })
        : null;

      const result = await this.mailgun.send({
        to: job.to_email,
        toName: job.to_name ?? undefined,
        subject: job.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (sendSpan) {
        this.langfuseService?.endSpan(
          sendSpan,
          { success: result.success, message_id: result.messageId },
          result.success ? 'success' : 'error'
        );
      }

      if (result.success && result.messageId) {
        // Mark job as sent
        await this.jobs.markSent(job.id, result.messageId);

        // Log success
        await this.logEmailSend(job, 'sent', result.messageId);

        const durationMs = Date.now() - startTime;
        this.logger.debug(
          `Email job ${shortJobId} sent to ${job.to_email} in ${durationMs}ms`
        );

        // Finalize trace with success
        if (traceId) {
          await this.langfuseService?.finalizeTrace(traceId, 'success', {
            duration_ms: durationMs,
            message_id: result.messageId,
          });
        }

        this.processedCount++;
        this.successCount++;
      } else {
        // Mailgun returned an error
        const error = new Error(result.error || 'Unknown Mailgun error');
        await this.handleJobFailure(
          job,
          error,
          traceId ?? undefined,
          startTime
        );
      }
    } catch (err) {
      await this.handleJobFailure(
        job,
        err as Error,
        traceId ?? undefined,
        startTime
      );
    }
  }

  /**
   * Handle a job failure - mark failed and log.
   */
  private async handleJobFailure(
    job: EmailJobRow,
    error: Error,
    traceId: string | undefined,
    startTime: number
  ): Promise<void> {
    const durationMs = Date.now() - startTime;
    const errorMessage = error.message;

    await this.jobs.markFailed(job.id, error);
    await this.logEmailSend(job, 'failed', null, errorMessage);

    if (traceId) {
      await this.langfuseService?.finalizeTrace(traceId, 'error', {
        error: errorMessage,
        duration_ms: durationMs,
      });
    }

    this.processedCount++;
    this.failureCount++;
  }

  /**
   * Log an email send attempt to the email_logs table.
   */
  private async logEmailSend(
    job: EmailJobRow,
    status: 'sent' | 'failed',
    messageId: string | null,
    errorMessage?: string
  ): Promise<void> {
    try {
      const log = this.emailLogRepo.create({
        emailJobId: job.id,
        eventType: status,
        mailgunEventId: messageId,
        details: {
          toEmail: job.to_email,
          subject: job.subject,
          templateName: job.template_name,
          errorMessage: errorMessage || null,
          sentAt: status === 'sent' ? new Date().toISOString() : null,
        },
      });
      await this.emailLogRepo.save(log);
    } catch (err) {
      this.logger.warn(`Failed to log email send: ${(err as Error).message}`);
    }
  }

  /**
   * Get worker metrics.
   */
  stats() {
    return {
      processed: this.processedCount,
      succeeded: this.successCount,
      failed: this.failureCount,
    };
  }
}
