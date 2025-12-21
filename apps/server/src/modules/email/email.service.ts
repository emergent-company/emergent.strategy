import { Injectable, Logger, Inject } from '@nestjs/common';
import { EmailConfig } from './email.config';
import {
  EmailJobsService,
  EmailJobRow,
  EnqueueEmailJobOptions,
} from './email-jobs.service';
import { EmailTemplateService } from './email-template.service';

export interface SendTemplatedEmailOptions {
  /**
   * Template name (without .mjml.hbs extension)
   */
  templateName: string;

  /**
   * Recipient email address
   */
  toEmail: string;

  /**
   * Recipient name (optional)
   */
  toName?: string;

  /**
   * Email subject line
   */
  subject: string;

  /**
   * Template context data
   */
  templateData?: Record<string, any>;

  /**
   * Source type for tracking (e.g., 'invite', 'notification')
   */
  sourceType?: string;

  /**
   * Source ID for tracking (e.g., invite ID)
   */
  sourceId?: string;
}

export interface SendEmailResult {
  /**
   * Whether the email was queued successfully
   */
  queued: boolean;

  /**
   * The job ID if queued successfully
   */
  jobId?: string;

  /**
   * Error message if queuing failed
   */
  error?: string;
}

/**
 * EmailService
 *
 * Public API for the email module. Other modules should use this service
 * to send emails. The service handles:
 * - Validation of email configuration
 * - Enqueueing emails for background processing
 * - Template validation
 *
 * Example usage:
 * ```typescript
 * await emailService.sendTemplatedEmail({
 *   templateName: 'invitation',
 *   toEmail: 'user@example.com',
 *   toName: 'John Doe',
 *   subject: 'You have been invited!',
 *   templateData: {
 *     inviterName: 'Jane Doe',
 *     projectName: 'My Project',
 *     acceptUrl: 'https://example.com/accept/123',
 *   },
 *   sourceType: 'invite',
 *   sourceId: 'invite-uuid',
 * });
 * ```
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EmailConfig) private readonly config: EmailConfig,
    @Inject(EmailJobsService) private readonly jobs: EmailJobsService,
    @Inject(EmailTemplateService)
    private readonly templates: EmailTemplateService
  ) {}

  /**
   * Check if email sending is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Validate the email configuration.
   * Returns an array of error messages, or empty array if valid.
   */
  validateConfig(): string[] {
    return this.config.validate();
  }

  /**
   * Send a templated email.
   *
   * The email is queued for background processing. The worker will:
   * 1. Render the template with the provided data
   * 2. Send via Mailgun
   * 3. Retry on failure with exponential backoff
   *
   * @param options Email options
   * @returns Result with queued status and job ID
   */
  async sendTemplatedEmail(
    options: SendTemplatedEmailOptions
  ): Promise<SendEmailResult> {
    // Check if email is enabled
    if (!this.config.enabled) {
      this.logger.debug(
        `Email not sent to ${options.toEmail} (EMAIL_ENABLED=false)`
      );
      return {
        queued: false,
        error: 'Email sending is disabled',
      };
    }

    // Validate configuration
    const configErrors = this.config.validate();
    if (configErrors.length > 0) {
      this.logger.error(
        `Email configuration invalid: ${configErrors.join('; ')}`
      );
      return {
        queued: false,
        error: configErrors.join('; '),
      };
    }

    // Validate template exists
    if (!this.templates.hasTemplate(options.templateName)) {
      const error = `Template '${options.templateName}' not found`;
      this.logger.error(error);
      return {
        queued: false,
        error,
      };
    }

    try {
      // Enqueue the email job
      const jobOptions: EnqueueEmailJobOptions = {
        templateName: options.templateName,
        toEmail: options.toEmail,
        toName: options.toName,
        subject: options.subject,
        templateData: options.templateData,
        sourceType: options.sourceType,
        sourceId: options.sourceId,
      };

      const job = await this.jobs.enqueue(jobOptions);

      this.logger.debug(
        `Queued email job ${job.id} for ${options.toEmail} (template: ${options.templateName})`
      );

      return {
        queued: true,
        jobId: job.id,
      };
    } catch (err) {
      const errorMessage = (err as Error).message;
      this.logger.error(`Failed to queue email: ${errorMessage}`);
      return {
        queued: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the status of an email job.
   *
   * @param jobId Job ID
   * @returns Job row or null if not found
   */
  async getJobStatus(jobId: string): Promise<EmailJobRow | null> {
    return this.jobs.getJob(jobId);
  }

  /**
   * Get all email jobs for a specific source.
   *
   * @param sourceType Source type (e.g., 'invite')
   * @param sourceId Source ID
   * @returns Array of job rows
   */
  async getJobsBySource(
    sourceType: string,
    sourceId: string
  ): Promise<EmailJobRow[]> {
    return this.jobs.getJobsBySource(sourceType, sourceId);
  }

  /**
   * Get queue statistics.
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    sent: number;
    failed: number;
  }> {
    return this.jobs.stats();
  }

  /**
   * List available email templates.
   */
  listTemplates(): string[] {
    return this.templates.listTemplates();
  }

  /**
   * Send a welcome email to a new user.
   *
   * This email is sent on first login to welcome users to the platform
   * and explain what they can do with Emergent.
   *
   * @param options Welcome email options
   * @returns Result with queued status and job ID
   */
  async sendWelcomeEmail(options: {
    toEmail: string;
    toName?: string;
    dashboardUrl: string;
    userId: string;
  }): Promise<SendEmailResult> {
    return this.sendTemplatedEmail({
      templateName: 'welcome',
      toEmail: options.toEmail,
      toName: options.toName,
      subject: 'Welcome to Emergent!',
      templateData: {
        recipientName: options.toName,
        dashboardUrl: options.dashboardUrl,
      },
      sourceType: 'welcome',
      sourceId: options.userId,
    });
  }
}
