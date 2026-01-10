import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailJob, EmailDeliveryStatus } from '../../entities/email-job.entity';
import { MailgunProvider, MailgunEvent } from './mailgun.provider';
import { EmailConfig } from './email.config';
import { DatabaseService } from '../../common/database/database.service';

const MAILGUN_EVENT_TO_STATUS: Record<string, EmailDeliveryStatus> = {
  delivered: 'delivered',
  opened: 'opened',
  clicked: 'clicked',
  bounced: 'bounced',
  complained: 'complained',
  unsubscribed: 'unsubscribed',
  failed: 'failed',
};

const STATUS_PRIORITY: Record<EmailDeliveryStatus, number> = {
  pending: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  soft_bounced: 4,
  bounced: 5,
  complained: 6,
  unsubscribed: 7,
  failed: 8,
};

@Injectable()
export class EmailStatusSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailStatusSyncService.name);
  private running = false;
  private syncInProgress = false;
  private readonly BATCH_SIZE = 50;
  private readonly MAX_SYNC_HOURS = 72;
  private readonly SYNC_INTERVAL_MINUTES = 15;

  constructor(
    @InjectRepository(EmailJob)
    private readonly emailJobRepo: Repository<EmailJob>,
    private readonly mailgun: MailgunProvider,
    private readonly config: EmailConfig,
    private readonly db: DatabaseService
  ) {}

  onModuleInit() {
    if (!this.config.enabled) {
      this.logger.log('Email status sync not started (EMAIL_ENABLED=false)');
      return;
    }

    if (!this.db.isOnline()) {
      this.logger.warn('Database offline at init; email status sync disabled.');
      return;
    }

    if (
      process.env.NODE_ENV === 'test' &&
      process.env.ENABLE_WORKERS_IN_TESTS !== 'true'
    ) {
      this.logger.debug('Email status sync disabled during tests');
      return;
    }

    this.running = true;
    this.logger.log('Email status sync service started');
  }

  onModuleDestroy() {
    this.running = false;
    this.logger.log('Email status sync service stopped');
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async scheduledSync(): Promise<void> {
    if (!this.running || this.syncInProgress) {
      return;
    }
    await this.syncDeliveryStatuses();
  }

  async syncDeliveryStatuses(): Promise<{ synced: number; errors: number }> {
    if (this.syncInProgress) {
      this.logger.debug('Sync already in progress, skipping');
      return { synced: 0, errors: 0 };
    }

    this.syncInProgress = true;
    let synced = 0;
    let errors = 0;

    try {
      const cutoffDate = new Date(
        Date.now() - this.MAX_SYNC_HOURS * 60 * 60 * 1000
      );
      const syncThreshold = new Date(
        Date.now() - this.SYNC_INTERVAL_MINUTES * 60 * 1000
      );

      const jobsToSync = await this.emailJobRepo
        .createQueryBuilder('job')
        .where('job.status = :status', { status: 'sent' })
        .andWhere('job.mailgunMessageId IS NOT NULL')
        .andWhere('job.createdAt >= :cutoff', { cutoff: cutoffDate })
        .andWhere(
          '(job.deliveryStatusSyncedAt IS NULL OR job.deliveryStatusSyncedAt < :syncThreshold)',
          { syncThreshold }
        )
        .orderBy('job.createdAt', 'DESC')
        .take(this.BATCH_SIZE)
        .getMany();

      if (jobsToSync.length === 0) {
        this.logger.debug('No email jobs to sync');
        return { synced: 0, errors: 0 };
      }

      this.logger.debug(
        `Syncing delivery status for ${jobsToSync.length} email(s)`
      );

      for (const job of jobsToSync) {
        try {
          const updated = await this.syncJobStatus(job);
          if (updated) synced++;
        } catch (err) {
          errors++;
          this.logger.warn(
            `Failed to sync status for job ${job.id}: ${(err as Error).message}`
          );
        }
      }

      if (synced > 0 || errors > 0) {
        this.logger.log(
          `Email status sync complete: ${synced} updated, ${errors} errors`
        );
      }

      return { synced, errors };
    } finally {
      this.syncInProgress = false;
    }
  }

  private async syncJobStatus(job: EmailJob): Promise<boolean> {
    if (!job.mailgunMessageId) {
      return false;
    }

    const result = await this.mailgun.getEventsForMessage(job.mailgunMessageId);

    if (!result.success || !result.events) {
      throw new Error(result.error || 'Failed to fetch events');
    }

    await this.emailJobRepo.update(job.id, {
      deliveryStatusSyncedAt: new Date(),
    });

    if (result.events.length === 0) {
      return false;
    }

    const { status, timestamp } = this.determineDeliveryStatus(result.events);

    if (!status) {
      return false;
    }

    const currentPriority = job.deliveryStatus
      ? STATUS_PRIORITY[job.deliveryStatus]
      : -1;
    const newPriority = STATUS_PRIORITY[status];

    if (newPriority <= currentPriority) {
      return false;
    }

    await this.emailJobRepo.update(job.id, {
      deliveryStatus: status,
      deliveryStatusAt: timestamp,
    });

    this.logger.debug(
      `Updated job ${job.id} delivery status: ${
        job.deliveryStatus || 'null'
      } -> ${status}`
    );

    return true;
  }

  private determineDeliveryStatus(events: MailgunEvent[]): {
    status: EmailDeliveryStatus | null;
    timestamp: Date | null;
  } {
    let bestStatus: EmailDeliveryStatus | null = null;
    let bestPriority = -1;
    let bestTimestamp: Date | null = null;

    for (const event of events) {
      let status = MAILGUN_EVENT_TO_STATUS[event.event];

      if (!status) {
        if (event.event === 'temporary-fail') {
          status = 'soft_bounced';
        } else {
          continue;
        }
      }

      const priority = STATUS_PRIORITY[status];
      if (priority > bestPriority) {
        bestPriority = priority;
        bestStatus = status;
        bestTimestamp = new Date(event.timestamp * 1000);
      }
    }

    return { status: bestStatus, timestamp: bestTimestamp };
  }

  async manualSync(jobId: string): Promise<boolean> {
    const job = await this.emailJobRepo.findOne({ where: { id: jobId } });
    if (!job) {
      throw new Error(`Email job ${jobId} not found`);
    }
    return this.syncJobStatus(job);
  }
}
