import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, IsNull } from 'typeorm';
import {
  ReleaseNotification,
  ReleaseTargetMode,
  ReleaseStatus,
} from '../entities/release-notification.entity';
import { ReleaseNotificationRecipient } from '../entities/release-notification-recipient.entity';
import { ReleaseNotificationState } from '../entities/release-notification-state.entity';
import { UserProfile } from '../../../entities/user-profile.entity';
import { UserEmail } from '../../../entities/user-email.entity';
import { ProjectMembership } from '../../../entities/project-membership.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  NotificationCategory,
  NotificationImportance,
  NotificationSourceType,
} from '../../notifications/dto/create-notification.dto';
import { EmailTemplateService } from '../../email/email-template.service';
import { MailgunProvider } from '../../email/mailgun.provider';
import { EmailService } from '../../email/email.service';
import { ZitadelService } from '../../auth/zitadel.service';
import { UserEmailPreferencesService } from '../../user-email-preferences/user-email-preferences.service';
import {
  ChangelogResult,
  StructuredChangelog,
} from './release-changelog.service';

/**
 * Options for sending release notifications.
 */
export interface SendNotificationOptions {
  /** Target a single user by ID */
  userId?: string;
  /** Target all members of a project */
  projectId?: string;
  /** Target all users */
  allUsers?: boolean;
  /** Allow expanding audience to include more recipients */
  expandAudience?: boolean;
  /** Force send even if within debounce window */
  force?: boolean;
  /** Preview mode - don't actually send */
  dryRun?: boolean;
  /** User ID of who triggered this notification */
  triggeredBy?: string;
}

/**
 * Result from sending notifications.
 */
export interface SendNotificationResult {
  success: boolean;
  releaseId?: string;
  version?: string;
  recipientCount: number;
  emailsSent: number;
  emailsFailed: number;
  inAppSent: number;
  skippedUsers: number;
  error?: string;
  dryRun: boolean;
  recipients?: RecipientResult[];
}

/**
 * Per-recipient result.
 */
export interface RecipientResult {
  userId: string;
  email?: string;
  displayName?: string;
  emailSent: boolean;
  emailMessageId?: string;
  emailError?: string;
  inAppSent: boolean;
  inAppNotificationId?: string;
  skipped: boolean;
  skipReason?: string;
}

export interface CreateReleaseResult {
  success: boolean;
  releaseId?: string;
  version?: string;
  error?: string;
}

export interface SendForReleaseOptions {
  userId?: string;
  projectId?: string;
  allUsers?: boolean;
  dryRun?: boolean;
  force?: boolean;
  resend?: boolean;
}

const MIN_NOTIFICATION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Service for sending release notifications to users.
 *
 * This service:
 * 1. Resolves target users based on targeting mode
 * 2. Sends email notifications via Mailgun
 * 3. Creates in-app notifications
 * 4. Tracks delivery status in database
 * 5. Prevents duplicate notifications
 */
@Injectable()
export class ReleaseNotificationsService {
  private readonly logger = new Logger(ReleaseNotificationsService.name);

  constructor(
    @InjectRepository(ReleaseNotification)
    private readonly releaseRepo: Repository<ReleaseNotification>,
    @InjectRepository(ReleaseNotificationRecipient)
    private readonly recipientRepo: Repository<ReleaseNotificationRecipient>,
    @InjectRepository(ReleaseNotificationState)
    private readonly stateRepo: Repository<ReleaseNotificationState>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepo: Repository<UserProfile>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepo: Repository<UserEmail>,
    @InjectRepository(ProjectMembership)
    private readonly projectMembershipRepo: Repository<ProjectMembership>,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly mailgunProvider: MailgunProvider,
    private readonly emailService: EmailService,
    private readonly zitadelService: ZitadelService,
    private readonly userEmailPreferencesService: UserEmailPreferencesService
  ) {}

