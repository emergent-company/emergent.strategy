import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookPayload } from '../integrations/base-integration';
import { ClickUpWebhookEvent } from './clickup.types';
import { ClickUpSyncState } from '../../entities/clickup-sync-state.entity';

/**
 * ClickUp Webhook Handler
 *
 * Processes incoming webhook events from ClickUp for real-time updates.
 *
 * Supported Events:
 * - taskCreated
 * - taskUpdated
 * - taskDeleted
 * - taskMoved
 * - taskStatusUpdated
 * - taskPriorityUpdated
 * - taskAssigneeUpdated
 * - taskDueDateUpdated
 * - taskCommentPosted
 * - listCreated
 * - listUpdated
 * - listDeleted
 * - folderCreated
 * - folderUpdated
 * - folderDeleted
 *
 * Event Processing:
 * 1. Parse webhook event
 * 2. Identify affected entity (task, list, folder, etc.)
 * 3. Fetch latest data from ClickUp API
 * 4. Update local knowledge base
 * 5. Update sync state
 *
 * @see https://clickup.com/api#webhooks
 */
@Injectable()
export class ClickUpWebhookHandler {
  private readonly logger = new Logger(ClickUpWebhookHandler.name);

  constructor(
    @InjectRepository(ClickUpSyncState)
    private readonly syncStateRepo: Repository<ClickUpSyncState>
  ) {}

  /**
   * Handle incoming ClickUp webhook
   */
  async handleWebhook(
    integrationId: string,
    projectId: string,
    orgId: string,
    payload: WebhookPayload
  ): Promise<boolean> {
    try {
      const event = payload.body as ClickUpWebhookEvent;

      this.logger.log(
        `Received webhook: ${event.event} for integration ${integrationId}`
      );

      // Route to appropriate handler based on event type
      if (event.event.startsWith('task')) {
        return await this.handleTaskEvent(
          integrationId,
          projectId,
          orgId,
          event
        );
      } else if (event.event.startsWith('list')) {
        return await this.handleListEvent(
          integrationId,
          projectId,
          orgId,
          event
        );
      } else if (event.event.startsWith('folder')) {
        return await this.handleFolderEvent(
          integrationId,
          projectId,
          orgId,
          event
        );
      } else if (event.event.startsWith('space')) {
        return await this.handleSpaceEvent(
          integrationId,
          projectId,
          orgId,
          event
        );
      } else {
        this.logger.warn(`Unhandled webhook event type: ${event.event}`);
        return true; // Not an error, just not handled
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Webhook handling failed: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Handle task-related webhook events
   */
  private async handleTaskEvent(
    integrationId: string,
    projectId: string,
    orgId: string,
    event: ClickUpWebhookEvent
  ): Promise<boolean> {
    const taskId = event.task_id;
    if (!taskId) {
      this.logger.warn('Task event missing task_id');
      return false;
    }

    this.logger.log(`Processing task event: ${event.event} for task ${taskId}`);

    switch (event.event) {
      case 'taskCreated':
      case 'taskUpdated':
        // TODO: Fetch latest task data and update/create in database
        this.logger.debug(`Would update/create task ${taskId}`);
        break;

      case 'taskDeleted':
        // TODO: Mark task as deleted or remove from database
        this.logger.debug(`Would delete task ${taskId}`);
        break;

      case 'taskMoved':
        // TODO: Update task parent/list relationship
        this.logger.debug(`Would move task ${taskId}`);
        break;

      case 'taskStatusUpdated':
      case 'taskPriorityUpdated':
      case 'taskAssigneeUpdated':
      case 'taskDueDateUpdated':
        // TODO: Update specific task fields
        this.logger.debug(`Would update task ${taskId} field: ${event.event}`);
        break;

      case 'taskCommentPosted':
        // TODO: Add comment to task
        this.logger.debug(`Would add comment to task ${taskId}`);
        break;

      default:
        this.logger.warn(`Unhandled task event: ${event.event}`);
    }

    // Update last sync timestamp
    await this.updateLastWebhookProcessed(integrationId, taskId);

    return true;
  }

  /**
   * Handle list-related webhook events
   */
  private async handleListEvent(
    integrationId: string,
    projectId: string,
    orgId: string,
    event: ClickUpWebhookEvent
  ): Promise<boolean> {
    const listId = event.list_id;
    if (!listId) {
      this.logger.warn('List event missing list_id');
      return false;
    }

    this.logger.log(`Processing list event: ${event.event} for list ${listId}`);

    switch (event.event) {
      case 'listCreated':
      case 'listUpdated':
        // TODO: Fetch latest list data and update/create in database
        this.logger.debug(`Would update/create list ${listId}`);
        break;

      case 'listDeleted':
        // TODO: Mark list as deleted or remove from database
        this.logger.debug(`Would delete list ${listId}`);
        break;

      default:
        this.logger.warn(`Unhandled list event: ${event.event}`);
    }

    await this.updateLastWebhookProcessed(integrationId, listId);

    return true;
  }

  /**
   * Handle folder-related webhook events
   */
  private async handleFolderEvent(
    integrationId: string,
    projectId: string,
    orgId: string,
    event: ClickUpWebhookEvent
  ): Promise<boolean> {
    const folderId = event.folder_id;
    if (!folderId) {
      this.logger.warn('Folder event missing folder_id');
      return false;
    }

    this.logger.log(
      `Processing folder event: ${event.event} for folder ${folderId}`
    );

    switch (event.event) {
      case 'folderCreated':
      case 'folderUpdated':
        // TODO: Fetch latest folder data and update/create in database
        this.logger.debug(`Would update/create folder ${folderId}`);
        break;

      case 'folderDeleted':
        // TODO: Mark folder as deleted or remove from database
        this.logger.debug(`Would delete folder ${folderId}`);
        break;

      default:
        this.logger.warn(`Unhandled folder event: ${event.event}`);
    }

    await this.updateLastWebhookProcessed(integrationId, folderId);

    return true;
  }

  /**
   * Handle space-related webhook events
   */
  private async handleSpaceEvent(
    integrationId: string,
    projectId: string,
    orgId: string,
    event: ClickUpWebhookEvent
  ): Promise<boolean> {
    const spaceId = event.space_id;
    if (!spaceId) {
      this.logger.warn('Space event missing space_id');
      return false;
    }

    this.logger.log(
      `Processing space event: ${event.event} for space ${spaceId}`
    );

    // TODO: Handle space events
    this.logger.debug(`Would handle space event for ${spaceId}`);

    await this.updateLastWebhookProcessed(integrationId, spaceId);

    return true;
  }

  /**
   * Update last webhook processed timestamp
   */
  private async updateLastWebhookProcessed(
    integrationId: string,
    entityId: string
  ): Promise<void> {
    try {
      await this.syncStateRepo.update(
        { integrationId },
        { updatedAt: new Date() }
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to update webhook timestamp: ${err.message}`);
      // Don't throw - this is not critical
    }
  }
}
