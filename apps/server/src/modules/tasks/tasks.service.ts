import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Task } from '../../entities/task.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { CreateTaskDto, TaskStatus } from './dto/task.dto';
import { ObjectMergeService, MergeResult } from '../graph/object-merge.service';

/**
 * Task with resolved user display info and freshness status
 */
export interface TaskWithUser extends Omit<Task, 'resolvedBy'> {
  resolvedBy: string | null;
  resolvedByName: string | null;
  /** For merge_suggestion tasks: true if source/target versions are no longer HEAD */
  isOutdated?: boolean;
}

/**
 * Result of resolving a task
 */
export interface ResolveResult {
  task: Task;
  mergeResult?: MergeResult;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepo: Repository<UserProfile>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepo: Repository<UserEmail>,
    @Inject(forwardRef(() => ObjectMergeService))
    private readonly objectMergeService: ObjectMergeService,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Create a new task
   */
  async create(data: CreateTaskDto): Promise<Task> {
    const task = this.taskRepo.create({
      projectId: data.projectId,
      title: data.title,
      description: data.description || null,
      type: data.type,
      status: 'pending',
      sourceType: data.sourceType || null,
      sourceId: data.sourceId || null,
      metadata: data.metadata || {},
    });

    const savedTask = await this.taskRepo.save(task);
    this.logger.log(`Created task ${savedTask.id} of type ${data.type}`);
    return savedTask;
  }

  /**
   * Get display name for a user
   * Falls back to: displayName -> firstName lastName -> email -> truncated userId
   */
  private async getUserDisplayNames(
    userIds: string[]
  ): Promise<Map<string, string>> {
    const displayNames = new Map<string, string>();

    if (userIds.length === 0) return displayNames;

    // Get user profiles
    const profiles = await this.userProfileRepo.find({
      where: { id: In(userIds) },
      relations: ['emails'],
    });

    // Track which user IDs we found profiles for
    const foundProfileIds = new Set<string>();

    for (const profile of profiles) {
      foundProfileIds.add(profile.id);
      let displayName: string | null = null;

      // Priority: displayName > firstName + lastName > primary email > truncated id
      if (profile.displayName) {
        displayName = profile.displayName;
      } else if (profile.firstName || profile.lastName) {
        displayName = [profile.firstName, profile.lastName]
          .filter(Boolean)
          .join(' ');
      } else if (profile.emails && profile.emails.length > 0) {
        // Use first verified email, or first email if none verified
        const verifiedEmail = profile.emails.find((e) => e.verified);
        const emailToUse = verifiedEmail || profile.emails[0];
        displayName = emailToUse.email;
      } else {
        // Fallback to truncated user ID (first 8 chars)
        displayName = `User ${profile.id.substring(0, 8)}`;
      }

      displayNames.set(profile.id, displayName);
    }

    // For user IDs without profiles, use truncated ID
    for (const userId of userIds) {
      if (!foundProfileIds.has(userId)) {
        displayNames.set(userId, `User ${userId.substring(0, 8)}`);
      }
    }

    return displayNames;
  }

  /**
   * Check if graph objects exist (are not soft-deleted)
   * Returns a Set of object IDs that exist
   */
  private async getExistingObjectIds(
    objectIds: string[]
  ): Promise<Set<string>> {
    if (objectIds.length === 0) return new Set();

    const result = await this.dataSource.query(
      `SELECT DISTINCT o.id 
       FROM kb.graph_objects o
       WHERE o.id = ANY($1)
         AND o.deleted_at IS NULL`,
      [objectIds]
    );

    return new Set(result.map((r: { id: string }) => r.id));
  }

