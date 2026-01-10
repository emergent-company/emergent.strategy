import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailgunProvider } from '../../email/mailgun.provider';
import { ReleaseNotification } from '../entities/release-notification.entity';
import {
  ReleaseNotificationRecipient,
  EmailDeliveryStatus,
} from '../entities/release-notification-recipient.entity';

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
 * Service for checking release notification delivery status via Mailgun Logs API.
 */
@Injectable()
export class ReleaseStatusService {
  private readonly logger = new Logger(ReleaseStatusService.name);
  private readonly MAX_SYNC_HOURS = 72;

  constructor(
    @InjectRepository(ReleaseNotification)
    private readonly releaseRepo: Repository<ReleaseNotification>,
    @InjectRepository(ReleaseNotificationRecipient)
    private readonly recipientRepo: Repository<ReleaseNotificationRecipient>,
    private readonly mailgunProvider: MailgunProvider
  ) {}

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
   * Update recipient statuses from Mailgun Logs API.
   * Only syncs emails sent within the last 72 hours.
   */
  private async updateRecipientStatuses(
    recipients: ReleaseNotificationRecipient[]
  ): Promise<void> {
    const cutoffDate = new Date(
      Date.now() - this.MAX_SYNC_HOURS * 60 * 60 * 1000
    );

    // Filter recipients with message IDs that need status check
    // Only sync emails sent within the last 72 hours
    const toCheck = recipients.filter(
      (r) =>
        r.mailgunMessageId &&
        r.emailSentAt &&
        r.emailSentAt >= cutoffDate &&
        r.emailStatus !== 'failed' &&
        r.emailStatus !== 'opened'
    );

    if (toCheck.length === 0) {
      return;
    }

    for (const recipient of toCheck) {
      try {
        await this.updateSingleRecipientStatus(recipient);
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
   * Update status for a single recipient using MailgunProvider.
   */
  private async updateSingleRecipientStatus(
    recipient: ReleaseNotificationRecipient
  ): Promise<void> {
    if (!recipient.mailgunMessageId) {
      return;
    }

    try {
      // Use MailgunProvider to get events for this message
      const result = await this.mailgunProvider.getEventsForMessage(
        recipient.mailgunMessageId,
        { sentAt: recipient.emailSentAt }
      );

      if (!result.success || !result.events || result.events.length === 0) {
        if (result.error) {
          this.logger.debug(
            `Could not fetch events for message ${recipient.mailgunMessageId}: ${result.error}`
          );
        }
        return;
      }

      // Find the most significant event
      let newStatus: EmailDeliveryStatus = recipient.emailStatus;
      let latestTimestamp = 0;

      for (const event of result.events) {
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
      // Log but don't fail - Logs API may have rate limits
      this.logger.debug(
        `Could not fetch events for message ${recipient.mailgunMessageId}: ${
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

    await this.updateSingleRecipientStatus(recipient);
  }
}