  /**
   * Send release notifications for a changelog.
   */
  async sendNotifications(
    changelog: ChangelogResult,
    options: SendNotificationOptions
  ): Promise<SendNotificationResult> {
    const { dryRun = false, force = false, expandAudience = false } = options;

    // Validate targeting options
    const targetCount = [
      options.userId,
      options.projectId,
      options.allUsers,
    ].filter(Boolean).length;
    if (targetCount !== 1) {
      return {
        success: false,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error:
          'Must specify exactly one of: --user-id, --project-id, or --all-users',
        dryRun,
      };
    }

    // Check debounce window
    if (!force) {
      const lastNotification = await this.getLastNotification();
      if (lastNotification) {
        const timeSinceLastMs =
          Date.now() - lastNotification.createdAt.getTime();
        if (timeSinceLastMs < MIN_NOTIFICATION_INTERVAL_MS) {
          const minutesRemaining = Math.ceil(
            (MIN_NOTIFICATION_INTERVAL_MS - timeSinceLastMs) / 60000
          );
          return {
            success: false,
            recipientCount: 0,
            emailsSent: 0,
            emailsFailed: 0,
            inAppSent: 0,
            skippedUsers: 0,
            error: `Debounce: Last notification sent ${Math.floor(
              timeSinceLastMs / 60000
            )} minutes ago. Wait ${minutesRemaining} more minutes or use --force.`,
            dryRun,
          };
        }
      }
    }

    // Determine target mode
    const targetMode: ReleaseTargetMode = options.userId
      ? 'single'
      : options.projectId
      ? 'project'
      : 'all';
    const targetId = options.userId || options.projectId || undefined;

    // Check for existing release with same commit range
    const existingRelease = await this.findExistingRelease(
      changelog.fromCommit,
      changelog.toCommit,
      targetMode,
      targetId
    );

    if (existingRelease && !expandAudience) {
      return {
        success: false,
        releaseId: existingRelease.id,
        version: existingRelease.version,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error: `Already sent to ${
          targetMode === 'all'
            ? 'all users'
            : targetMode === 'single'
            ? 'this user'
            : 'this project'
        }. Use --expand-audience to send to additional recipients.`,
        dryRun,
      };
    }

    // Get target users
    const targetUsers = await this.resolveTargetUsers(
      targetMode,
      targetId,
      existingRelease?.id
    );

    if (targetUsers.length === 0) {
      return {
        success: true,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error:
          expandAudience && existingRelease
            ? 'All users already notified for this release.'
            : 'No users found for the specified target.',
        dryRun,
      };
    }

    // Dry run - just return what would happen
    if (dryRun) {
      return {
        success: true,
        version: changelog.version,
        recipientCount: targetUsers.length,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        dryRun: true,
        recipients: targetUsers.map((u) => ({
          userId: u.id,
          email: u.email,
          displayName: u.displayName || undefined,
          emailSent: false,
          inAppSent: false,
          skipped: false,
        })),
      };
    }

    // Acquire lock and send notifications
    return this.sendWithLock(
      changelog,
      targetUsers,
      targetMode,
      targetId,
      options.triggeredBy,
      existingRelease?.id
    );
  }

  /**
   * Get the last notification state.
   */
  async getNotificationState(
    branch: string = 'main'
  ): Promise<ReleaseNotificationState | null> {
    return this.stateRepo.findOne({ where: { branch } });
  }

  /**
   * Update the notification state after successful send.
   */
  async updateNotificationState(
    commit: string,
    branch: string = 'main'
  ): Promise<void> {
    const existing = await this.stateRepo.findOne({ where: { branch } });

    if (existing) {
      await this.stateRepo.update(existing.id, {
        lastNotifiedCommit: commit,
        lastNotifiedAt: new Date(),
      });
    } else {
      await this.stateRepo.save({
        branch,
        lastNotifiedCommit: commit,
        lastNotifiedAt: new Date(),
      });
    }
  }

  /**
   * Reset the notification state (for history rewrites).
   */
  async resetNotificationState(branch: string = 'main'): Promise<void> {
    await this.stateRepo.delete({ branch });
    this.logger.log(`Reset notification state for branch: ${branch}`);
  }

  /**
   * Get a release by ID.
   */
  async getReleaseById(id: string): Promise<ReleaseNotification | null> {
    return this.releaseRepo.findOne({
      where: { id },
      relations: ['recipients'],
    });
  }

