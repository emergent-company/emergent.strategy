import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Mailgun from 'mailgun.js';
import formData from 'form-data';
import { EmailConfig } from '../../email/email.config';
import { ReleaseNotification } from '../entities/release-notification.entity';
import {
  ReleaseNotificationRecipient,
  EmailDeliveryStatus,
} from '../entities/release-notification-recipient.entity';

/**
 * Mailgun event data.
 */
export interface MailgunEvent {
  event: string;
  timestamp: number;
  recipient?: string;
  message?: {
    headers?: {
      'message-id'?: string;
    };
  };
  'delivery-status'?: {
    code?: number;
    message?: string;
    description?: string;
  };
  reason?: string;
}

/**
 * Delivery status summary for a release.
 */
export interface ReleaseDeliveryStatus {
  releaseId: string;
  version: string;
  createdAt: Date;
  totalRecipients: number;
  pending: number;
  delivered: number;
  opened: number;
  failed: number;
  recipients: RecipientDeliveryStatus[];
}

/**
 * Delivery status for a single recipient.
 */
export interface RecipientDeliveryStatus {
  userId: string;
  email?: string;
  emailSent: boolean;
  emailStatus: EmailDeliveryStatus;
  emailStatusUpdatedAt?: Date;
  mailgunMessageId?: string;
  inAppNotificationId?: string;
}

/**
 * Service for checking release notification delivery status via Mailgun Events API.
 */
@Injectable()
export class ReleaseStatusService {
  private readonly logger = new Logger(ReleaseStatusService.name);
  private client: ReturnType<Mailgun['client']> | null = null;

  constructor(
    @InjectRepository(ReleaseNotification)
    private readonly releaseRepo: Repository<ReleaseNotification>,
    @InjectRepository(ReleaseNotificationRecipient)
    private readonly recipientRepo: Repository<ReleaseNotificationRecipient>,
    private readonly config: EmailConfig
  ) {}