  /**
   * Filter out merge_suggestion tasks where source or target objects have been deleted
   */
  private async filterTasksWithDeletedObjects(tasks: Task[]): Promise<Task[]> {
    // Collect all object IDs from merge_suggestion tasks
    const objectIds: string[] = [];
    const taskObjectMap = new Map<
      string,
      { sourceId?: string; targetId?: string }
    >();

    for (const task of tasks) {
      if (task.type === 'merge_suggestion' && task.status === 'pending') {
        const metadata = task.metadata as {
          sourceId?: string;
          targetId?: string;
        };
        if (metadata?.sourceId) objectIds.push(metadata.sourceId);
        if (metadata?.targetId) objectIds.push(metadata.targetId);
        taskObjectMap.set(task.id, metadata);
      }
    }

    if (objectIds.length === 0) return tasks;

    // Check which objects still exist
    const existingIds = await this.getExistingObjectIds(objectIds);

    // Filter out tasks with deleted objects
    return tasks.filter((task) => {
      if (task.type !== 'merge_suggestion' || task.status !== 'pending') {
        return true; // Keep non-merge or already resolved tasks
      }

      const metadata = taskObjectMap.get(task.id);
      if (!metadata) return true;

      // Both source and target must exist
      const sourceExists =
        !metadata.sourceId || existingIds.has(metadata.sourceId);
      const targetExists =
        !metadata.targetId || existingIds.has(metadata.targetId);

      if (!sourceExists || !targetExists) {
        this.logger.debug(
          `Filtering out task ${task.id}: source=${sourceExists}, target=${targetExists}`
        );
      }

      return sourceExists && targetExists;
    });
  }

  /**
   * Get IDs of merge_suggestion tasks that are outdated.
   * A task is outdated if either the source or target version is no longer HEAD
   * (i.e., a newer version of the canonical object exists).
   */
  private async getOutdatedMergeSuggestionIds(
    tasks: Task[]
  ): Promise<Set<string>> {
    const outdatedIds = new Set<string>();

    // Collect canonical IDs and versions from merge_suggestion tasks
    const taskVersionInfo: Array<{
      taskId: string;
      sourceCanonicalId?: string;
      sourceVersion?: number;
      targetCanonicalId?: string;
      targetVersion?: number;
    }> = [];

    const canonicalIds: string[] = [];

    for (const task of tasks) {
      if (task.type !== 'merge_suggestion' || task.status !== 'pending') {
        continue;
      }

      const metadata = task.metadata as {
        sourceCanonicalId?: string;
        sourceVersion?: number;
        targetCanonicalId?: string;
        targetVersion?: number;
      };

      // Only process tasks that have canonical ID and version metadata
      if (
        metadata?.sourceCanonicalId &&
        metadata?.sourceVersion !== undefined &&
        metadata?.targetCanonicalId &&
        metadata?.targetVersion !== undefined
      ) {
        taskVersionInfo.push({
          taskId: task.id,
          sourceCanonicalId: metadata.sourceCanonicalId,
          sourceVersion: metadata.sourceVersion,
          targetCanonicalId: metadata.targetCanonicalId,
          targetVersion: metadata.targetVersion,
        });

        if (!canonicalIds.includes(metadata.sourceCanonicalId)) {
          canonicalIds.push(metadata.sourceCanonicalId);
        }
        if (!canonicalIds.includes(metadata.targetCanonicalId)) {
          canonicalIds.push(metadata.targetCanonicalId);
        }
      }
    }

    if (taskVersionInfo.length === 0 || canonicalIds.length === 0) {
      return outdatedIds;
    }

    // Query current HEAD versions for all canonical IDs
    const headVersions = await this.dataSource.query(
      `SELECT canonical_id, MAX(version) as head_version
       FROM kb.graph_objects
       WHERE canonical_id = ANY($1)
         AND deleted_at IS NULL
       GROUP BY canonical_id`,
      [canonicalIds]
    );

    // Build a map of canonical_id -> head_version
    const headVersionMap = new Map<string, number>();
    for (const row of headVersions) {
      headVersionMap.set(row.canonical_id, parseInt(row.head_version, 10));
    }

    // Check each task to see if its versions are still HEAD
    for (const info of taskVersionInfo) {
      const sourceHead = headVersionMap.get(info.sourceCanonicalId!);
      const targetHead = headVersionMap.get(info.targetCanonicalId!);

      // Task is outdated if:
      // - Canonical ID no longer exists (deleted)
      // - Stored version is less than current HEAD version
      const sourceOutdated =
        sourceHead === undefined || info.sourceVersion! < sourceHead;
      const targetOutdated =
        targetHead === undefined || info.targetVersion! < targetHead;

      if (sourceOutdated || targetOutdated) {
        outdatedIds.add(info.taskId);
        this.logger.debug(
          `Task ${info.taskId} is outdated: source=${info.sourceVersion}/${sourceHead}, target=${info.targetVersion}/${targetHead}`
        );
      }
    }

    return outdatedIds;
  }

