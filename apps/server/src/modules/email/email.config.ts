import { Injectable } from '@nestjs/common';

/**
 * Email Configuration
 *
 * Loads email-related configuration from environment variables.
 * All email functionality can be disabled by setting EMAIL_ENABLED=false.
 */
@Injectable()
export class EmailConfig {
  /**
   * Whether email sending is enabled.
   * Set EMAIL_ENABLED=false to disable all email functionality.
   */
  get enabled(): boolean {
    return process.env.EMAIL_ENABLED === 'true';
  }

  /**
   * Mailgun API key.
   * Required when email is enabled.
   */
  get mailgunApiKey(): string {
    return process.env.MAILGUN_API_KEY || '';
  }

  /**
   * Mailgun domain (e.g., mg.yourdomain.com).
   * Required when email is enabled.
   */
  get mailgunDomain(): string {
    return process.env.MAILGUN_DOMAIN || '';
  }

  /**
   * Mailgun API URL.
   * Default: https://api.mailgun.net (US region)
   * For EU: https://api.eu.mailgun.net
   */
  get mailgunApiUrl(): string {
    return process.env.MAILGUN_API_URL || 'https://api.mailgun.net';
  }

  /**
   * Default "from" email address.
   */
  get fromEmail(): string {
    return process.env.MAILGUN_FROM_EMAIL || 'noreply@example.com';
  }

  /**
   * Default "from" name.
   */
  get fromName(): string {
    return process.env.MAILGUN_FROM_NAME || 'Emergent';
  }

  /**
   * Email worker poll interval in milliseconds.
   * Default: 10000 (10 seconds)
   */
  get workerIntervalMs(): number {
    return parseInt(process.env.EMAIL_WORKER_INTERVAL_MS || '10000', 10);
  }

  /**
   * Email worker batch size.
   * Default: 5
   */
  get workerBatchSize(): number {
    return parseInt(process.env.EMAIL_WORKER_BATCH || '5', 10);
  }

  /**
   * Maximum retry attempts for failed emails.
   * Default: 3
   */
  get maxRetries(): number {
    return parseInt(process.env.EMAIL_MAX_RETRIES || '3', 10);
  }

  /**
   * Base retry delay in seconds (exponential backoff).
   * Default: 60
   */
  get retryDelaySec(): number {
    return parseInt(process.env.EMAIL_RETRY_DELAY_SEC || '60', 10);
  }

  /**
   * Validate that required configuration is present when email is enabled.
   * Returns validation errors as an array of strings.
   */
  validate(): string[] {
    const errors: string[] = [];

    if (!this.enabled) {
      return errors; // No validation needed if disabled
    }

    if (!this.mailgunApiKey) {
      errors.push('MAILGUN_API_KEY is required when EMAIL_ENABLED=true');
    }

    if (!this.mailgunDomain) {
      errors.push('MAILGUN_DOMAIN is required when EMAIL_ENABLED=true');
    }

    return errors;
  }
}
