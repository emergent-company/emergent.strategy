import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  LessThan,
  MoreThan,
  IsNull,
  Not,
  DataSource,
} from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import {
  CreateNotificationDto,
  NotificationCategory,
  NotificationImportance,
  NotificationSourceType,
} from './dto/create-notification.dto';
import {
  NotificationPreferences,
  UnreadCounts,
  NotificationFilter,
  NotificationTab,
} from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Create a notification for a user
   */
  async create(data: CreateNotificationDto): Promise<Notification | null> {
    // Check user preferences
    const prefs = await this.getPreferences(data.subject_id, data.category);

    if (!prefs.in_app_enabled) {
      this.logger.debug(`Skipping notification - disabled by user preferences`);
      return null;
    }

    // Override importance if user has preferences
    let importance = data.importance || NotificationImportance.OTHER;
    if (prefs.force_important) importance = NotificationImportance.IMPORTANT;
    if (prefs.force_other) importance = NotificationImportance.OTHER;

    // Build notification entity
    const notification = this.notificationRepo.create({
      projectId: data.project_id,
      userId: data.subject_id, // Maps to user_id column (recipient)
      category: data.category,
      importance,
      title: data.title,
      message: data.message,
      details: data.details,
      sourceType: data.source_type,
      sourceId: data.source_id,
      actionUrl: data.action_url,
      actionLabel: data.action_label,
      groupKey: data.group_key,
      // New fields from migration 0005
      type: (data as any).type,
      severity: (data as any).severity || 'info',
      relatedResourceType: (data as any).related_resource_type,
      relatedResourceId: (data as any).related_resource_id,
      read: (data as any).read || false,
      dismissed: (data as any).dismissed || false,
      actions: (data as any).actions || [],
      expiresAt: (data as any).expires_at,
    });

    const savedNotification = await this.notificationRepo.save(notification);

    // TODO: Trigger real-time notification via WebSocket
    // await this.broadcastNotification(notification);

    // TODO: Send email if enabled
    // if (prefs.email_enabled && !prefs.email_digest) {
    //   await this.sendEmailNotification(notification);
    // }

    return savedNotification;
  }

  /**
   * Get notifications for a user with filtering
   */
  async getForUser(
    userId: string,
    tab: NotificationTab,
    filters: NotificationFilter = {}
  ): Promise<Notification[]> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .limit(100);

    // Tab filtering
    // Note: Using raw SQL column names (snake_case) since andWhere with raw strings
    // does not automatically translate TypeORM property names to column names
    switch (tab) {
      case 'important':
        qb.andWhere(`n.importance = 'important'`)
          .andWhere('n.cleared_at IS NULL')
          .andWhere('(n.snoozed_until IS NULL OR n.snoozed_until < now())');
        break;
      case 'other':
        qb.andWhere(`n.importance = 'other'`)
          .andWhere('n.cleared_at IS NULL')
          .andWhere('(n.snoozed_until IS NULL OR n.snoozed_until < now())');
        break;
      case 'snoozed':
        qb.andWhere('n.snoozed_until > now()').andWhere('n.cleared_at IS NULL');
        break;
      case 'cleared':
        qb.andWhere('n.cleared_at IS NOT NULL').andWhere(
          "n.cleared_at > now() - interval '30 days'"
        );
        break;
    }

    // Additional filters
    if (filters.unread_only) {
      qb.andWhere('n.read_at IS NULL');
    }

    if (filters.category && filters.category !== 'all') {
      qb.andWhere('n.category LIKE :category', {
        category: `${filters.category}%`,
      });
    }

    if (filters.search) {
      qb.andWhere('(n.title ILIKE :search OR n.message ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    return qb.getMany();
  }

  /**
   * Get unread counts per tab
   */
  async getUnreadCounts(userId: string): Promise<UnreadCounts> {
    try {
      const result = await this.notificationRepo
        .createQueryBuilder('n')
        .select([
          `COUNT(*) FILTER (WHERE importance = 'important' AND read_at IS NULL AND cleared_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < now())) as important`,
          `COUNT(*) FILTER (WHERE importance = 'other' AND read_at IS NULL AND cleared_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < now())) as other`,
          `COUNT(*) FILTER (WHERE snoozed_until > now() AND cleared_at IS NULL) as snoozed`,
        ])
        .where('n.userId = :userId', { userId })
        .getRawOne();

      const counts = {
        important: parseInt(result.important, 10) || 0,
        other: parseInt(result.other, 10) || 0,
        snoozed: parseInt(result.snoozed, 10) || 0,
      };

      return counts;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to get unread counts for user ${userId}: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markRead(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { readAt: () => 'now()' }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Mark notification as unread
   */
  async markUnread(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { readAt: null }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Dismiss notification (mark as dismissed/cleared)
   */
  async dismiss(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { clearedAt: () => 'now()' }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Get notification counts (unread, dismissed, total)
   */
  async getCounts(
    userId: string
  ): Promise<{ unread: number; dismissed: number; total: number }> {
    const result = await this.notificationRepo
      .createQueryBuilder('n')
      .select([
        `COUNT(*) FILTER (WHERE read_at IS NULL AND cleared_at IS NULL) as unread`,
        `COUNT(*) FILTER (WHERE cleared_at IS NOT NULL) as dismissed`,
        `COUNT(*) as total`,
      ])
      .where('n.userId = :userId', { userId })
      .getRawOne();

    return {
      unread: parseInt(result.unread, 10) || 0,
      dismissed: parseInt(result.dismissed, 10) || 0,
      total: parseInt(result.total, 10) || 0,
    };
  }

  /**
   * Clear notification (move to cleared tab)
   */
  async clear(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { clearedAt: () => 'now()', snoozedUntil: null }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Unclear notification (restore from cleared)
   */
  async unclear(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { clearedAt: null }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Clear all notifications in a tab
   */
  async clearAll(userId: string, tab: 'important' | 'other'): Promise<number> {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update()
      .set({ clearedAt: () => 'now()' })
      .where('user_id = :userId', { userId })
      .andWhere('importance = :tab', { tab })
      .andWhere('cleared_at IS NULL')
      .andWhere('(snoozed_until IS NULL OR snoozed_until < now())')
      .execute();

    return result.affected || 0;
  }

  /**
   * Snooze notification until a specific time
   */
  async snooze(
    notificationId: string,
    userId: string,
    until: Date
  ): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { snoozedUntil: until }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Unsnooze notification
   */
  async unsnooze(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      { snoozedUntil: null }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Resolve an actionable notification (accept or reject)
   *
   * This is used for notifications that require user action (e.g., merge suggestions).
   * - 'accepted': User approved the action
   * - 'rejected': User rejected the action
   *
   * Once resolved, the notification no longer counts toward pending limits.
   */
  async resolve(
    notificationId: string,
    userId: string,
    status: 'accepted' | 'rejected'
  ): Promise<void> {
    // First check if the notification exists and belongs to the user
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // Check if it's an actionable notification
    if (!notification.actionStatus) {
      this.logger.warn(
        `Attempted to resolve non-actionable notification ${notificationId}`
      );
      // Still allow resolution - it might be a legacy notification
    }

    // Update the action status
    const result = await this.notificationRepo.update(
      { id: notificationId, userId },
      {
        actionStatus: status,
        actionStatusAt: new Date(),
        actionStatusBy: userId,
      }
    );

    if (!result.affected || result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }

    this.logger.log(
      `Notification ${notificationId} resolved as '${status}' by user ${userId}`
    );
  }

  /**
   * Get notification by ID
   */
  async findOne(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  /**
   * Mark all notifications linked to a task as read for a specific user.
   * This is called when a task is resolved to automatically mark the user's
   * notification as read.
   */
  async markReadByTaskId(taskId: string, userId: string): Promise<number> {
    const result = await this.notificationRepo.update(
      { taskId, userId, readAt: IsNull() },
      { readAt: new Date() }
    );

    const affected = result.affected || 0;
    if (affected > 0) {
      this.logger.debug(
        `Marked ${affected} notification(s) as read for task ${taskId} and user ${userId}`
      );
    }

    return affected;
  }

  /**
   * Get user notification preferences
   */
  async getPreferences(
    userId: string,
    category: string
  ): Promise<NotificationPreferences> {
    try {
      const result = await this.dataSource.query(
        `
      SELECT * FROM kb.user_notification_preferences
      WHERE user_id = $1 AND category = $2
    `,
        [userId, category]
      );

      // Return defaults if not found
      if (!result || result.length === 0) {
        return {
          id: '',
          subject_id: userId,
          category,
          in_app_enabled: true,
          email_enabled: false,
          email_digest: false,
          force_important: false,
          force_other: false,
          auto_mark_read: false,
          auto_clear_after_days: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
      }

      return result[0];
    } catch (error) {
      // Table doesn't exist yet, return defaults
      this.logger.debug(
        `user_notification_preferences table not found, using defaults`
      );
      return {
        id: '',
        subject_id: userId,
        category,
        in_app_enabled: true,
        email_enabled: false,
        email_digest: false,
        force_important: false,
        force_other: false,
        auto_mark_read: false,
        auto_clear_after_days: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
    }
  }

  /**
   * Helper: Create import completed notification
   */
  async notifyImportCompleted(params: {
    userId: string;
    projectId?: string;
    integrationName: string;
    syncId: string;
    integrationId: string;
    itemsImported: number;
    itemsRequiringReview?: number;
  }): Promise<Notification | null> {
    const hasReview =
      params.itemsRequiringReview && params.itemsRequiringReview > 0;
    const importance = hasReview
      ? NotificationImportance.IMPORTANT
      : NotificationImportance.OTHER;

    const message = hasReview
      ? `${params.itemsRequiringReview} items need review out of ${params.itemsImported} imported`
      : `Successfully imported ${params.itemsImported} items`;

    return this.create({
      subject_id: params.userId,
      project_id: params.projectId,
      category: hasReview
        ? NotificationCategory.IMPORT_REQUIRES_REVIEW
        : NotificationCategory.IMPORT_COMPLETED,
      importance,
      title: `${params.integrationName} import completed`,
      message,
      details: {
        integration_name: params.integrationName,
        sync_id: params.syncId,
        items_imported: params.itemsImported,
        items_requiring_review: params.itemsRequiringReview || 0,
      },
      source_type: NotificationSourceType.INTEGRATION,
      source_id: params.integrationId,
      action_url: hasReview
        ? `/admin/integrations/${params.integrationId}/activity?filter=requires_review`
        : `/admin/integrations/${params.integrationId}/activity`,
      action_label: hasReview ? 'Review Items' : 'View Import',
      group_key: `sync_${params.syncId}`,
    });
  }

  /**
   * Helper: Create extraction completed notification
   * Enhanced with detailed summary and action buttons
   */
  async notifyExtractionCompleted(params: {
    userId: string;
    projectId?: string;
    documentId: string;
    documentName: string;
    jobId: string;
    entitiesCreated: number;
    requiresReview?: number;
    objectsByType?: Record<string, number>;
    averageConfidence?: number;
    durationSeconds?: number;
    lowConfidenceCount?: number;
  }): Promise<Notification | null> {
    const totalObjects = params.entitiesCreated;
    const hasReview = (params.requiresReview || 0) > 0;
    const hasLowConfidence = (params.lowConfidenceCount || 0) > 0;

    // Build summary message
    let message = `Extracted ${totalObjects} object${
      totalObjects !== 1 ? 's' : ''
    } from ${params.documentName}`;

    if (params.objectsByType && Object.keys(params.objectsByType).length > 0) {
      const typeBreakdown = Object.entries(params.objectsByType)
        .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
        .join(', ');
      message += ` (${typeBreakdown})`;
    }

    if (hasReview) {
      message += `. ${params.requiresReview} object${
        params.requiresReview !== 1 ? 's' : ''
      } require review.`;
    }

    if (hasLowConfidence) {
      message += ` ${params.lowConfidenceCount} object${
        params.lowConfidenceCount !== 1 ? 's have' : ' has'
      } low confidence.`;
    }

    // Build action buttons
    const actions: any[] = [
      {
        label: 'View Objects',
        url: `/admin/objects?jobId=${params.jobId}`,
        style: 'primary',
      },
    ];

    if (hasReview) {
      actions.push({
        label: 'Review Objects',
        url: `/admin/objects?jobId=${params.jobId}&filter=requires_review`,
        style: 'warning',
      });
    }

    actions.push({
      label: 'View Job Details',
      url: `/admin/extraction/jobs/${params.jobId}`,
      style: 'secondary',
    });

    // Determine severity based on results
    let severity = 'success';
    if (hasReview || hasLowConfidence) {
      severity = 'warning';
    }

    return this.create({
      subject_id: params.userId,
      project_id: params.projectId,
      category: NotificationCategory.EXTRACTION_COMPLETED,
      importance: hasReview
        ? NotificationImportance.IMPORTANT
        : NotificationImportance.OTHER,
      title: `Object Extraction Complete`,
      message,
      details: {
        summary: {
          objects_created: totalObjects,
          objects_by_type: params.objectsByType || {},
          average_confidence: params.averageConfidence || null,
          duration_seconds: params.durationSeconds || null,
          requires_review: params.requiresReview || 0,
          low_confidence_count: params.lowConfidenceCount || 0,
        },
        document: {
          id: params.documentId,
          name: params.documentName,
        },
        job: {
          id: params.jobId,
        },
      },
      source_type: NotificationSourceType.EXTRACTION_JOB,
      source_id: params.jobId,
      action_url: `/admin/objects?jobId=${params.jobId}`,
      action_label: 'View Objects',
      group_key: `extraction_${params.jobId}`,
      type: 'extraction_complete',
      severity,
      related_resource_type: 'extraction_job',
      related_resource_id: params.jobId,
      read: false,
      dismissed: false,
      actions,
      expires_at: null, // No expiration for extraction notifications
    } as any);
  }

  /**
   * Helper: Create extraction failed notification
   */
  async notifyExtractionFailed(params: {
    userId: string;
    projectId?: string;
    documentId: string;
    documentName: string;
    jobId: string;
    errorMessage: string;
    retryCount?: number;
    willRetry?: boolean;
  }): Promise<Notification | null> {
    const message = params.willRetry
      ? `Extraction failed but will retry automatically (attempt ${
          (params.retryCount || 0) + 1
        }/3)`
      : `Extraction failed: ${params.errorMessage}`;

    const actions: any[] = [
      {
        label: 'View Job Details',
        url: `/admin/extraction/jobs/${params.jobId}`,
        style: 'secondary',
      },
    ];

    if (!params.willRetry) {
      actions.push({
        label: 'Retry Extraction',
        url: `/admin/extraction/jobs/${params.jobId}/retry`,
        style: 'primary',
      });
    }

    return this.create({
      subject_id: params.userId,
      project_id: params.projectId,
      category: NotificationCategory.EXTRACTION_FAILED,
      importance: NotificationImportance.IMPORTANT,
      title: `Extraction Failed: ${params.documentName}`,
      message,
      details: {
        document: {
          id: params.documentId,
          name: params.documentName,
        },
        job: {
          id: params.jobId,
        },
        error: {
          message: params.errorMessage,
          retry_count: params.retryCount || 0,
          will_retry: params.willRetry || false,
        },
      },
      source_type: NotificationSourceType.EXTRACTION_JOB,
      source_id: params.jobId,
      action_url: `/admin/extraction/jobs/${params.jobId}`,
      action_label: 'View Details',
      group_key: `extraction_${params.jobId}`,
      type: 'extraction_failed',
      severity: 'error',
      related_resource_type: 'extraction_job',
      related_resource_id: params.jobId,
      read: false,
      dismissed: false,
      actions,
      expires_at: null,
    } as any);
  }

  /**
   * Helper: Create mention notification
   */
  async notifyMention(params: {
    userId: string;
    projectId?: string;
    commenterId: string;
    commenterName: string;
    commentText: string;
    objectId: string;
    objectName: string;
  }): Promise<Notification | null> {
    return this.create({
      subject_id: params.userId,
      project_id: params.projectId,
      category: NotificationCategory.MENTION,
      importance: NotificationImportance.IMPORTANT,
      title: `${params.commenterName} mentioned you`,
      message: params.commentText,
      details: {
        commenter_id: params.commenterId,
        commenter_name: params.commenterName,
        object_id: params.objectId,
        object_name: params.objectName,
      },
      source_type: NotificationSourceType.GRAPH_OBJECT,
      source_id: params.objectId,
      action_url: `/admin/graph/objects/${params.objectId}`,
      action_label: 'View Comment',
      group_key: `object_${params.objectId}_comments`,
    });
  }
}