  /**
   * Get tasks for a project with optional filtering
   */
  async getForProject(
    projectId: string,
    options: {
      status?: TaskStatus;
      type?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ tasks: TaskWithUser[]; total: number }> {
    const { status, type, page = 1, limit = 50 } = options;

    const qb = this.taskRepo
      .createQueryBuilder('t')
      .where('t.projectId = :projectId', { projectId });

    // For merge_suggestion tasks, order by similarity (highest first)
    // Otherwise, order by creation date (newest first)
    if (type === 'merge_suggestion') {
      // Use COALESCE to handle cases where similarityPercent might not exist
      qb.orderBy(
        `COALESCE((t.metadata->>'similarityPercent')::numeric, 0)`,
        'DESC'
      ).addOrderBy('t.createdAt', 'DESC');
    } else {
      qb.orderBy('t.createdAt', 'DESC');
    }

    if (status) {
      qb.andWhere('t.status = :status', { status });
    }

    if (type) {
      qb.andWhere('t.type = :type', { type });
    }

    const total = await qb.getCount();
    let tasks = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    // Filter out merge_suggestion tasks where objects have been deleted
    tasks = await this.filterTasksWithDeletedObjects(tasks);

    // Check which merge_suggestion tasks are outdated (versions no longer HEAD)
    const outdatedTaskIds = await this.getOutdatedMergeSuggestionIds(tasks);

    // Get user display names for resolved tasks
    const resolvedByIds = tasks
      .map((t) => t.resolvedBy)
      .filter((id): id is string => id !== null);
    const userNames = await this.getUserDisplayNames(resolvedByIds);

    // Transform tasks to include resolvedByName and isOutdated
    const tasksWithUsers: TaskWithUser[] = tasks.map((task) => ({
      ...task,
      resolvedByName: task.resolvedBy
        ? userNames.get(task.resolvedBy) || null
        : null,
      isOutdated: outdatedTaskIds.has(task.id),
    }));

    return { tasks: tasksWithUsers, total };
  }

  /**
   * Get a single task by ID
   */
  async findOne(taskId: string): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  /**
   * Resolve a task (accept or reject)
   *
   * For merge_suggestion tasks that are accepted, this will also
   * execute the actual merge operation.
   */
  async resolve(
    taskId: string,
    userId: string,
    status: 'accepted' | 'rejected',
    notes?: string
  ): Promise<ResolveResult> {
    const task = await this.findOne(taskId);

    if (task.status !== 'pending') {
      this.logger.warn(`Attempted to resolve non-pending task ${taskId}`);
      // Return as-is, already resolved
      return { task };
    }

    // For merge_suggestion tasks that are accepted, execute the merge
    let mergeResult: MergeResult | undefined;
    if (task.type === 'merge_suggestion' && status === 'accepted') {
      mergeResult = await this.executeMergeSuggestion(task, userId);

      if (!mergeResult.success) {
        // If merge failed, don't mark the task as resolved
        this.logger.error(
          `Merge execution failed for task ${taskId}: ${mergeResult.error}`
        );
        // Add error to notes but keep task pending for retry
        task.resolutionNotes = `Merge failed: ${mergeResult.error}`;
        await this.taskRepo.save(task);
        return { task, mergeResult };
      }

      // Add merge details to notes
      notes = notes
        ? `${notes}\n\nMerge completed: ${mergeResult.redirectedRelationships} relationships redirected.`
        : `Merge completed: ${mergeResult.redirectedRelationships} relationships redirected.`;
    }

    task.status = status;
    task.resolvedAt = new Date();
    task.resolvedBy = userId;
    task.resolutionNotes = notes || null;

    const savedTask = await this.taskRepo.save(task);
    this.logger.log(`Task ${taskId} resolved as '${status}' by user ${userId}`);
    return { task: savedTask, mergeResult };
  }

  /**
   * Execute a merge suggestion by merging the source object into the target
   */
  private async executeMergeSuggestion(
    task: Task,
    userId: string
  ): Promise<MergeResult> {
    const metadata = task.metadata as {
      sourceId?: string;
      targetId?: string;
    };

    if (!metadata?.sourceId || !metadata?.targetId) {
      return {
        success: false,
        targetObjectId: '',
        sourceObjectId: '',
        deletedSourceId: null,
        mergedProperties: {},
        redirectedRelationships: 0,
        error: 'Task metadata missing sourceId or targetId',
      };
    }

    this.logger.log(
      `Executing merge for task ${task.id}: ${metadata.sourceId} -> ${metadata.targetId}`
    );

    return this.objectMergeService.mergeObjects(
      metadata.sourceId,
      metadata.targetId,
      {
        propertyStrategy: 'source-wins',
        trackProvenance: true,
        userId,
      }
    );
  }

  /**
   * Cancel a task
   */
  async cancel(taskId: string, userId: string, reason?: string): Promise<Task> {
    const task = await this.findOne(taskId);

    if (task.status !== 'pending') {
      this.logger.warn(`Attempted to cancel non-pending task ${taskId}`);
      return task;
    }

    task.status = 'cancelled';
    task.resolvedAt = new Date();
    task.resolvedBy = userId;
    task.resolutionNotes = reason || 'Cancelled';

    const savedTask = await this.taskRepo.save(task);
    this.logger.log(`Task ${taskId} cancelled by user ${userId}`);
    return savedTask;
  }

  /**
   * Cancel pending merge_suggestion tasks that reference a deleted object.
   * Called when an object is soft-deleted.
   *
   * @param objectId - The ID of the deleted object
   * @returns Number of tasks cancelled
   */
  async cancelTasksForDeletedObject(objectId: string): Promise<number> {
    // Find pending merge_suggestion tasks where sourceId or targetId matches
    const tasks = await this.taskRepo
      .createQueryBuilder('t')
      .where('t.type = :type', { type: 'merge_suggestion' })
      .andWhere('t.status = :status', { status: 'pending' })
      .andWhere(
        `(t.metadata->>'sourceId' = :objectId OR t.metadata->>'targetId' = :objectId)`,
        { objectId }
      )
      .getMany();

    if (tasks.length === 0) {
      return 0;
    }

    // Cancel all found tasks
    const now = new Date();
    await this.taskRepo.update(
      { id: In(tasks.map((t) => t.id)) },
      {
        status: 'cancelled',
        resolvedAt: now,
        resolutionNotes: 'Object was deleted',
      }
    );

    this.logger.log(
      `Cancelled ${tasks.length} merge_suggestion task(s) due to object deletion: ${objectId}`
    );

    return tasks.length;
  }

  /**
   * Count pending tasks by type for a project
   */
  async countPending(projectId: string, type?: string): Promise<number> {
    const qb = this.taskRepo
      .createQueryBuilder('t')
      .where('t.projectId = :projectId', { projectId })
      .andWhere('t.status = :status', { status: 'pending' });

    if (type) {
      qb.andWhere('t.type = :type', { type });
    }

    return qb.getCount();
  }

  /**
   * Count pending tasks of a specific type (across all projects)
   * Used by agents to check limits
   *
   * For merge_suggestion tasks, filters out tasks where source or target
   * objects have been deleted.
   */
  async countPendingByType(type: string): Promise<number> {
    if (type !== 'merge_suggestion') {
      // For non-merge tasks, simple count is sufficient
      return this.taskRepo.count({
        where: { type, status: 'pending' },
      });
    }

    // For merge_suggestion tasks, we need to check if objects still exist
    const pendingTasks = await this.taskRepo.find({
      where: { type, status: 'pending' as TaskStatus },
    });

    if (pendingTasks.length === 0) return 0;

    // Collect all object IDs
    const objectIds: string[] = [];
    for (const task of pendingTasks) {
      const metadata = task.metadata as {
        sourceId?: string;
        targetId?: string;
      };
      if (metadata?.sourceId) objectIds.push(metadata.sourceId);
      if (metadata?.targetId) objectIds.push(metadata.targetId);
    }

    // Check which objects still exist
    const existingIds = await this.getExistingObjectIds(objectIds);

    // Count only tasks where both source and target exist
    let validCount = 0;
    for (const task of pendingTasks) {
      const metadata = task.metadata as {
        sourceId?: string;
        targetId?: string;
      };
      const sourceExists =
        !metadata?.sourceId || existingIds.has(metadata.sourceId);
      const targetExists =
        !metadata?.targetId || existingIds.has(metadata.targetId);
      if (sourceExists && targetExists) {
        validCount++;
      }
    }

    return validCount;
  }

  /**
   * Get task counts by status for a project
   * Note: For pending merge_suggestion tasks, we need to filter out those
   * where source or target objects have been deleted
   */
  async getCounts(projectId: string): Promise<{
    pending: number;
    accepted: number;
    rejected: number;
    cancelled: number;
  }> {
    // Get base counts for non-pending and non-merge_suggestion tasks
    const result = await this.taskRepo
      .createQueryBuilder('t')
      .select([
        `COUNT(*) FILTER (WHERE status = 'accepted') as accepted`,
        `COUNT(*) FILTER (WHERE status = 'rejected') as rejected`,
        `COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled`,
        `COUNT(*) FILTER (WHERE status = 'pending' AND type != 'merge_suggestion') as pending_other`,
      ])
      .where('t.projectId = :projectId', { projectId })
      .getRawOne();

    // For pending merge_suggestion tasks, we need to check if objects still exist
    const pendingMergeTasks = await this.taskRepo.find({
      where: {
        projectId,
        type: 'merge_suggestion',
        status: 'pending' as TaskStatus,
      },
    });

    // Filter out those with deleted objects
    let validMergeTaskCount = 0;
    if (pendingMergeTasks.length > 0) {
      const objectIds: string[] = [];
      for (const task of pendingMergeTasks) {
        const metadata = task.metadata as {
          sourceId?: string;
          targetId?: string;
        };
        if (metadata?.sourceId) objectIds.push(metadata.sourceId);
        if (metadata?.targetId) objectIds.push(metadata.targetId);
      }

      const existingIds = await this.getExistingObjectIds(objectIds);

      for (const task of pendingMergeTasks) {
        const metadata = task.metadata as {
          sourceId?: string;
          targetId?: string;
        };
        const sourceExists =
          !metadata?.sourceId || existingIds.has(metadata.sourceId);
        const targetExists =
          !metadata?.targetId || existingIds.has(metadata.targetId);
        if (sourceExists && targetExists) {
          validMergeTaskCount++;
        }
      }
    }

    return {
      pending: (parseInt(result.pending_other, 10) || 0) + validMergeTaskCount,
      accepted: parseInt(result.accepted, 10) || 0,
      rejected: parseInt(result.rejected, 10) || 0,
      cancelled: parseInt(result.cancelled, 10) || 0,
    };
  }
}
