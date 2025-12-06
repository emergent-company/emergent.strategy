import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRecentItem } from '../../entities/user-recent-item.entity';
import { RecordActivityDto, RecentItemDto } from './dto/record-activity.dto';

/**
 * Maximum number of recent items to return per resource type
 */
const MAX_RECENT_ITEMS = 10;

@Injectable()
export class UserActivityService {
  private readonly logger = new Logger(UserActivityService.name);

  constructor(
    @InjectRepository(UserRecentItem)
    private readonly recentItemRepo: Repository<UserRecentItem>
  ) {}

  /**
   * Record user activity (view or edit of a resource).
   * Uses UPSERT to update existing records or create new ones.
   * This is designed to be called in a fire-and-forget manner.
   *
   * @param userId - Internal user UUID
   * @param projectId - Project UUID
   * @param data - Activity details
   */
  async recordActivity(
    userId: string | undefined,
    projectId: string | undefined,
    data: RecordActivityDto
  ): Promise<void> {
    if (!userId || !projectId) {
      this.logger.debug(
        'Skipping activity recording: missing userId or projectId'
      );
      return;
    }
    try {
      const now = new Date();

      // Use upsert: if the user+project+resourceType+resourceId combo exists,
      // update it; otherwise insert a new record
      await this.recentItemRepo
        .createQueryBuilder()
        .insert()
        .into(UserRecentItem)
        .values({
          userId,
          projectId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          resourceName: data.resourceName || null,
          resourceSubtype: data.resourceSubtype || null,
          actionType: data.actionType,
          accessedAt: now,
        })
        .orUpdate(
          ['resource_name', 'resource_subtype', 'action_type', 'accessed_at'],
          ['user_id', 'project_id', 'resource_type', 'resource_id']
        )
        .execute();

      this.logger.debug(
        `Recorded ${data.actionType} activity for ${data.resourceType} ${data.resourceId}`
      );
    } catch (error) {
      // Log but don't throw - activity recording should not block the main operation
      const err = error as Error;
      this.logger.error(
        `Failed to record activity for ${data.resourceType} ${data.resourceId}: ${err.message}`,
        err.stack
      );
    }
  }

