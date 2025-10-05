import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
    CreateNotificationDto,
    NotificationCategory,
    NotificationImportance,
    NotificationSourceType,
} from './dto/create-notification.dto';
import {
    Notification,
    NotificationPreferences,
    UnreadCounts,
    NotificationFilter,
    NotificationTab,
} from './entities/notification.entity';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(private readonly db: DatabaseService) { }

    /**
     * Create a notification for a user
     */
    async create(data: CreateNotificationDto): Promise<Notification | null> {
        // Check user preferences
        const prefs = await this.getPreferences(data.user_id, data.category);

        if (!prefs.in_app_enabled) {
            this.logger.debug(`Skipping notification - disabled by user preferences`);
            return null;
        }

        // Override importance if user has preferences
        let importance = data.importance || NotificationImportance.OTHER;
        if (prefs.force_important) importance = NotificationImportance.IMPORTANT;
        if (prefs.force_other) importance = NotificationImportance.OTHER;

        const result = await this.db.query<Notification>(
            `
      INSERT INTO kb.notifications (
        tenant_id, organization_id, project_id, user_id,
        category, importance, title, message, details,
        source_type, source_id, action_url, action_label, group_key,
        type, severity, related_resource_type, related_resource_id,
        read, dismissed, actions, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      RETURNING *
    `,
            [
                data.tenant_id,
                data.organization_id || null,
                data.project_id || null,
                data.user_id,
                data.category,
                importance,
                data.title,
                data.message,
                data.details ? JSON.stringify(data.details) : null,
                data.source_type || null,
                data.source_id || null,
                data.action_url || null,
                data.action_label || null,
                data.group_key || null,
                // New fields from migration 0005
                (data as any).type || null,
                (data as any).severity || 'info',
                (data as any).related_resource_type || null,
                (data as any).related_resource_id || null,
                (data as any).read || false,
                (data as any).dismissed || false,
                (data as any).actions ? JSON.stringify((data as any).actions) : '[]',
                (data as any).expires_at || null,
            ],
        );

        const notification = result.rows[0];

        // TODO: Trigger real-time notification via WebSocket
        // await this.broadcastNotification(notification);

        // TODO: Send email if enabled
        // if (prefs.email_enabled && !prefs.email_digest) {
        //   await this.sendEmailNotification(notification);
        // }

        return notification;
    }

    /**
     * Get notifications for a user with filtering
     */
    async getForUser(
        userId: string,
        tab: NotificationTab,
        filters: NotificationFilter = {},
    ): Promise<Notification[]> {
        const conditions: string[] = ['user_id = $1'];
        const params: any[] = [userId];
        let paramIndex = 2;

        // Tab filtering
        switch (tab) {
            case 'important':
                conditions.push(`importance = 'important'`);
                conditions.push('cleared_at IS NULL');
                conditions.push('(snoozed_until IS NULL OR snoozed_until < now())');
                break;
            case 'other':
                conditions.push(`importance = 'other'`);
                conditions.push('cleared_at IS NULL');
                conditions.push('(snoozed_until IS NULL OR snoozed_until < now())');
                break;
            case 'snoozed':
                conditions.push('snoozed_until > now()');
                conditions.push('cleared_at IS NULL');
                break;
            case 'cleared':
                conditions.push('cleared_at IS NOT NULL');
                conditions.push('cleared_at > now() - interval \'30 days\'');
                break;
        }

        // Additional filters
        if (filters.unread_only) {
            conditions.push('read_at IS NULL');
        }

        if (filters.category && filters.category !== 'all') {
            conditions.push(`category LIKE $${paramIndex}`);
            params.push(`${filters.category}%`);
            paramIndex++;
        }

        if (filters.search) {
            conditions.push(
                `(title ILIKE $${paramIndex} OR message ILIKE $${paramIndex})`,
            );
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        const query = `
      SELECT * FROM kb.notifications
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 100
    `;

        const result = await this.db.query<Notification>(query, params);
        return result.rows;
    }

    /**
     * Get unread counts per tab
     */
    async getUnreadCounts(userId: string): Promise<UnreadCounts> {
        try {
            const result = await this.db.query<any>(
                `
        SELECT 
          COUNT(*) FILTER (WHERE importance = 'important' AND read_at IS NULL AND cleared_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < now())) as important,
          COUNT(*) FILTER (WHERE importance = 'other' AND read_at IS NULL AND cleared_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < now())) as other,
          COUNT(*) FILTER (WHERE snoozed_until > now() AND cleared_at IS NULL) as snoozed
        FROM kb.notifications
        WHERE user_id = $1
      `,
                [userId],
            );

            const counts = {
                important: parseInt(result.rows[0].important, 10) || 0,
                other: parseInt(result.rows[0].other, 10) || 0,
                snoozed: parseInt(result.rows[0].snoozed, 10) || 0,
            };

            return counts;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Failed to get unread counts for user ${userId}: ${err.message}`, err.stack);
            throw error;
        }
    }

    /**
     * Mark notification as read
     */
    async markRead(notificationId: string, userId: string): Promise<void> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET read_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
            [notificationId, userId],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Notification not found');
        }
    }

    /**
     * Mark notification as unread
     */
    async markUnread(notificationId: string, userId: string): Promise<void> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET read_at = NULL, read = false
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
            [notificationId, userId],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Notification not found');
        }
    }

    /**
     * Dismiss notification (mark as dismissed)
     */
    async dismiss(notificationId: string, userId: string): Promise<void> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET dismissed = true, dismissed_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
            [notificationId, userId],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Notification not found');
        }
    }

    /**
     * Get notification counts (unread, dismissed, total)
     */
    async getCounts(userId: string): Promise<{ unread: number; dismissed: number; total: number }> {
        const result = await this.db.query<any>(
            `
      SELECT 
        COUNT(*) FILTER (WHERE read = false AND dismissed = false) as unread,
        COUNT(*) FILTER (WHERE dismissed = true) as dismissed,
        COUNT(*) as total
      FROM kb.notifications
      WHERE user_id = $1
        AND (expires_at IS NULL OR expires_at > now())
    `,
            [userId],
        );

        return {
            unread: parseInt(result.rows[0].unread, 10) || 0,
            dismissed: parseInt(result.rows[0].dismissed, 10) || 0,
            total: parseInt(result.rows[0].total, 10) || 0,
        };
    }

    /**
     * Clear notification (move to cleared tab)
     */
    async clear(notificationId: string, userId: string): Promise<void> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET cleared_at = now(), snoozed_until = NULL
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
            [notificationId, userId],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Notification not found');
        }
    }

    /**
     * Unclear notification (restore from cleared)
     */
    async unclear(notificationId: string, userId: string): Promise<void> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET cleared_at = NULL
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
            [notificationId, userId],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Notification not found');
        }
    }

    /**
     * Clear all notifications in a tab
     */
    async clearAll(userId: string, tab: 'important' | 'other'): Promise<number> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET cleared_at = now()
      WHERE user_id = $1
        AND importance = $2
        AND cleared_at IS NULL
        AND (snoozed_until IS NULL OR snoozed_until < now())
      RETURNING id
    `,
            [userId, tab],
        );

        return result.rows.length;
    }

    /**
     * Snooze notification until a specific time
     */
    async snooze(
        notificationId: string,
        userId: string,
        until: Date,
    ): Promise<void> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET snoozed_until = $3
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
            [notificationId, userId, until],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Notification not found');
        }
    }

    /**
     * Unsnooze notification
     */
    async unsnooze(notificationId: string, userId: string): Promise<void> {
        const result = await this.db.query(
            `
      UPDATE kb.notifications
      SET snoozed_until = NULL
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
            [notificationId, userId],
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Notification not found');
        }
    }

    /**
     * Get user notification preferences
     */
    async getPreferences(
        userId: string,
        category: string,
    ): Promise<NotificationPreferences> {
        const result = await this.db.query<NotificationPreferences>(
            `
      SELECT * FROM kb.user_notification_preferences
      WHERE user_id = $1 AND category = $2
    `,
            [userId, category],
        );

        // Return defaults if not found
        if (result.rows.length === 0) {
            return {
                id: '',
                user_id: userId,
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

        return result.rows[0];
    }

    /**
     * Helper: Create import completed notification
     */
    async notifyImportCompleted(params: {
        userId: string;
        tenantId: string;
        organizationId?: string;
        projectId?: string;
        integrationName: string;
        syncId: string;
        integrationId: string;
        itemsImported: number;
        itemsRequiringReview?: number;
    }): Promise<Notification | null> {
        const hasReview = params.itemsRequiringReview && params.itemsRequiringReview > 0;
        const importance = hasReview
            ? NotificationImportance.IMPORTANT
            : NotificationImportance.OTHER;

        const message = hasReview
            ? `${params.itemsRequiringReview} items need review out of ${params.itemsImported} imported`
            : `Successfully imported ${params.itemsImported} items`;

        return this.create({
            user_id: params.userId,
            tenant_id: params.tenantId,
            organization_id: params.organizationId,
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
        tenantId: string;
        organizationId?: string;
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
        let message = `Extracted ${totalObjects} object${totalObjects !== 1 ? 's' : ''} from ${params.documentName}`;

        if (params.objectsByType && Object.keys(params.objectsByType).length > 0) {
            const typeBreakdown = Object.entries(params.objectsByType)
                .map(([type, count]) => `${count} ${type}${count !== 1 ? 's' : ''}`)
                .join(', ');
            message += ` (${typeBreakdown})`;
        }

        if (hasReview) {
            message += `. ${params.requiresReview} object${params.requiresReview !== 1 ? 's' : ''} require review.`;
        }

        if (hasLowConfidence) {
            message += ` ${params.lowConfidenceCount} object${params.lowConfidenceCount !== 1 ? 's have' : ' has'} low confidence.`;
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
            user_id: params.userId,
            tenant_id: params.tenantId,
            organization_id: params.organizationId,
            project_id: params.projectId,
            category: NotificationCategory.EXTRACTION_COMPLETED,
            importance: hasReview ? NotificationImportance.IMPORTANT : NotificationImportance.OTHER,
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
        tenantId: string;
        organizationId?: string;
        projectId?: string;
        documentId: string;
        documentName: string;
        jobId: string;
        errorMessage: string;
        retryCount?: number;
        willRetry?: boolean;
    }): Promise<Notification | null> {
        const message = params.willRetry
            ? `Extraction failed but will retry automatically (attempt ${(params.retryCount || 0) + 1}/3)`
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
            user_id: params.userId,
            tenant_id: params.tenantId,
            organization_id: params.organizationId,
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
        tenantId: string;
        organizationId?: string;
        projectId?: string;
        commenterId: string;
        commenterName: string;
        commentText: string;
        objectId: string;
        objectName: string;
    }): Promise<Notification | null> {
        return this.create({
            user_id: params.userId,
            tenant_id: params.tenantId,
            organization_id: params.organizationId,
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
