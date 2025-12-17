import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  AgentStrategy,
  AgentExecutionContext,
  AgentRunResult,
} from './agent-strategy.interface';
import { AgentStrategyRegistry } from './agent-strategy.registry';
import { GraphVectorSearchService } from '../../graph/graph-vector-search.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TasksService } from '../../tasks/tasks.service';
import { GraphObject } from '../../../entities/graph-object.entity';
import { Task } from '../../../entities/task.entity';
import { LangfuseService } from '../../langfuse/langfuse.service';
import { TaskSourceType } from '../../tasks/dto/task.dto';

/**
 * MergeSuggestionStrategy
 *
 * Agent strategy that finds similar graph objects and creates
 * actionable merge suggestion tasks for project members.
 */
@Injectable()
export class MergeSuggestionStrategy implements AgentStrategy, OnModuleInit {
  private readonly logger = new Logger(MergeSuggestionStrategy.name);

  readonly role = 'merge-suggestion';

  constructor(
    private readonly registry: AgentStrategyRegistry,
    private readonly vectorSearch: GraphVectorSearchService,
    private readonly notificationsService: NotificationsService,
    private readonly tasksService: TasksService,
    private readonly dataSource: DataSource,
    @InjectRepository(GraphObject)
    private readonly graphObjectRepo: Repository<GraphObject>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @Optional() private readonly langfuseService?: LangfuseService
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /**
   * Check if we should skip this run (too many pending notifications)
   */
  async shouldSkip(
    context: AgentExecutionContext
  ): Promise<string | undefined> {
    const config = context.agent.config || {};
    const maxPending = config.maxPendingNotifications ?? 5;

    const pendingCount = await this.countPendingMergeSuggestions();

    if (pendingCount >= maxPending) {
      return `Too many pending merge suggestions (${pendingCount} >= ${maxPending})`;
    }

    return undefined;
  }

  /**
   * Execute the merge suggestion logic
   */
  async execute(context: AgentExecutionContext): Promise<AgentRunResult> {
    const config = context.agent.config || {};
    const similarityThreshold = config.similarityThreshold ?? 0.1;
    const batchSize = config.batchSize ?? 100;
    const maxPending = config.maxPendingNotifications ?? 5;
    const { traceId } = context;

    let objectsScanned = 0;
    let similarPairsFound = 0;
    let suggestionsCreated = 0;
    let suggestionsUpdated = 0;
    let suggestionsSkippedDueToLimit = 0;
    const seenPairs = new Set<string>(); // Track pairs to avoid double-counting A→B and B→A

    try {
      // Get current pending count to track against limit
      let currentPendingCount = await this.countPendingMergeSuggestions();

      // Create span for object scanning
      const scanSpan = traceId
        ? this.langfuseService?.createSpan(traceId, 'scanObjects', {
            batchSize,
            similarityThreshold,
            currentPendingCount,
            maxPending,
          }) ?? null
        : null;

      // Get a batch of objects with embeddings to scan
      const objects = await this.getObjectsToScan(batchSize);
      objectsScanned = objects.length;

      if (objects.length === 0) {
        this.langfuseService?.endSpan(
          scanSpan,
          { objectsFound: 0, message: 'No objects with embeddings' },
          'success'
        );
        return {
          success: true,
          summary: {
            objectsScanned: 0,
            message: 'No objects with embeddings to scan',
          },
        };
      }

      this.langfuseService?.endSpan(
        scanSpan,
        { objectsFound: objects.length },
        'success'
      );

      // Create span for similarity search
      const searchSpan = traceId
        ? this.langfuseService?.createSpan(traceId, 'findSimilarPairs', {
            objectCount: objects.length,
            similarityThreshold,
          }) ?? null
        : null;

      // Collect candidate pairs, with early exit optimization
      // If we find enough perfect matches (distance=0, 100% similarity), stop scanning
      // Use canonical_id for pair identification (logical object, not specific version)
      interface CandidatePair {
        sourceId: string; // HEAD version id (for fetching object details)
        targetId: string; // HEAD version id
        sourceCanonicalId: string; // Canonical id for merge
        targetCanonicalId: string; // Canonical id for merge
        sourceVersion: number; // Version at time of scan (for freshness check)
        targetVersion: number; // Version at time of scan
        distance: number;
        pairKey: string; // Based on canonical_id
      }
      const allCandidates: CandidatePair[] = [];
      const perfectMatchThreshold = 0.001; // Consider distance < 0.001 as "perfect" (99.9%+)
      let perfectMatchCount = 0;
      const neededSuggestions = maxPending - currentPendingCount;

      // For each object, find similar objects and collect candidates
      objectLoop: for (const obj of objects) {
        const similar = await this.vectorSearch.searchSimilar(obj.id, {
          limit: 5,
          maxDistance: similarityThreshold,
          projectId: obj.projectId,
        });

        // Filter out self (by canonical_id) and already-processed pairs
        const candidates = similar.filter(
          (s) =>
            s.canonical_id !== obj.canonicalId &&
            s.distance <= similarityThreshold
        );

        for (const candidate of candidates) {
          // Use canonical_id for pair key (merging logical objects, not versions)
          const sourceCanonicalId = obj.canonicalId;
          const targetCanonicalId = candidate.canonical_id;

          // Skip if missing canonical_id (shouldn't happen, but be safe)
          if (!sourceCanonicalId || !targetCanonicalId) {
            this.logger.warn(
              `Skipping candidate pair: missing canonical_id (source: ${sourceCanonicalId}, target: ${targetCanonicalId})`
            );
            continue;
          }

          // Normalize pair order to avoid counting A→B and B→A separately
          const [cid1, cid2] = [sourceCanonicalId, targetCanonicalId].sort();
          const pairKey = `${cid1}:${cid2}`;

          if (seenPairs.has(pairKey)) {
            continue; // Already counted this pair from the other direction
          }
          seenPairs.add(pairKey);

          allCandidates.push({
            sourceId: obj.id,
            targetId: candidate.id,
            sourceCanonicalId,
            targetCanonicalId,
            sourceVersion: obj.version,
            targetVersion: candidate.version ?? 1,
            distance: candidate.distance,
            pairKey,
          });

          // Track perfect matches for early exit optimization
          if (candidate.distance <= perfectMatchThreshold) {
            perfectMatchCount++;
            // Early exit: if we have enough perfect matches, stop scanning
            if (perfectMatchCount >= neededSuggestions) {
              this.logger.debug(
                `Early exit: found ${perfectMatchCount} perfect matches (need ${neededSuggestions})`
              );
              break objectLoop;
            }
          }
        }
      }

      // Sort candidates by distance ascending (lowest distance = highest similarity)
      // This ensures we process the most similar pairs first
      allCandidates.sort((a, b) => a.distance - b.distance);

      similarPairsFound = allCandidates.length;

      // Process candidates in order of similarity (highest first)
      for (const candidate of allCandidates) {
        // Check if we've hit the pending limit before creating new suggestions
        if (currentPendingCount >= maxPending) {
          suggestionsSkippedDueToLimit++;
          continue;
        }

        // Check if we already have a pending suggestion for this pair
        const result = await this.createOrUpdateSuggestion(
          candidate.sourceId,
          candidate.targetId,
          candidate.sourceCanonicalId,
          candidate.targetCanonicalId,
          candidate.sourceVersion,
          candidate.targetVersion,
          candidate.distance,
          context.agent.id
        );

        if (result === 'created') {
          suggestionsCreated++;
          currentPendingCount++; // Track the new pending count
        } else if (result === 'updated') {
          suggestionsUpdated++;
        }
      }

      this.langfuseService?.endSpan(
        searchSpan,
        {
          similarPairsFound,
          suggestionsCreated,
          suggestionsUpdated,
          suggestionsSkippedDueToLimit,
        },
        'success'
      );

      return {
        success: true,
        summary: {
          objectsScanned,
          similarPairsFound,
          suggestionsCreated,
          suggestionsUpdated,
          suggestionsSkippedDueToLimit,
          maxPendingNotifications: maxPending,
        },
      };
    } catch (error) {
      return {
        success: false,
        summary: { objectsScanned, similarPairsFound },
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Count pending merge suggestion tasks (status = 'pending')
   *
   * Only counts tasks that haven't been resolved (accepted/rejected).
   */
  private async countPendingMergeSuggestions(): Promise<number> {
    return this.tasksService.countPendingByType('merge_suggestion');
  }

  /**
   * Get objects to scan for similarities
   * Uses HEAD version logic - only scans the latest version of each object
   * where the HEAD is not deleted and has an embedding
   */
  private async getObjectsToScan(limit: number): Promise<GraphObject[]> {
    // Use raw SQL to get HEAD (latest version) of each object
    // This matches the UI's versioning logic - only HEAD versions are visible
    const result = await this.dataSource.query<GraphObject[]>(
      `WITH heads AS (
        SELECT DISTINCT ON (canonical_id) *
        FROM kb.graph_objects
        ORDER BY canonical_id, version DESC
      )
      SELECT * FROM heads
      WHERE deleted_at IS NULL
        AND embedding_v2 IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT $1`,
      [limit]
    );
    return result;
  }

  /**
   * Create or update a merge suggestion task
   *
   * Creates a Task (project-scoped, shared) and sends notifications
   * to all project members linking to the task.
   *
   * Uses canonical_id for pair identification and validates freshness
   * by checking if objects have been updated since the scan.
   */
  private async createOrUpdateSuggestion(
    sourceId: string,
    targetId: string,
    sourceCanonicalId: string,
    targetCanonicalId: string,
    sourceVersion: number,
    targetVersion: number,
    similarity: number,
    agentId: string
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Use canonical_id for pair key (merging logical objects, not versions)
    const [cid1, cid2] = [sourceCanonicalId, targetCanonicalId].sort();
    const pairKey = `${cid1}:${cid2}`;

    // Validate freshness: check if the versions we scanned are still the HEAD versions
    // Merge suggestions are only valid for HEAD versions - if either object has a newer
    // version, the scanned versions are no longer HEAD and the suggestion is outdated
    const freshnessCheck = await this.dataSource.query<
      { canonical_id: string; max_version: number }[]
    >(
      `SELECT canonical_id, MAX(version) as max_version
       FROM kb.graph_objects
       WHERE canonical_id IN ($1, $2)
       GROUP BY canonical_id`,
      [sourceCanonicalId, targetCanonicalId]
    );

    const versionMap = new Map(
      freshnessCheck.map((r) => [r.canonical_id, r.max_version])
    );
    const currentHeadSourceVersion = versionMap.get(sourceCanonicalId) ?? 0;
    const currentHeadTargetVersion = versionMap.get(targetCanonicalId) ?? 0;

    // If the scanned version is no longer HEAD, skip this suggestion
    if (
      currentHeadSourceVersion > sourceVersion ||
      currentHeadTargetVersion > targetVersion
    ) {
      this.logger.debug(
        `Skipping outdated merge suggestion for ${pairKey}: ` +
          `source scanned v${sourceVersion} but HEAD is v${currentHeadSourceVersion}, ` +
          `target scanned v${targetVersion} but HEAD is v${currentHeadTargetVersion}`
      );
      return 'skipped';
    }

    // Check for existing pending task for this pair
    const existing = await this.taskRepo.findOne({
      where: {
        type: 'merge_suggestion',
        status: 'pending',
      },
    });

    // Check if existing task is for the same pair
    if (existing && existing.metadata?.pairKey === pairKey) {
      // Update if similarity is better (lower distance = more similar)
      const existingSimilarity = existing.metadata?.similarity ?? 1;
      if (similarity < existingSimilarity) {
        existing.metadata = {
          ...existing.metadata,
          similarity,
          similarityPercent: Math.round((1 - similarity) * 100),
          sourceVersion: currentHeadSourceVersion,
          targetVersion: currentHeadTargetVersion,
          updatedAt: new Date().toISOString(),
        };
        await this.taskRepo.save(existing);
        return 'updated';
      }
      return 'skipped';
    }

    // Get object details for the task (fetch by id to get the specific version we scanned)
    const [sourceObj, targetObj] = await Promise.all([
      this.graphObjectRepo.findOne({ where: { id: sourceId } }),
      this.graphObjectRepo.findOne({ where: { id: targetId } }),
    ]);

    if (!sourceObj || !targetObj) {
      this.logger.warn(
        `Objects not found for merge suggestion: ${sourceId}, ${targetId}`
      );
      return 'skipped';
    }

    const similarityPercent = Math.round((1 - similarity) * 100);

    // Get display names for objects (prefer key, fallback to properties.name, then type+id)
    const sourceDisplayName = this.getObjectDisplayName(sourceObj);
    const targetDisplayName = this.getObjectDisplayName(targetObj);

    // Create the Task (project-scoped, shared)
    // Store canonical_id for merge operations, version for freshness tracking
    const task = await this.tasksService.create({
      projectId: sourceObj.projectId,
      title: 'Potential Duplicate Objects Found',
      description: `Objects "${sourceDisplayName}" and "${targetDisplayName}" are ${similarityPercent}% similar and may be duplicates.`,
      type: 'merge_suggestion',
      sourceType: TaskSourceType.AGENT,
      sourceId: agentId,
      metadata: {
        pairKey,
        // Canonical IDs for merge operations
        sourceCanonicalId,
        targetCanonicalId,
        // Version IDs for reference (specific version that was compared)
        sourceId,
        targetId,
        // Version numbers for freshness validation (HEAD version at time of suggestion)
        sourceVersion: currentHeadSourceVersion,
        targetVersion: currentHeadTargetVersion,
        // Display info
        sourceKey: sourceDisplayName,
        targetKey: targetDisplayName,
        sourceType: sourceObj.type,
        targetType: targetObj.type,
        similarity,
        similarityPercent,
        agentId,
        // Use canonical_id in action URL for merge UI
        actionUrl: `/admin/objects?compare=${sourceCanonicalId},${targetCanonicalId}`,
      },
    });

    // Get all project members to notify
    const projectMembers = await this.getProjectMembers(sourceObj.projectId);

    // Send notifications to all project members, linking to the task
    for (const userId of projectMembers) {
      await this.notificationsService.create({
        subject_id: userId,
        project_id: sourceObj.projectId,
        category: 'agent',
        importance: 'important',
        title: 'Potential Duplicate Objects Found',
        message: `Objects "${sourceDisplayName}" and "${targetDisplayName}" are ${similarityPercent}% similar and may be duplicates.`,
        details: {
          taskId: task.id,
          sourceCanonicalId,
          targetCanonicalId,
          sourceKey: sourceDisplayName,
          targetKey: targetDisplayName,
          similarityPercent,
        },
        source_type: 'agent',
        source_id: agentId,
        action_url: `/admin/objects?compare=${sourceCanonicalId},${targetCanonicalId}`,
        action_label: 'Compare Objects',
        group_key: `task:${task.id}`,
        type: 'agent:merge_suggestion',
        severity: 'warning',
        related_resource_type: 'task',
        related_resource_id: task.id,
        read: false,
        dismissed: false,
        task_id: task.id, // Link notification to task
      } as any);
    }

    this.logger.log(
      `Created merge suggestion task ${task.id} for ${sourceDisplayName} ↔ ${targetDisplayName} ` +
        `(${similarityPercent}% similar) and notified ${projectMembers.length} project members`
    );

    return 'created';
  }

  /**
   * Get all user IDs for members of a project
   */
  private async getProjectMembers(projectId: string): Promise<string[]> {
    const result = await this.dataSource.query(
      `
      SELECT user_id FROM kb.project_memberships
      WHERE project_id = $1
    `,
      [projectId]
    );

    return result.map((r: { user_id: string }) => r.user_id);
  }

  /**
   * Get a display name for an object, with fallback chain:
   * 1. key (if not null/empty)
   * 2. properties.name (if exists)
   * 3. type + short ID as fallback
   */
  private getObjectDisplayName(obj: GraphObject): string {
    if (obj.key) {
      return obj.key;
    }

    const propsName = obj.properties?.name;
    if (propsName && typeof propsName === 'string') {
      return propsName;
    }

    // Fallback to type + short ID
    const shortId = obj.id.substring(0, 8);
    return `${obj.type}:${shortId}`;
  }
}