  /**
   * Get recent items for a user within a project, separated by type.
   * Returns up to MAX_RECENT_ITEMS per type, ordered by most recently accessed.
   * Only returns items where the referenced resource still exists.
   *
   * @param userId - Internal user UUID
   * @param projectId - Project UUID
   * @returns Object with 'objects' and 'documents' arrays
   */
  async getRecentItems(
    userId: string | undefined,
    projectId: string | undefined
  ): Promise<{ objects: RecentItemDto[]; documents: RecentItemDto[] }> {
    if (!userId || !projectId) {
      this.logger.debug(
        'Returning empty recent items: missing userId or projectId'
      );
      return { objects: [], documents: [] };
    }
    try {
      // Fetch recent objects - only those that still exist in graph_objects
      // Using raw query since we need INNER JOIN with non-entity tables
      const objectsRaw = await this.recentItemRepo.query(
        `SELECT ri.* 
         FROM kb.user_recent_items ri
         INNER JOIN kb.graph_objects go ON go.id = ri.resource_id AND go.project_id = ri.project_id
         WHERE ri.user_id = $1
           AND ri.project_id = $2
           AND ri.resource_type = 'object'
         ORDER BY ri.accessed_at DESC
         LIMIT $3`,
        [userId, projectId, MAX_RECENT_ITEMS]
      );

      // Map raw results to entity instances
      const objects = objectsRaw.map((row: Record<string, unknown>) => {
        const item = new UserRecentItem();
        item.id = row.id as string;
        item.userId = row.user_id as string;
        item.projectId = row.project_id as string;
        item.resourceType = row.resource_type as 'document' | 'object';
        item.resourceId = row.resource_id as string;
        item.resourceName = row.resource_name as string | null;
        item.resourceSubtype = row.resource_subtype as string | null;
        item.actionType = row.action_type as 'viewed' | 'edited';
        item.accessedAt = new Date(row.accessed_at as string);
        item.createdAt = new Date(row.created_at as string);
        return item;
      });

      // Fetch recent documents - only those that still exist in documents
      const documentsRaw = await this.recentItemRepo.query(
        `SELECT ri.* 
         FROM kb.user_recent_items ri
         INNER JOIN kb.documents d ON d.id = ri.resource_id
         WHERE ri.user_id = $1
           AND ri.project_id = $2
           AND ri.resource_type = 'document'
         ORDER BY ri.accessed_at DESC
         LIMIT $3`,
        [userId, projectId, MAX_RECENT_ITEMS]
      );

      // Map raw results to entity instances
      const documents = documentsRaw.map((row: Record<string, unknown>) => {
        const item = new UserRecentItem();
        item.id = row.id as string;
        item.userId = row.user_id as string;
        item.projectId = row.project_id as string;
        item.resourceType = row.resource_type as 'document' | 'object';
        item.resourceId = row.resource_id as string;
        item.resourceName = row.resource_name as string | null;
        item.resourceSubtype = row.resource_subtype as string | null;
        item.actionType = row.action_type as 'viewed' | 'edited';
        item.accessedAt = new Date(row.accessed_at as string);
        item.createdAt = new Date(row.created_at as string);
        return item;
      });

      return {
        objects: objects.map(this.toRecentItemDto),
        documents: documents.map(this.toRecentItemDto),
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to get recent items for user ${userId} in project ${projectId}: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Get recent items of a specific type for a user within a project.
   *
   * @param userId - Internal user UUID
   * @param projectId - Project UUID
   * @param resourceType - 'document' or 'object'
   * @returns Array of recent items
   */
  async getRecentItemsByType(
    userId: string | undefined,
    projectId: string | undefined,
    resourceType: 'document' | 'object'
  ): Promise<RecentItemDto[]> {
    if (!userId || !projectId) {
      this.logger.debug(
        'Returning empty recent items by type: missing userId or projectId'
      );
      return [];
    }
    try {
      const items = await this.recentItemRepo.find({
        where: {
          userId,
          projectId,
          resourceType,
        },
        order: { accessedAt: 'DESC' },
        take: MAX_RECENT_ITEMS,
      });

      return items.map(this.toRecentItemDto);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to get recent ${resourceType}s for user ${userId}: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Delete a specific recent item (e.g., when user removes it from the list)
   *
   * @param userId - Internal user UUID
   * @param projectId - Project UUID
   * @param resourceType - 'document' or 'object'
   * @param resourceId - UUID of the resource
   */
  async removeRecentItem(
    userId: string | undefined,
    projectId: string | undefined,
    resourceType: 'document' | 'object',
    resourceId: string
  ): Promise<void> {
    if (!userId || !projectId) {
      this.logger.debug(
        'Skipping remove recent item: missing userId or projectId'
      );
      return;
    }
    try {
      await this.recentItemRepo.delete({
        userId,
        projectId,
        resourceType,
        resourceId,
      });

      this.logger.debug(
        `Removed recent item ${resourceType} ${resourceId} for user ${userId}`
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to remove recent item ${resourceType} ${resourceId}: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Clear all recent items for a user in a project
   *
   * @param userId - Internal user UUID
   * @param projectId - Project UUID
   */
  async clearAllRecentItems(
    userId: string | undefined,
    projectId: string | undefined
  ): Promise<void> {
    if (!userId || !projectId) {
      this.logger.debug(
        'Skipping clear all recent items: missing userId or projectId'
      );
      return;
    }
    try {
      await this.recentItemRepo.delete({
        userId,
        projectId,
      });

      this.logger.debug(
        `Cleared all recent items for user ${userId} in project ${projectId}`
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to clear recent items for user ${userId}: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Convert entity to DTO
   */
  private toRecentItemDto(item: UserRecentItem): RecentItemDto {
    return {
      id: item.id,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      resourceName: item.resourceName,
      resourceSubtype: item.resourceSubtype,
      actionType: item.actionType,
      accessedAt: item.accessedAt,
    };
  }
}
