import { Injectable, Logger } from '@nestjs/common';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { EmailConfig } from './email.config';

export interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Mailgun Provider
 *
 * Handles sending emails via Mailgun API.
 * This is a thin wrapper around the Mailgun SDK.
 */
@Injectable()
export class MailgunProvider {
  private readonly logger = new Logger(MailgunProvider.name);
  private client: ReturnType<Mailgun['client']> | null = null;

  constructor(private readonly config: EmailConfig) {}

  /**
   * Initialize the Mailgun client.
   * Called lazily on first send to avoid initialization when email is disabled.
   */
  private getClient(): ReturnType<Mailgun['client']> {
    if (!this.client) {
      const mailgun = new Mailgun(formData);
      this.client = mailgun.client({
        username: 'api',
        key: this.config.mailgunApiKey,
        url: this.config.mailgunApiUrl,
      });
    }
    return this.client;
  }

  /**
   * Send an email via Mailgun.
   *
   * @param options Email options (to, subject, html, text)
   * @returns Result with success status and messageId or error
   */
  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!this.config.enabled) {
      this.logger.warn('Email sending is disabled (EMAIL_ENABLED=false)');
      return {
        success: false,
        error: 'Email sending is disabled',
      };
    }

    const validationErrors = this.config.validate();
    if (validationErrors.length > 0) {
      const error = validationErrors.join('; ');
      this.logger.error(`Email configuration invalid: ${error}`);
      return {
        success: false,
        error,
      };
    }

    try {
      const client = this.getClient();

      // Format recipient with name if provided
      const to = options.toName
        ? `${options.toName} <${options.to}>`
        : options.to;

      // Format sender with name
      const from = `${this.config.fromName} <${this.config.fromEmail}>`;

      const messageData = {
        from,
        to,
        subject: options.subject,
        html: options.html,
        ...(options.text && { text: options.text }),
      };

      this.logger.debug(`Sending email to ${options.to}: ${options.subject}`);

      const response = await client.messages.create(
        this.config.mailgunDomain,
        messageData
      );

      this.logger.log(
        `Email sent successfully to ${options.to}, messageId: ${response.id}`
      );

      return {
        success: true,
        messageId: response.id,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to send email to ${options.to}: ${errorMessage}`
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