  /**
   * Get the latest release.
   */
  async getLatestRelease(): Promise<ReleaseNotification | null> {
    return this.releaseRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
      relations: ['recipients'],
    });
  }

  /**
   * Get releases with pagination.
   */
  async getReleases(
    limit: number = 10,
    offset: number = 0
  ): Promise<ReleaseNotification[]> {
    return this.releaseRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get release by version.
   */
  async getReleaseByVersion(
    version: string
  ): Promise<ReleaseNotification | null> {
    return this.releaseRepo.findOne({
      where: { version },
      relations: ['recipients'],
    });
  }

  async createRelease(
    changelog: ChangelogResult,
    triggeredBy?: string
  ): Promise<CreateReleaseResult> {
    try {
      const release = this.releaseRepo.create({
        version: changelog.version,
        fromCommit: changelog.fromCommit,
        toCommit: changelog.toCommit,
        commitCount: changelog.commitCount,
        changelogJson: changelog.changelogJson,
        targetMode: 'all' as ReleaseTargetMode,
        status: 'draft' as ReleaseStatus,
        createdBy: triggeredBy,
      });

      const saved = await this.releaseRepo.save(release);

      this.logger.log(`Created draft release ${saved.version} (${saved.id})`);

      return {
        success: true,
        releaseId: saved.id,
        version: saved.version,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to create release: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async deleteRelease(
    idOrVersion: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const release = await this.findReleaseByIdOrVersion(idOrVersion);

      if (!release) {
        return {
          success: false,
          error: `Release not found: ${idOrVersion}`,
        };
      }

      if (release.status === 'published') {
        return {
          success: false,
          error: 'Cannot delete a published release',
        };
      }

      await this.releaseRepo.delete({ id: release.id });

      this.logger.log(`Deleted release ${release.version} (${release.id})`);

      return { success: true };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to delete release: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  }

  async sendNotificationsForRelease(
    releaseIdOrVersion: string,
    options: SendForReleaseOptions
  ): Promise<SendNotificationResult> {
    const { dryRun = false, force = false, resend = false } = options;

    const targetCount = [
      options.userId,
      options.projectId,
      options.allUsers,
    ].filter(Boolean).length;
    if (targetCount !== 1) {
      return {
        success: false,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error:
          'Must specify exactly one of: --user-id, --project-id, or --all-users',
        dryRun,
      };
    }

    const release = await this.findReleaseByIdOrVersion(releaseIdOrVersion);
    if (!release) {
      return {
        success: false,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error: `Release not found: ${releaseIdOrVersion}`,
        dryRun,
      };
    }

    if (!force) {
      const lastPublished = await this.getLastPublishedRelease();
      if (lastPublished && lastPublished.id !== release.id) {
        const timeSinceLastMs = Date.now() - lastPublished.createdAt.getTime();
        if (timeSinceLastMs < MIN_NOTIFICATION_INTERVAL_MS) {
          const minutesRemaining = Math.ceil(
            (MIN_NOTIFICATION_INTERVAL_MS - timeSinceLastMs) / 60000
          );
          return {
            success: false,
            recipientCount: 0,
            emailsSent: 0,
            emailsFailed: 0,
            inAppSent: 0,
            skippedUsers: 0,
            error: `Debounce: Last notification sent ${Math.floor(
              timeSinceLastMs / 60000
            )} minutes ago. Wait ${minutesRemaining} more minutes or use --force.`,
            dryRun,
          };
        }
      }
    }

    const targetMode: ReleaseTargetMode = options.userId
      ? 'single'
      : options.projectId
      ? 'project'
      : 'all';
    const targetId = options.userId || options.projectId || undefined;

    const existingReleaseId = resend ? undefined : release.id;
    const targetUsers = await this.resolveTargetUsers(
      targetMode,
      targetId,
      existingReleaseId
    );

    if (targetUsers.length === 0) {
      return {
        success: true,
        releaseId: release.id,
        version: release.version,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error: resend
          ? 'No users found for resend.'
          : 'All users already notified for this release.',
        dryRun,
      };
    }

    if (dryRun) {
      return {
        success: true,
        releaseId: release.id,
        version: release.version,
        recipientCount: targetUsers.length,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        dryRun: true,
        recipients: targetUsers.map((u) => ({
          userId: u.id,
          email: u.email,
          displayName: u.displayName || undefined,
          emailSent: false,
          inAppSent: false,
          skipped: false,
        })),
      };
    }

    return this.sendForExistingRelease(
      release,
      targetUsers,
      targetMode,
      targetId,
      resend
    );
  }

  async resendToUsers(
    releaseIdOrVersion: string,
    userIds: string[],
    dryRun: boolean = false
  ): Promise<SendNotificationResult> {
    const release = await this.findReleaseByIdOrVersion(releaseIdOrVersion);
    if (!release) {
      return {
        success: false,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error: `Release not found: ${releaseIdOrVersion}`,
        dryRun,
      };
    }

    const targetUsers = await this.resolveTargetUsers('single', undefined);
    const filteredUsers = targetUsers.filter((u) => userIds.includes(u.id));

    if (filteredUsers.length === 0) {
      return {
        success: false,
        recipientCount: 0,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        error: 'No valid users found for resend.',
        dryRun,
      };
    }

    if (dryRun) {
      return {
        success: true,
        releaseId: release.id,
        version: release.version,
        recipientCount: filteredUsers.length,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        skippedUsers: 0,
        dryRun: true,
        recipients: filteredUsers.map((u) => ({
          userId: u.id,
          email: u.email,
          displayName: u.displayName || undefined,
          emailSent: false,
          inAppSent: false,
          skipped: false,
        })),
      };
    }

    return this.sendForExistingRelease(
      release,
      filteredUsers,
      'single',
      undefined,
      true
    );
  }

  private async findReleaseByIdOrVersion(
    idOrVersion: string
  ): Promise<ReleaseNotification | null> {
    if (idOrVersion.match(/^[0-9a-f-]{36}$/i)) {
      return this.getReleaseById(idOrVersion);
    }
    return this.getReleaseByVersion(idOrVersion);
  }

  private async getLastPublishedRelease(): Promise<ReleaseNotification | null> {
    return this.releaseRepo.findOne({
      where: { status: 'published' as ReleaseStatus },
      order: { createdAt: 'DESC' },
    });
  }

  private async sendForExistingRelease(
    release: ReleaseNotification,
    targetUsers: Array<{
      id: string;
      email?: string;
      displayName?: string | null;
    }>,
    targetMode: ReleaseTargetMode,
    targetId: string | undefined,
    isResend: boolean
  ): Promise<SendNotificationResult> {
    const recipients: RecipientResult[] = [];
    let emailsSent = 0;
    let emailsFailed = 0;
    let inAppSent = 0;
    let skippedUsers = 0;

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `SELECT * FROM kb.release_notification_state 
           WHERE branch = 'main' 
           FOR UPDATE NOWAIT`
        );

        if (release.status === 'draft') {
          await manager.update(ReleaseNotification, release.id, {
            status: 'published' as ReleaseStatus,
            targetMode,
            targetId,
          });
        }

        const changelog: StructuredChangelog = {
          summary: '',
          features: release.changelogJson.features.map((f) => ({
            title: f,
          })),
          improvements: release.changelogJson.improvements.map((i) => ({
            title: i,
          })),
          bugFixes: release.changelogJson.fixes.map((f) => ({ title: f })),
          breakingChanges: [],
        };

        const adminUrl = process.env.ADMIN_URL || 'http://localhost:5176';
        const emailContext = this.buildEmailContext(
          changelog,
          release.version,
          release.fromCommit,
          release.toCommit,
          adminUrl
        );

        for (const user of targetUsers) {
          const recipientResult: RecipientResult = {
            userId: user.id,
            email: user.email,
            displayName: user.displayName || undefined,
            emailSent: false,
            inAppSent: false,
            skipped: false,
          };

          try {
            if (!isResend) {
              const inAppNotification = await this.notificationsService.create({
                subject_id: user.id,
                category: NotificationCategory.RELEASE_DEPLOYED,
                importance: NotificationImportance.OTHER,
                title: `New Release: ${release.version}`,
                message: `Release ${release.version} is now available.`,
                details: {
                  version: release.version,
                  fromCommit: release.fromCommit,
                  toCommit: release.toCommit,
                  changelog: release.changelogJson,
                },
                source_type: NotificationSourceType.RELEASE,
                source_id: release.id,
                action_url: `/releases/${release.version}`,
                action_label: 'View Release Notes',
              });

              if (inAppNotification) {
                recipientResult.inAppSent = true;
                recipientResult.inAppNotificationId = inAppNotification.id;
                inAppSent++;
              }
            }

            if (user.email) {
              const releaseEmailsEnabled =
                await this.userEmailPreferencesService.isReleaseEmailsEnabled(
                  user.id
                );

              if (!releaseEmailsEnabled) {
                recipientResult.skipped = true;
                recipientResult.skipReason = 'User opted out of release emails';
                skippedUsers++;
              } else {
                const unsubscribeToken =
                  await this.userEmailPreferencesService.getOrCreateUnsubscribeToken(
                    user.id
                  );
                const unsubscribeUrl = `${adminUrl}/unsubscribe/${unsubscribeToken}`;

                const personalizedContext = {
                  ...emailContext,
                  recipientName: user.displayName,
                  unsubscribeUrl,
                };

                // Queue email via unified email job system
                const emailResult = await this.emailService.sendTemplatedEmail({
                  templateName: 'release-notification',
                  toEmail: user.email,
                  toName: user.displayName || undefined,
                  subject: `[Emergent] New Release: ${release.version}`,
                  templateData: personalizedContext,
                  sourceType: 'release-notification',
                  sourceId: release.id,
                });

                if (emailResult.queued) {
                  recipientResult.emailSent = true;
                  recipientResult.emailMessageId = emailResult.jobId;
                  emailsSent++;
                } else {
                  recipientResult.emailError = emailResult.error;
                  emailsFailed++;
                }
              }
            } else {
              recipientResult.skipReason = 'No email address';
              skippedUsers++;
            }

            if (!isResend) {
              await manager.save(ReleaseNotificationRecipient, {
                releaseNotificationId: release.id,
                userId: user.id,
                emailSent: recipientResult.emailSent,
                emailSentAt: recipientResult.emailSent ? new Date() : undefined,
                emailJobId: recipientResult.emailMessageId,
                inAppNotificationId: recipientResult.inAppNotificationId,
              });
            } else {
              await manager
                .createQueryBuilder()
                .update(ReleaseNotificationRecipient)
                .set({
                  emailSent: recipientResult.emailSent,
                  emailSentAt: recipientResult.emailSent
                    ? new Date()
                    : undefined,
                  emailJobId: recipientResult.emailMessageId,
                })
                .where('release_notification_id = :releaseId', {
                  releaseId: release.id,
                })
                .andWhere('user_id = :userId', { userId: user.id })
                .execute();
            }
          } catch (error) {
            this.logger.error(
              `Failed to notify user ${user.id}: ${(error as Error).message}`
            );
            recipientResult.emailError = (error as Error).message;
            emailsFailed++;
          }

          recipients.push(recipientResult);
        }

        await manager.query(
          `UPDATE kb.release_notification_state 
           SET last_notified_commit = $1, last_notified_at = NOW(), updated_at = NOW() 
           WHERE branch = 'main'`,
          [release.toCommit]
        );

        return {
          success: true,
          releaseId: release.id,
          version: release.version,
          recipientCount: targetUsers.length,
          emailsSent,
          emailsFailed,
          inAppSent,
          skippedUsers,
          dryRun: false,
          recipients,
        };
      });
    } catch (error) {
      const err = error as Error;

      if (err.message.includes('could not obtain lock')) {
        return {
          success: false,
          recipientCount: 0,
          emailsSent: 0,
          emailsFailed: 0,
          inAppSent: 0,
          skippedUsers: 0,
          error: 'Another release notification is in progress. Please wait.',
          dryRun: false,
        };
      }

      this.logger.error(`Failed to send notifications: ${err.message}`);
      return {
        success: false,
        recipientCount: 0,
        emailsSent,
        emailsFailed,
        inAppSent,
        skippedUsers,
        error: err.message,
        dryRun: false,
        recipients,
      };
    }
  }

  // ---------- Private Methods ----------

  /**
   * Get the most recent notification for debounce check.
   */
  private async getLastNotification(): Promise<ReleaseNotification | null> {
    return this.releaseRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find an existing release with the same commit range and target.
   */
  private async findExistingRelease(
    fromCommit: string,
    toCommit: string,
    targetMode: ReleaseTargetMode,
    targetId?: string
  ): Promise<ReleaseNotification | null> {
    const query: any = {
      fromCommit,
      toCommit,
      targetMode,
    };

    if (targetId) {
      query.targetId = targetId;
    }

    return this.releaseRepo.findOne({ where: query });
  }

  /**
   * Resolve target users based on targeting mode.
   * Falls back to Zitadel API for users without email in local database.
   */
  private async resolveTargetUsers(
    targetMode: ReleaseTargetMode,
    targetId?: string,
    existingReleaseId?: string
  ): Promise<
    Array<{ id: string; email?: string; displayName?: string | null }>
  > {
    let userIds: string[] = [];

    if (targetMode === 'single' && targetId) {
      userIds = [targetId];
    } else if (targetMode === 'project' && targetId) {
      // Get all members of the project
      const memberships = await this.projectMembershipRepo.find({
        where: { projectId: targetId },
        select: ['userId'],
      });
      userIds = memberships.map((m) => m.userId);
    } else if (targetMode === 'all') {
      // Get all active users
      const users = await this.userProfileRepo.find({
        where: { deletedAt: IsNull() },
        select: ['id'],
      });
      userIds = users.map((u) => u.id);
    }

    // If expanding audience, exclude users who already received this release
    if (existingReleaseId) {
      const existingRecipients = await this.recipientRepo.find({
        where: { releaseNotificationId: existingReleaseId },
        select: ['userId'],
      });
      const notifiedUserIds = new Set(existingRecipients.map((r) => r.userId));
      userIds = userIds.filter((id) => !notifiedUserIds.has(id));
    }

    if (userIds.length === 0) {
      return [];
    }

    // Get user profiles with zitadelUserId for fallback lookup
    const users = await this.userProfileRepo.find({
      where: { id: In(userIds), deletedAt: IsNull() },
      select: ['id', 'zitadelUserId', 'displayName', 'firstName', 'lastName'],
    });

    // Get primary emails for users
    const emails = await this.userEmailRepo.find({
      where: { userId: In(userIds), verified: true },
    });

    // Map userId to email (use first verified email)
    const emailMap = new Map<string, string>();
    for (const email of emails) {
      if (!emailMap.has(email.userId)) {
        emailMap.set(email.userId, email.email);
      }
    }

    // Find users without emails in local database
    const usersWithoutEmail = users.filter(
      (u) => !emailMap.has(u.id) && u.zitadelUserId
    );

    // Map userId to display name from Zitadel (for users without local name)
    const zitadelNameMap = new Map<string, string>();

    // Fetch emails from Zitadel for users without local email
    if (usersWithoutEmail.length > 0) {
      this.logger.log(
        `Fetching ${usersWithoutEmail.length} emails from Zitadel...`
      );
      this.logger.log(
        `Fetching ${usersWithoutEmail.length} emails from Zitadel...`
      );

      // Fetch in parallel with concurrency limit
      const BATCH_SIZE = 10;
      for (let i = 0; i < usersWithoutEmail.length; i += BATCH_SIZE) {
        const batch = usersWithoutEmail.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (user) => {
            try {
              const zitadelUser = await this.zitadelService.getUserById(
                user.zitadelUserId
              );
              if (zitadelUser) {
                const displayName =
                  zitadelUser.profile?.displayName ||
                  zitadelUser.profile?.firstName ||
                  zitadelUser.userName;
                return {
                  userId: user.id,
                  email: zitadelUser.email,
                  displayName,
                };
              }
              return null;
            } catch (error) {
              this.logger.debug(
                `Failed to fetch Zitadel user ${user.zitadelUserId}: ${
                  (error as Error).message
                }`
              );
              return null;
            }
          })
        );

        // Add fetched data to maps
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            if (result.value.email) {
              emailMap.set(result.value.userId, result.value.email);
            }
            if (result.value.displayName) {
              zitadelNameMap.set(result.value.userId, result.value.displayName);
            }
          }
        }
      }

      const fetchedCount = usersWithoutEmail.filter((u) =>
        emailMap.has(u.id)
      ).length;
      this.logger.log(
        `Fetched ${fetchedCount}/${usersWithoutEmail.length} emails from Zitadel`
      );
    }

    return users.map((u) => ({
      id: u.id,
      email: emailMap.get(u.id),
      displayName:
        u.displayName || u.firstName || zitadelNameMap.get(u.id) || null,
    }));
  }

  /**
   * Send notifications with database lock to prevent concurrent runs.
   */
  private async sendWithLock(
    changelog: ChangelogResult,
    targetUsers: Array<{
      id: string;
      email?: string;
      displayName?: string | null;
    }>,
    targetMode: ReleaseTargetMode,
    targetId: string | undefined,
    triggeredBy: string | undefined,
    existingReleaseId?: string
  ): Promise<SendNotificationResult> {
    const recipients: RecipientResult[] = [];
    let emailsSent = 0;
    let emailsFailed = 0;
    let inAppSent = 0;
    let skippedUsers = 0;

    try {
      // Use transaction with row-level lock
      return await this.dataSource.transaction(async (manager) => {
        // Try to acquire lock on state row
        const lockResult = await manager.query(
          `SELECT * FROM kb.release_notification_state 
           WHERE branch = 'main' 
           FOR UPDATE NOWAIT`
        );

        // If no state exists, create one (first run)
        if (!lockResult || lockResult.length === 0) {
          await manager.query(
            `INSERT INTO kb.release_notification_state (branch, last_notified_commit, last_notified_at) 
             VALUES ('main', $1, NOW())`,
            [changelog.toCommit]
          );
        }

        // Create or reuse release record
        let releaseId: string;
        let version: string;

        if (existingReleaseId) {
          // Expanding audience - reuse existing release
          releaseId = existingReleaseId;
          const existing = await manager.findOne(ReleaseNotification, {
            where: { id: existingReleaseId },
          });
          version = existing?.version || changelog.version;
        } else {
          // Create new release
          const release = manager.create(ReleaseNotification, {
            version: changelog.version,
            fromCommit: changelog.fromCommit,
            toCommit: changelog.toCommit,
            commitCount: changelog.commitCount,
            changelogJson: changelog.changelogJson,
            targetMode,
            targetId,
            createdBy: triggeredBy,
          });
          const saved = await manager.save(release);
          releaseId = saved.id;
          version = saved.version;
        }

        // Render email template once
        const adminUrl = process.env.ADMIN_URL || 'http://localhost:5176';
        const emailContext = this.buildEmailContext(
          changelog.changelog,
          version,
          changelog.fromCommit,
          changelog.toCommit,
          adminUrl
        );

        // Send to each user
        for (const user of targetUsers) {
          const recipientResult: RecipientResult = {
            userId: user.id,
            email: user.email,
            displayName: user.displayName || undefined,
            emailSent: false,
            inAppSent: false,
            skipped: false,
          };

          try {
            // Create in-app notification
            const inAppNotification = await this.notificationsService.create({
              subject_id: user.id,
              category: NotificationCategory.RELEASE_DEPLOYED,
              importance: NotificationImportance.OTHER,
              title: `New Release: ${version}`,
              message: changelog.changelog.summary,
              details: {
                version,
                fromCommit: changelog.fromCommit,
                toCommit: changelog.toCommit,
                changelog: changelog.changelogJson,
              },
              source_type: NotificationSourceType.RELEASE,
              source_id: releaseId,
              action_url: `/releases/${version}`,
              action_label: 'View Release Notes',
            });

            if (inAppNotification) {
              recipientResult.inAppSent = true;
              recipientResult.inAppNotificationId = inAppNotification.id;
              inAppSent++;
            }

            // Send email if user has one
            if (user.email) {
              // Check if user has opted out of release emails
              const releaseEmailsEnabled =
                await this.userEmailPreferencesService.isReleaseEmailsEnabled(
                  user.id
                );

              if (!releaseEmailsEnabled) {
                recipientResult.skipped = true;
                recipientResult.skipReason = 'User opted out of release emails';
                skippedUsers++;
              } else {
                // Get unsubscribe token for this user
                const unsubscribeToken =
                  await this.userEmailPreferencesService.getOrCreateUnsubscribeToken(
                    user.id
                  );
                const unsubscribeUrl = `${adminUrl}/unsubscribe/${unsubscribeToken}`;

                const personalizedContext = {
                  ...emailContext,
                  recipientName: user.displayName,
                  unsubscribeUrl,
                };

                const emailResult = await this.emailService.sendTemplatedEmail({
                  templateName: 'release-notification',
                  toEmail: user.email,
                  toName: user.displayName || undefined,
                  subject: `[Emergent] New Release: ${version}`,
                  templateData: personalizedContext,
                  sourceType: 'release-notification',
                  sourceId: releaseId,
                });

                if (emailResult.queued) {
                  recipientResult.emailSent = true;
                  recipientResult.emailMessageId = emailResult.jobId;
                  emailsSent++;
                } else {
                  recipientResult.emailError = emailResult.error;
                  emailsFailed++;
                }
              }
            } else {
              recipientResult.skipReason = 'No email address';
              skippedUsers++;
            }

            // Create recipient record
            await manager.save(ReleaseNotificationRecipient, {
              releaseNotificationId: releaseId,
              userId: user.id,
              emailSent: recipientResult.emailSent,
              emailSentAt: recipientResult.emailSent ? new Date() : undefined,
              emailJobId: recipientResult.emailMessageId,
              inAppNotificationId: recipientResult.inAppNotificationId,
            });
          } catch (error) {
            this.logger.error(
              `Failed to notify user ${user.id}: ${(error as Error).message}`
            );
            recipientResult.emailError = (error as Error).message;
            emailsFailed++;
          }

          recipients.push(recipientResult);
        }

        // Update notification state
        await manager.query(
          `UPDATE kb.release_notification_state 
           SET last_notified_commit = $1, last_notified_at = NOW(), updated_at = NOW() 
           WHERE branch = 'main'`,
          [changelog.toCommit]
        );

        return {
          success: true,
          releaseId,
          version,
          recipientCount: targetUsers.length,
          emailsSent,
          emailsFailed,
          inAppSent,
          skippedUsers,
          dryRun: false,
          recipients,
        };
      });
    } catch (error) {
      const err = error as Error;

      // Check for lock acquisition failure
      if (err.message.includes('could not obtain lock')) {
        return {
          success: false,
          recipientCount: 0,
          emailsSent: 0,
          emailsFailed: 0,
          inAppSent: 0,
          skippedUsers: 0,
          error: 'Another release notification is in progress. Please wait.',
          dryRun: false,
        };
      }

      this.logger.error(`Failed to send notifications: ${err.message}`);
      return {
        success: false,
        recipientCount: 0,
        emailsSent,
        emailsFailed,
        inAppSent,
        skippedUsers,
        error: err.message,
        dryRun: false,
        recipients,
      };
    }
  }

  /**
   * Render email preview HTML for a release.
   * Returns the same HTML that would be sent in an actual email notification.
   */
  async renderEmailPreview(
    releaseIdOrVersion: string,
    recipientName?: string
  ): Promise<{ html: string; version: string } | null> {
    const release = await this.findReleaseByIdOrVersion(releaseIdOrVersion);
    if (!release) {
      return null;
    }

    const changelog: StructuredChangelog = {
      summary: '',
      features: release.changelogJson.features.map((f) => ({
        title: f,
      })),
      improvements: release.changelogJson.improvements.map((i) => ({
        title: i,
      })),
      bugFixes: release.changelogJson.fixes.map((f) => ({ title: f })),
      breakingChanges: [],
    };

    const adminUrl = process.env.ADMIN_URL || 'http://localhost:5176';
    const emailContext = this.buildEmailContext(
      changelog,
      release.version,
      release.fromCommit,
      release.toCommit,
      adminUrl
    );

    const personalizedContext = {
      ...emailContext,
      recipientName: recipientName || 'User',
      unsubscribeUrl: `${adminUrl}/unsubscribe/preview-token`,
    };

    const rendered = await this.emailTemplateService.render(
      'release-notification',
      personalizedContext
    );

    return {
      html: rendered.html,
      version: release.version,
    };
  }

  /**
   * Build email template context from changelog.
   * Shows only 50% of items per category in email; full list on release page.
   */
  private buildEmailContext(
    changelog: StructuredChangelog,
    version: string,
    fromCommit: string,
    toCommit: string,
    adminUrl: string
  ): Record<string, any> {
    const releaseDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Helper to truncate array to 50% and return remaining count
    const truncateForEmail = <T>(
      items: T[]
    ): { shown: T[]; remaining: number } => {
      if (items.length <= 2) {
        // Show all if 2 or fewer items
        return { shown: items, remaining: 0 };
      }
      const halfCount = Math.ceil(items.length / 2);
      return {
        shown: items.slice(0, halfCount),
        remaining: items.length - halfCount,
      };
    };

    const breakingChangesTrunc = truncateForEmail(changelog.breakingChanges);
    const featuresTrunc = truncateForEmail(changelog.features);
    const improvementsTrunc = truncateForEmail(changelog.improvements);
    const bugFixesTrunc = truncateForEmail(changelog.bugFixes);

    return {
      version,
      releaseDate,
      summary: changelog.summary,
      changelog: {
        breakingChanges: breakingChangesTrunc.shown,
        features: featuresTrunc.shown,
        improvements: improvementsTrunc.shown,
        bugFixes: bugFixesTrunc.shown,
      },
      breakingChangesRemaining: breakingChangesTrunc.remaining,
      featuresRemaining: featuresTrunc.remaining,
      improvementsRemaining: improvementsTrunc.remaining,
      bugFixesRemaining: bugFixesTrunc.remaining,
      releaseUrl: `${adminUrl}/releases/${version}`,
      fromCommit,
      toCommit,
      commitRange: `${fromCommit}...${toCommit}`,
    };
  }
}