  /**
   * Get the Mailgun client.
   */
  private getClient(): ReturnType<Mailgun['client']> | null {
    if (!this.config.enabled) {
      return null;
    }

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
   * Get delivery status for a release.
   */
  async getDeliveryStatus(releaseId: string): Promise<ReleaseDeliveryStatus> {
    const release = await this.releaseRepo.findOne({
      where: { id: releaseId },
    });

    if (!release) {
      throw new Error(`Release not found: ${releaseId}`);
    }

    // Get all recipients
    const recipients = await this.recipientRepo.find({
      where: { releaseNotificationId: releaseId },
    });

    // Update status from Mailgun if needed
    await this.updateRecipientStatuses(recipients);

    // Re-fetch recipients with updated status
    const updatedRecipients = await this.recipientRepo.find({
      where: { releaseNotificationId: releaseId },
    });

    // Build summary
    const statusCounts = {
      pending: 0,
      delivered: 0,
      opened: 0,
      failed: 0,
    };

    for (const r of updatedRecipients) {
      if (r.emailStatus in statusCounts) {
        statusCounts[r.emailStatus as keyof typeof statusCounts]++;
      }
    }

    return {
      releaseId: release.id,
      version: release.version,
      createdAt: release.createdAt,
      totalRecipients: updatedRecipients.length,
      ...statusCounts,
      recipients: updatedRecipients.map((r) => ({
        userId: r.userId,
        emailSent: r.emailSent,
        emailStatus: r.emailStatus,
        emailStatusUpdatedAt: r.emailStatusUpdatedAt,
        mailgunMessageId: r.mailgunMessageId,
        inAppNotificationId: r.inAppNotificationId,
      })),
    };
  }

  /**
   * Get delivery status for the latest release.
   */
  async getLatestDeliveryStatus(): Promise<ReleaseDeliveryStatus | null> {
    const release = await this.releaseRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    if (!release) {
      return null;
    }

    return this.getDeliveryStatus(release.id);
  }

  /**
   * Get delivery status for recent releases.
   */
  async getRecentDeliveryStatuses(
    count: number = 5
  ): Promise<ReleaseDeliveryStatus[]> {
    const releases = await this.releaseRepo.find({
      order: { createdAt: 'DESC' },
      take: count,
    });

    const results: ReleaseDeliveryStatus[] = [];
    for (const release of releases) {
      results.push(await this.getDeliveryStatus(release.id));
    }

    return results;
  }

  /**
   * Get delivery status by version.
   */
  async getDeliveryStatusByVersion(
    version: string
  ): Promise<ReleaseDeliveryStatus | null> {
    const release = await this.releaseRepo.findOne({
      where: { version },
    });

    if (!release) {
      return null;
    }

    return this.getDeliveryStatus(release.id);
  }

  /**
   * Update recipient statuses from Mailgun Events API.
   */
  private async updateRecipientStatuses(
    recipients: ReleaseNotificationRecipient[]
  ): Promise<void> {
    const client = this.getClient();
    if (!client) {
      this.logger.debug('Email disabled, skipping Mailgun status update');
      return;
    }

    // Filter recipients with message IDs that need status check
    const toCheck = recipients.filter(
      (r) =>
        r.mailgunMessageId &&
        r.emailStatus !== 'failed' &&
        r.emailStatus !== 'opened'
    );

    if (toCheck.length === 0) {
      return;
    }

    for (const recipient of toCheck) {
      try {
        await this.updateSingleRecipientStatus(client, recipient);
      } catch (error) {
        this.logger.warn(
          `Failed to get status for message ${recipient.mailgunMessageId}: ${
            (error as Error).message
          }`
        );
      }
    }
  }

  /**
   * Update status for a single recipient.
   */
  private async updateSingleRecipientStatus(
    client: ReturnType<Mailgun['client']>,
    recipient: ReleaseNotificationRecipient
  ): Promise<void> {
    if (!recipient.mailgunMessageId) {
      return;
    }

    // The message ID from Mailgun is in format <id@domain>
    // We need to extract just the ID part for the events API
    let messageId = recipient.mailgunMessageId;
    if (messageId.startsWith('<') && messageId.endsWith('>')) {
      messageId = messageId.slice(1, -1);
    }

    try {
      // Query events for this message
      // Note: Mailgun events API requires the domain
      const events = await client.events.get(this.config.mailgunDomain, {
        'message-id': messageId,
        limit: 10,
      });

      if (!events || !events.items || events.items.length === 0) {
        return;
      }

      // Find the most significant event
      let newStatus: EmailDeliveryStatus = recipient.emailStatus;
      let latestTimestamp = 0;

      for (const event of events.items as MailgunEvent[]) {
        const eventTime = event.timestamp * 1000;
        if (eventTime <= latestTimestamp) {
          continue;
        }

        // Map Mailgun events to our status values
        // Priority: opened > delivered > failed > pending
        switch (event.event) {
          case 'opened':
            newStatus = 'opened';
            latestTimestamp = eventTime;
            break;
          case 'delivered':
            if (newStatus !== 'opened') {
              newStatus = 'delivered';
              latestTimestamp = eventTime;
            }
            break;
          case 'failed':
          case 'rejected':
          case 'bounced':
            if (newStatus !== 'opened' && newStatus !== 'delivered') {
              newStatus = 'failed';
              latestTimestamp = eventTime;
            }
            break;
        }
      }

      // Update if status changed
      if (newStatus !== recipient.emailStatus) {
        await this.recipientRepo.update(recipient.id, {
          emailStatus: newStatus,
          emailStatusUpdatedAt: new Date(latestTimestamp),
        });
        this.logger.debug(
          `Updated recipient ${recipient.id} status to ${newStatus}`
        );
      }
    } catch (error) {
      // Log but don't fail - events API may have rate limits
      this.logger.debug(
        `Could not fetch events for message ${messageId}: ${
          (error as Error).message
        }`
      );
    }
  }

  /**
   * Manually refresh status for a recipient by message ID.
   */
  async refreshRecipientStatus(recipientId: string): Promise<void> {
    const recipient = await this.recipientRepo.findOne({
      where: { id: recipientId },
    });

    if (!recipient) {
      throw new Error(`Recipient not found: ${recipientId}`);
    }

    const client = this.getClient();
    if (!client) {
      throw new Error('Email is disabled');
    }

    await this.updateSingleRecipientStatus(client, recipient);
  }
}
