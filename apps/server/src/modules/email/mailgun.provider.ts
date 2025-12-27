import { Injectable, Logger, Inject } from '@nestjs/common';
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

export interface GetEventsResult {
  success: boolean;
  events?: MailgunEvent[];
  error?: string;
}

export interface MailgunEvent {
  id: string;
  event: string;
  timestamp: number;
  message?: {
    headers?: {
      'message-id'?: string;
    };
  };
  recipient?: string;
  reason?: string;
  severity?: string;
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

  constructor(@Inject(EmailConfig) private readonly config: EmailConfig) {}

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

  /**
   * Get events for a specific message from Mailgun Events API.
   * Used to track delivery status (delivered, opened, bounced, etc.)
   *
   * @param messageId The Mailgun message ID (format: <id@domain>)
   * @returns Events for the message, sorted by timestamp descending
   */
  async getEventsForMessage(messageId: string): Promise<GetEventsResult> {
    if (!this.config.enabled) {
      return {
        success: false,
        error: 'Email service is disabled',
      };
    }

    const validationErrors = this.config.validate();
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.join('; '),
      };
    }

    try {
      const client = this.getClient();
      const cleanMessageId = messageId.replace(/^<|>$/g, '');

      const response = await client.events.get(this.config.mailgunDomain, {
        'message-id': cleanMessageId,
        limit: 50,
      });

      const items = response?.items || [];

      const events: MailgunEvent[] = items.map((item: any) => ({
        id: item.id,
        event: item.event,
        timestamp: item.timestamp,
        message: item.message,
        recipient: item.recipient,
        reason: item.reason,
        severity: item.severity,
      }));

      events.sort((a, b) => b.timestamp - a.timestamp);

      return {
        success: true,
        events,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to get events for message ${messageId}: ${errorMessage}`
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
