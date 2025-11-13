import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ImportConfig, ImportResult } from '../integrations/base-integration';
import { ClickUpApiClient } from './clickup-api.client';
import { ClickUpDataMapper } from './clickup-data-mapper.service';
import { DatabaseService } from '../../common/database/database.service';
import { ExtractionJobService } from '../extraction-jobs/extraction-job.service';
import { ExtractionSourceType } from '../extraction-jobs/dto/extraction-job.dto';
import { Document } from '../../entities/document.entity';
import { ClickUpSyncState } from '../../entities/clickup-sync-state.entity';

/**
 * ClickUp Import Service
 *
 * Handles the hierarchical import of ClickUp data into the knowledge base.
 * Migrated to TypeORM - uses DataSource.query for JSONB operators and complex UPSERT
 *
 * Import Flow:
 * 1. Fetch workspace metadata
 * 2. Fetch all spaces
 * 3. For each space:
 *    a. Fetch folders
 *    b. Fetch folderless lists
 *    c. For each folder: fetch lists
 * 4. For each list: fetch tasks (paginated)
 * 5. For each task: fetch comments (if enabled)
 *
 * Progress Tracking:
 * - Updates kb.clickup_sync_state table
 * - Stores last synced IDs for incremental updates
 * - Tracks sync status and errors
 */
@Injectable()
export class ClickUpImportService {
  private readonly logger = new Logger(ClickUpImportService.name);

  constructor(
    private readonly apiClient: ClickUpApiClient,
    private readonly dataMapper: ClickUpDataMapper,
    private readonly db: DatabaseService,
    private readonly extractionJobService: ExtractionJobService,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(ClickUpSyncState)
    private readonly syncStateRepo: Repository<ClickUpSyncState>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Fetch workspace structure with spaces and documents
   *
   * Returns:
   * {
   *   workspace: { id, name },
   *   spaces: [
   *     {
   *       id: "space_id",
   *       name: "Space Name",
   *       archived: false,
   *       documents: [
   *         { id: "doc_id", name: "Doc Name" },
   *         ...
   *       ]
   *     },
   *     ...
   *   ]
   * }
   */
  async fetchWorkspaceStructure(
    workspaceId: string,
    includeArchived: boolean = false
  ): Promise<any> {
    try {
      this.logger.log(
        `Fetching workspace structure for ${workspaceId} (lightweight - no documents)`
      );

      // 1. Fetch workspace metadata
      const workspacesResponse = await this.apiClient.getWorkspaces();
      const workspace = workspacesResponse.teams.find(
        (t) => t.id === workspaceId
      );
      if (!workspace) {
        const availableWorkspaces = workspacesResponse.teams
          .map((t) => `${t.id} (${t.name})`)
          .join(', ');
        throw new Error(
          `Workspace ${workspaceId} not found. Available workspaces: ${availableWorkspaces}`
        );
      }

      // 2. Fetch all spaces
      const spacesResponse = await this.apiClient.getSpaces(
        workspaceId,
        includeArchived
      );
      this.logger.log(`Found ${spacesResponse.spaces.length} spaces`);

      // 3. Fetch only first page of documents to get a preview (max 100 docs)
      // Full document fetch will happen during actual import, not in structure UI
      const allDocs: any[] = [];
      let cursor: string | undefined = undefined;
      const MAX_PREVIEW_DOCS = 100;
      const MAX_ITERATIONS = 10; // Safety limit
      let iterations = 0;
      const seenCursors = new Set<string>();

      this.logger.log(
        `Fetching document preview (max ${MAX_PREVIEW_DOCS} docs)...`
      );

      do {
        iterations++;

        // Safety check: prevent infinite loops
        if (iterations > MAX_ITERATIONS) {
          this.logger.warn(
            `Reached max iterations (${MAX_ITERATIONS}) while fetching docs preview. Breaking loop.`
          );
          break;
        }

        // Safety check: detect cursor loops (same cursor twice)
        if (cursor && seenCursors.has(cursor)) {
          this.logger.warn(
            `Detected cursor loop (cursor: ${cursor}). Breaking to prevent infinite loop.`
          );
          break;
        }
        if (cursor) {
          seenCursors.add(cursor);
        }

        const startTime = Date.now();
        const docsResponse = await this.apiClient.getDocs(workspaceId, cursor);
        const elapsed = Date.now() - startTime;

        allDocs.push(...docsResponse.docs);
        cursor = docsResponse.next_cursor;

        this.logger.log(
          `[Preview] Fetched ${
            docsResponse.docs.length
          } docs in ${elapsed}ms (cursor: ${cursor ? 'yes' : 'none'}), total: ${
            allDocs.length
          }`
        );

        // Stop after first page for preview (ClickUp typically returns 100 docs per page)
        if (allDocs.length >= MAX_PREVIEW_DOCS) {
          this.logger.log(
            `Reached preview limit (${allDocs.length} docs). Stopping document fetch.`
          );
          break;
        }
      } while (cursor && allDocs.length < MAX_PREVIEW_DOCS);

      this.logger.log(
        `Document preview fetched: ${allDocs.length} docs (${
          cursor ? 'more available' : 'all fetched'
        })`
      );

      // 4. Group documents by space ID (parent.id where parent.type === 6)
      const docsBySpace = new Map<string, any[]>();

      for (const doc of allDocs) {
        if (doc.parent && doc.parent.type === 6) {
          const spaceId = doc.parent.id;
          if (!docsBySpace.has(spaceId)) {
            docsBySpace.set(spaceId, []);
          }
          docsBySpace.get(spaceId)!.push({
            id: doc.id,
            name: doc.name,
          });
        }
      }

      // 5. Map spaces with their documents (preview only)
      const spaces = spacesResponse.spaces.map((space) => ({
        id: space.id,
        name: space.name,
        archived: space.archived || false,
        documents: docsBySpace.get(space.id) || [],
      }));

      const structure = {
        workspace: {
          id: workspace.id,
          name: workspace.name,
        },
        spaces,
        hasMoreDocs: !!cursor, // Indicates if there are more docs beyond preview
        totalDocsPreview: allDocs.length,
      };

      this.logger.log(
        `Workspace structure fetched: ${spaces.length} spaces, ${
          allDocs.length
        } preview docs${cursor ? ' (more available)' : ''}`
      );
      return structure;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to fetch workspace structure: ${err.message}`,
        err.stack
      );
      throw new Error(`Failed to fetch workspace structure: ${err.message}`);
    }
  }

  /**
   * Run full import from ClickUp workspace
   */ /**
   * Run full import from ClickUp workspace
   */
  async runFullImport(
    integrationId: string,
    projectId: string,
    orgId: string,
    workspaceId: string,
    config: ImportConfig
  ): Promise<ImportResult> {
    const startTime = Date.now();
    let totalImported = 0;
    let totalFailed = 0;
    const breakdown: Record<
      string,
      { imported: number; failed: number; skipped: number }
    > = {};

    try {
      // Update sync state to running
      await this.updateSyncState(integrationId, {
        import_status: 'running',
        last_full_import_at: new Date(),
      });

      this.logger.log(`Starting import for workspace ${workspaceId}`);

      // Set workspace ID in mapper for URL construction
      this.dataMapper.setWorkspaceId(workspaceId);

      // 1. Fetch workspace
      const workspacesResponse = await this.apiClient.getWorkspaces();
      const workspace = workspacesResponse.teams.find(
        (t) => t.id === workspaceId
      );
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      // 2. Fetch all spaces
      const spacesResponse = await this.apiClient.getSpaces(
        workspaceId,
        config.includeArchived
      );
      this.logger.log(`Found ${spacesResponse.spaces.length} spaces`);

      breakdown['spaces'] = { imported: 0, failed: 0, skipped: 0 };
      breakdown['folders'] = { imported: 0, failed: 0, skipped: 0 };
      breakdown['lists'] = { imported: 0, failed: 0, skipped: 0 };
      breakdown['tasks'] = { imported: 0, failed: 0, skipped: 0 };

      // NOTE: Tasks/Lists/Folders import is disabled - we only sync Docs/Pages
      // The code below is commented out because we don't yet have proper storage for these entities
      /*
            // Check if selective import (specific list IDs provided)
            if (config.list_ids && config.list_ids.length > 0) {
                this.logger.log(`Selective import: ${config.list_ids.length} lists specified`);
                await this.importSpecificLists(
                    config.list_ids,
                    projectId,
                    orgId,
                    integrationId,
                    config,
                    breakdown
                );
                totalImported = breakdown['lists'].imported + breakdown['tasks'].imported;
                totalFailed = breakdown['lists'].failed + breakdown['tasks'].failed;
            } else {
                // 3. Full import: Import each space and its contents
                for (const space of spacesResponse.spaces) {
                    try {
                        // Map and store space
                        const spaceDoc = this.dataMapper.mapSpace(space, workspaceId);
                        await this.storeDocument(projectId, integrationId, spaceDoc);
                        breakdown['spaces'].imported++;
                        totalImported++;

                        // 4. Fetch folders in space
                        const foldersResponse = await this.apiClient.getFolders(space.id, config.includeArchived);
                        this.logger.log(`Space ${space.name}: ${foldersResponse.folders.length} folders`);

                        // Import folders and their lists
                        for (const folder of foldersResponse.folders) {
                            try {
                                const folderDoc = this.dataMapper.mapFolder(folder, space.id);
                                await this.storeDocument(projectId, integrationId, folderDoc);
                                breakdown['folders'].imported++;
                                totalImported++;

                                // Fetch lists in folder
                                const listsResponse = await this.apiClient.getListsInFolder(folder.id, config.includeArchived);
                                await this.importLists(
                                    listsResponse.lists,
                                    projectId,
                                    orgId,
                                    integrationId,
                                    config,
                                    breakdown,
                                    folder.id
                                );
                                totalImported += breakdown['lists'].imported;
                            } catch (error) {
                                const err = error as Error;
                                this.logger.error(`Failed to import folder ${folder.id}: ${err.message}`);
                                breakdown['folders'].failed++;
                                totalFailed++;
                            }
                        }

                        // 5. Fetch folderless lists
                        const folderlessListsResponse = await this.apiClient.getFolderlessLists(space.id, config.includeArchived);
                        this.logger.log(`Space ${space.name}: ${folderlessListsResponse.lists.length} folderless lists`);

                        await this.importLists(
                            folderlessListsResponse.lists,
                            projectId,
                            orgId,
                            integrationId,
                            config,
                            breakdown,
                            space.id
                        );

                    } catch (error) {
                        const err = error as Error;
                        this.logger.error(`Failed to import space ${space.id}: ${err.message}`);
                        breakdown['spaces'].failed++;
                        totalFailed++;
                    }
                }
            }
            */

      // 6. Import Docs (v3 API)
      breakdown['docs'] = { imported: 0, failed: 0, skipped: 0 };
      breakdown['pages'] = { imported: 0, failed: 0, skipped: 0 };

      // If specific space IDs are configured, filter docs by those spaces
      const selectedSpaceIds =
        config.space_ids && config.space_ids.length > 0
          ? config.space_ids
          : spacesResponse.spaces.map((s) => s.id);

      this.logger.log(
        `Available spaces from API: ${JSON.stringify(
          spacesResponse.spaces.map((s) => ({ id: s.id, name: s.name }))
        )}`
      );

      if (selectedSpaceIds.length > 0) {
        this.logger.log(
          `Importing docs for ${selectedSpaceIds.length} selected spaces`
        );
        this.logger.debug(
          `Selected space IDs: ${JSON.stringify(selectedSpaceIds)}`
        );
        await this.importDocs(
          workspaceId,
          selectedSpaceIds,
          projectId,
          orgId,
          integrationId,
          config,
          breakdown
        );
        totalImported +=
          breakdown['docs'].imported + breakdown['pages'].imported;
        totalFailed += breakdown['docs'].failed + breakdown['pages'].failed;
      } else {
        this.logger.log('No spaces selected, skipping docs import');
      }

      // Update sync state to success
      await this.updateSyncState(integrationId, {
        import_status: 'success',
        last_full_import_at: new Date(),
        total_imported_objects: totalImported,
        last_error: null,
      });

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Import completed: ${breakdown['docs'].imported} docs with ${breakdown['pages'].imported} pages (${totalImported} total items), ${totalFailed} failed in ${durationMs}ms`
      );

      return {
        success: true,
        totalImported,
        totalFailed,
        durationMs,
        breakdown,
        completedAt: new Date(),
      };
    } catch (error) {
      const err = error as Error;
      const durationMs = Date.now() - startTime;

      this.logger.error(`Import failed: ${err.message}`, err.stack);

      // Update sync state to error
      await this.updateSyncState(integrationId, {
        import_status: 'error',
        last_error: err.message,
      });

      return {
        success: false,
        totalImported,
        totalFailed,
        durationMs,
        error: err.message,
        breakdown,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Run full import with real-time progress updates
   */
  async runFullImportWithProgress(
    integrationId: string,
    projectId: string,
    orgId: string,
    workspaceId: string,
    config: ImportConfig,
    onProgress: (progress: {
      step: string;
      message: string;
      count?: number;
    }) => void
  ): Promise<ImportResult> {
    const startTime = Date.now();
    let totalImported = 0;
    let totalFailed = 0;
    const breakdown: Record<
      string,
      { imported: number; failed: number; skipped: number }
    > = {};

    try {
      // Update sync state to running
      await this.updateSyncState(integrationId, {
        import_status: 'running',
        last_full_import_at: new Date(),
      });

      onProgress({ step: 'starting', message: 'Starting ClickUp import...' });
      this.logger.log(`Starting import for workspace ${workspaceId}`);

      // Set workspace ID in mapper for URL construction
      this.dataMapper.setWorkspaceId(workspaceId);

      // 1. Fetch workspace
      onProgress({
        step: 'fetching_workspace',
        message: 'Fetching workspace details...',
      });
      const workspacesResponse = await this.apiClient.getWorkspaces();
      const workspace = workspacesResponse.teams.find(
        (t) => t.id === workspaceId
      );
      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      // 2. Fetch all spaces
      onProgress({ step: 'fetching_spaces', message: 'Fetching spaces...' });
      const spacesResponse = await this.apiClient.getSpaces(
        workspaceId,
        config.includeArchived
      );
      this.logger.log(`Found ${spacesResponse.spaces.length} spaces`);
      onProgress({
        step: 'spaces_fetched',
        message: `Found ${spacesResponse.spaces.length} spaces`,
        count: spacesResponse.spaces.length,
      });

      breakdown['docs'] = { imported: 0, failed: 0, skipped: 0 };
      breakdown['pages'] = { imported: 0, failed: 0, skipped: 0 };

      // If specific space IDs are configured, filter docs by those spaces
      const selectedSpaceIds =
        config.space_ids && config.space_ids.length > 0
          ? config.space_ids
          : spacesResponse.spaces.map((s) => s.id);

      if (selectedSpaceIds.length > 0) {
        this.logger.log(
          `Importing docs for ${selectedSpaceIds.length} selected spaces`
        );
        onProgress({
          step: 'importing_docs',
          message: `Importing docs from ${selectedSpaceIds.length} spaces...`,
          count: selectedSpaceIds.length,
        });

        await this.importDocsWithProgress(
          workspaceId,
          selectedSpaceIds,
          projectId,
          orgId,
          integrationId,
          config,
          breakdown,
          onProgress
        );

        totalImported +=
          breakdown['docs'].imported + breakdown['pages'].imported;
        totalFailed += breakdown['docs'].failed + breakdown['pages'].failed;

        onProgress({
          step: 'docs_imported',
          message: `Imported ${breakdown['docs'].imported} docs, ${breakdown['pages'].imported} pages`,
          count: totalImported,
        });
      } else {
        this.logger.log('No spaces selected, skipping docs import');
        onProgress({
          step: 'skipped',
          message: 'No spaces selected, skipping docs import',
        });
      }

      // Update sync state to success
      await this.updateSyncState(integrationId, {
        import_status: 'success',
        last_full_import_at: new Date(),
        total_imported_objects: totalImported,
        last_error: null,
      });

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Import completed: ${totalImported} imported, ${totalFailed} failed in ${durationMs}ms`
      );

      onProgress({
        step: 'complete',
        message: `Import complete: ${totalImported} imported, ${totalFailed} failed`,
        count: totalImported,
      });

      return {
        success: true,
        totalImported,
        totalFailed,
        durationMs,
        breakdown,
        completedAt: new Date(),
      };
    } catch (error) {
      const err = error as Error;
      const durationMs = Date.now() - startTime;

      this.logger.error(`Import failed: ${err.message}`, err.stack);
      onProgress({ step: 'error', message: `Import failed: ${err.message}` });

      // Update sync state to error
      await this.updateSyncState(integrationId, {
        import_status: 'error',
        last_error: err.message,
      });

      return {
        success: false,
        totalImported,
        totalFailed,
        durationMs,
        error: err.message,
        breakdown,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Import specific lists by IDs (selective sync)
   *
   * Optimized path that skips full workspace traversal
   * and fetches only the specified lists directly.
   *
   * Note: ClickUp doesn't provide a direct "get list by ID" endpoint,
   * so we fetch tasks first and extract list info from task responses.
   */
  private async importSpecificLists(
    listIds: string[],
    projectId: string,
    orgId: string,
    integrationId: string,
    config: ImportConfig,
    breakdown: Record<string, any>
  ): Promise<void> {
    this.logger.log(`Starting selective import of ${listIds.length} lists`);

    for (const listId of listIds) {
      try {
        // Fetch first page of tasks to get list metadata
        const firstPageResponse = await this.apiClient.getTasksInList(listId, {
          archived: config.includeArchived,
          page: 0,
        });

        // Extract list info from first task if available
        // Otherwise create minimal list object
        let list: any = null;
        if (
          firstPageResponse.tasks.length > 0 &&
          firstPageResponse.tasks[0].list
        ) {
          list = firstPageResponse.tasks[0].list;
        } else {
          // Fallback: create minimal list object
          list = {
            id: listId,
            name: `List ${listId}`,
            orderindex: 0,
            status: null,
            priority: null,
            assignee: null,
            task_count: 0,
            folder: { id: '', name: '', hidden: false, access: true },
            space: { id: '', name: '', access: true },
            archived: false,
            override_statuses: false,
            statuses: [],
          };
        }

        // Store list (without parent since we don't traverse hierarchy in selective mode)
        const listDoc = this.dataMapper.mapList(list, undefined);
        await this.storeDocument(projectId, integrationId, listDoc);
        breakdown['lists'].imported++;

        // Import tasks from this list
        let page = 0;
        let hasMore = true;
        let taskCount = 0;

        // Process first page (already fetched)
        this.logger.log(
          `List ${listId}: page 0, ${firstPageResponse.tasks.length} tasks`
        );
        for (const task of firstPageResponse.tasks) {
          try {
            const taskDoc = this.dataMapper.mapTask(task, listId);
            await this.storeDocument(projectId, integrationId, taskDoc);
            breakdown['tasks'].imported++;
            taskCount++;
          } catch (error) {
            const err = error as Error;
            this.logger.error(
              `Failed to import task ${task.id}: ${err.message}`
            );
            breakdown['tasks'].failed++;
          }
        }

        hasMore =
          firstPageResponse.last_page === false &&
          firstPageResponse.tasks.length > 0;
        page = 1;

        // Fetch remaining pages
        while (hasMore) {
          const tasksPageResponse = await this.apiClient.getTasksInList(
            listId,
            {
              archived: config.includeArchived,
              page,
              includeClosed: config.includeArchived,
            }
          );

          this.logger.log(
            `List ${listId}: page ${page}, ${tasksPageResponse.tasks.length} tasks`
          );

          for (const task of tasksPageResponse.tasks) {
            try {
              const taskDoc = this.dataMapper.mapTask(task, listId);
              await this.storeDocument(projectId, integrationId, taskDoc);
              breakdown['tasks'].imported++;
              taskCount++;
            } catch (error) {
              const err = error as Error;
              this.logger.error(
                `Failed to import task ${task.id}: ${err.message}`
              );
              breakdown['tasks'].failed++;
            }
          }

          // Check if there are more pages
          hasMore =
            tasksPageResponse.last_page === false &&
            tasksPageResponse.tasks.length > 0;
          page++;

          // Respect batch size if specified
          if (config.batchSize && taskCount >= config.batchSize) {
            this.logger.log(
              `Reached batch size limit (${config.batchSize}), stopping import for list ${listId}`
            );
            break;
          }
        }

        this.logger.log(
          `Completed import for list ${listId}: ${taskCount} tasks`
        );
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Failed to import list ${listId}: ${err.message}`);
        breakdown['lists'].failed++;
      }
    }

    this.logger.log(
      `Selective import completed: ${breakdown['lists'].imported} lists, ` +
        `${breakdown['tasks'].imported} tasks imported`
    );
  }

  /**
   * Import lists and their tasks
   */
  private async importLists(
    lists: any[],
    projectId: string,
    orgId: string,
    integrationId: string,
    config: ImportConfig,
    breakdown: Record<string, any>,
    parentId?: string
  ): Promise<void> {
    for (const list of lists) {
      try {
        // Map and store list
        const listDoc = this.dataMapper.mapList(list, parentId);
        await this.storeDocument(projectId, integrationId, listDoc);
        breakdown['lists'].imported++;

        // Fetch tasks in list (with pagination)
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          const tasksResponse = await this.apiClient.getTasksInList(list.id, {
            archived: config.includeArchived,
            page,
            includeClosed: config.includeArchived,
          });

          this.logger.log(
            `List ${list.name}: page ${page}, ${tasksResponse.tasks.length} tasks`
          );

          for (const task of tasksResponse.tasks) {
            try {
              const taskDoc = this.dataMapper.mapTask(task, list.id);
              await this.storeDocument(projectId, integrationId, taskDoc);
              breakdown['tasks'].imported++;
            } catch (error) {
              const err = error as Error;
              this.logger.error(
                `Failed to import task ${task.id}: ${err.message}`
              );
              breakdown['tasks'].failed++;
            }
          }

          // Check if there are more pages
          hasMore =
            tasksResponse.last_page === false && tasksResponse.tasks.length > 0;
          page++;
        }
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Failed to import list ${list.id}: ${err.message}`);
        breakdown['lists'].failed++;
      }
    }
  }

  /**
   * Import ClickUp Docs (v3 API)
   *
   * Imports docs and their nested pages, filtered by space IDs.
   * Maintains hierarchical structure through parent_document_id references.
   *
   * Doc Structure:
   * - Doc (top level) → stored as document
   * - Pages (nested) → each stored as separate document with parent_document_id
   * - Sub-pages (recursive) → maintain full hierarchy
   *
   * Space Filtering:
   * - Only import docs where parent.type === 6 (space) && parent.id in selectedSpaceIds
   *
   * Metadata Stored:
   * - ClickUp doc/page IDs
   * - Workspace ID
   * - Creator, dates, avatar, cover
   * - Parent relationships (via parent_page_id)
   */
  private async importDocs(
    workspaceId: string,
    selectedSpaceIds: string[],
    projectId: string,
    orgId: string,
    integrationId: string,
    config: ImportConfig,
    breakdown: Record<string, any>
  ): Promise<void> {
    this.logger.log(`Starting docs import for workspace ${workspaceId}`);

    let cursor: string | undefined = undefined;
    let totalDocsProcessed = 0;
    const MAX_ITERATIONS = 50; // Safety ceiling to prevent infinite loops
    const seenCursors = new Set<string>(); // Track cursors to detect loops
    let iterations = 0;

    try {
      // Use v3 API with parent parameter to filter docs by space
      // The v3 API supports ?parent={spaceId} parameter!
      let allDocs: any[] = [];

      if (selectedSpaceIds && selectedSpaceIds.length > 0) {
        this.logger.log(
          `Fetching docs from ${selectedSpaceIds.length} selected spaces using v3 API with parent_type=SPACE filter...`
        );

        for (const spaceId of selectedSpaceIds) {
          try {
            this.logger.log(
              `Fetching docs for space ${spaceId} (with parent_type=SPACE)...`
            );
            // Use parent_id + parent_type to get ALL docs under this space
            // This includes docs in folders, lists, and direct space children
            const docsResponse = await this.apiClient.getDocs(
              workspaceId,
              undefined,
              spaceId,
              'SPACE'
            );
            const fetchedCount = docsResponse.docs.length;

            // Tag all docs with the space ID
            const taggedDocs = docsResponse.docs.map((doc) => ({
              ...doc,
              _imported_from_space_id: spaceId,
            }));

            allDocs.push(...taggedDocs);
            this.logger.log(
              `✅ Space ${spaceId}: fetched ${fetchedCount} docs (including nested in folders/lists)`
            );
          } catch (error) {
            const err = error as Error;
            this.logger.warn(
              `Failed to fetch docs for space ${spaceId}: ${err.message}`
            );
          }
        }

        this.logger.log(
          `Total docs fetched from ${selectedSpaceIds.length} spaces: ${allDocs.length}`
        );
      } else {
        this.logger.log(
          `No space filtering: fetching all documents from workspace...`
        );
        // Fetch all docs (no parent filter)
        const docsResponse = await this.apiClient.getDocs(workspaceId);
        allDocs = docsResponse.docs;
        this.logger.log(`Fetched ${allDocs.length} docs from entire workspace`);
      }

      this.logger.log(`Processing ${allDocs.length} docs`);

      // Import each doc with its pages combined into single document
      for (const doc of allDocs) {
        try {
          // Fetch pages first to combine with doc
          let pagesContent = '';
          let pagesCount = 0;

          try {
            const pagesResponse = await this.apiClient.getDocPages(
              workspaceId,
              doc.id
            );
            pagesCount = pagesResponse.length;

            // Combine all page content (recursively for nested pages)
            pagesContent = this.combinePageContent(pagesResponse);

            this.logger.log(
              `Doc "${doc.name}" (${doc.id}): ${pagesCount} pages, ${pagesContent.length} chars combined`
            );
            if (pagesCount > 0 && pagesContent.length === 0) {
              this.logger.warn(
                `⚠️  Doc "${doc.name}" has ${pagesCount} pages but combined content is empty!`
              );
              this.logger.debug(
                `First page structure: ${JSON.stringify(
                  pagesResponse[0],
                  null,
                  2
                ).substring(0, 500)}`
              );
            }
          } catch (error) {
            const err = error as Error;
            this.logger.warn(
              `Failed to fetch pages for doc ${doc.id}, storing doc only: ${err.message}`
            );
          }

          // Map doc and combine with pages content
          const docData = this.dataMapper.mapDoc(doc);

          // Combine doc + pages into single content
          if (pagesContent) {
            docData.content = `# ${doc.name}\n\n${pagesContent}`;
            this.logger.debug(
              `Final content for "${doc.name}": ${docData.content.length} chars`
            );
          } else {
            this.logger.warn(
              `⚠️  No pages content for "${doc.name}", using placeholder`
            );
          }

          // Store combined document
          await this.storeDocument(
            projectId,
            integrationId,
            docData,
            undefined
          );
          breakdown['docs'].imported++;
          breakdown['pages'].imported += pagesCount; // Count pages for stats
          totalDocsProcessed++;
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Failed to import doc ${doc.id}: ${err.message}`);
          breakdown['docs'].failed++;
        }
      }

      this.logger.log(
        `Docs import completed: ${totalDocsProcessed} docs processed`
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to import docs: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Import docs with real-time progress updates
   */
  private async importDocsWithProgress(
    workspaceId: string,
    selectedSpaceIds: string[],
    projectId: string,
    orgId: string,
    integrationId: string,
    config: ImportConfig,
    breakdown: Record<string, any>,
    onProgress: (progress: {
      step: string;
      message: string;
      count?: number;
    }) => void
  ): Promise<void> {
    this.logger.log(
      `Starting docs import with progress for workspace ${workspaceId}`
    );

    let cursor: string | undefined = undefined;
    let totalDocsProcessed = 0;

    try {
      // Fetch all docs with pagination
      do {
        onProgress({
          step: 'fetching_docs',
          message: `Fetching docs... (${totalDocsProcessed} processed so far)`,
          count: totalDocsProcessed,
        });

        const docsResponse = await this.apiClient.getDocs(workspaceId, cursor);
        const docs = docsResponse.docs;
        cursor = docsResponse.next_cursor;

        this.logger.log(
          `Fetched ${docs.length} docs (cursor: ${cursor || 'none'})`
        );

        // Filter docs by selected spaces
        const filteredDocs = docs.filter(
          (doc) =>
            doc.parent.type === 6 && selectedSpaceIds.includes(doc.parent.id)
        );

        this.logger.log(
          `Filtered to ${filteredDocs.length} docs in selected spaces`
        );

        if (filteredDocs.length > 0) {
          onProgress({
            step: 'storing_docs',
            message: `Storing ${filteredDocs.length} docs...`,
            count: filteredDocs.length,
          });
        }

        // Import each doc with its pages combined into single document
        for (const doc of filteredDocs) {
          try {
            onProgress({
              step: 'storing_doc',
              message: `Storing doc: ${doc.name}`,
              count: totalDocsProcessed + 1,
            });

            // Fetch pages first to combine with doc
            let pagesContent = '';
            let pagesCount = 0;

            try {
              onProgress({
                step: 'fetching_pages',
                message: `Fetching pages for: ${doc.name}`,
              });

              const pagesResponse = await this.apiClient.getDocPages(
                workspaceId,
                doc.id
              );
              pagesCount = pagesResponse.length;

              // Combine all page content (recursively for nested pages)
              pagesContent = this.combinePageContent(pagesResponse);

              this.logger.log(
                `Doc "${doc.name}" (${doc.id}): ${pagesCount} pages, ${pagesContent.length} chars`
              );
            } catch (error) {
              const err = error as Error;
              this.logger.warn(
                `Failed to fetch pages for doc ${doc.id}, storing doc only: ${err.message}`
              );
            }

            // Map doc and combine with pages content
            const docData = this.dataMapper.mapDoc(doc);

            // Combine doc + pages into single content
            if (pagesContent) {
              docData.content = `# ${doc.name}\n\n${pagesContent}`;
            }

            // Store combined document
            await this.storeDocument(
              projectId,
              integrationId,
              docData,
              undefined
            );
            breakdown['docs'].imported++;
            breakdown['pages'].imported += pagesCount; // Count pages for stats
            totalDocsProcessed++;
          } catch (error) {
            const err = error as Error;
            this.logger.error(`Failed to import doc ${doc.id}: ${err.message}`);
            breakdown['docs'].failed++;
            onProgress({
              step: 'doc_error',
              message: `Failed to import doc: ${doc.name}`,
            });
          }
        }

        // Check if we need to continue pagination
        if (cursor) {
          this.logger.log(
            `Continuing pagination (processed ${totalDocsProcessed} docs so far)`
          );
          onProgress({
            step: 'pagination',
            message: `Processing more docs... (${totalDocsProcessed} processed)`,
            count: totalDocsProcessed,
          });
        }
      } while (cursor);

      this.logger.log(
        `Docs import completed: ${totalDocsProcessed} docs processed`
      );
      onProgress({
        step: 'docs_complete',
        message: `Docs import complete: ${totalDocsProcessed} docs processed`,
        count: totalDocsProcessed,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to import docs: ${err.message}`, err.stack);
      onProgress({
        step: 'error',
        message: `Failed to import docs: ${err.message}`,
      });
      throw error;
    }
  }

  /**
   * Combine page content recursively
   *
   * Extracts content from pages and their nested children,
   * combining them into a single markdown string.
   *
   * @param pages Array of pages to combine
   * @param level Indentation level for headers (for nested pages)
   * @returns Combined markdown content
   */
  private combinePageContent(pages: any[], level: number = 2): string {
    let combined = '';

    this.logger.debug(
      `combinePageContent called with ${pages.length} pages at level ${level}`
    );

    for (const page of pages) {
      // Log full structure of first page to understand API response
      if (level === 2 && combined.length === 0) {
        this.logger.debug(`  First page keys: ${Object.keys(page).join(', ')}`);
      }

      this.logger.debug(
        `  Page: page_id=${page.page_id}, id=${page.id}, name="${
          page.name
        }", content_length=${page.content?.length || 0}`
      );

      // The page_id field might be optional or named differently
      // Don't skip pages just because page_id is missing - the page might still have content
      // Skip only if the page has no name (which would make it unusable)
      if (!page.name) {
        this.logger.debug(`  ⏩ Skipping page without name`);
        continue;
      }

      // Add page heading
      const headerPrefix = '#'.repeat(level);
      combined += `${headerPrefix} ${page.name}\n\n`;

      // Add page content
      if (page.content) {
        combined += `${page.content}\n\n`;
        this.logger.debug(`  ✅ Added ${page.content.length} chars of content`);
      } else {
        this.logger.debug(`  ⚠️  Page has no content`);
      }

      // Recursively add nested pages
      if (page.pages && page.pages.length > 0) {
        this.logger.debug(
          `  🔄 Recursing into ${page.pages.length} nested pages`
        );
        combined += this.combinePageContent(page.pages, level + 1);
      }
    }

    this.logger.debug(
      `combinePageContent returning ${combined.length} chars at level ${level}`
    );
    return combined;
  }

  /**
   * Import pages recursively (DEPRECATED - No longer used)
   *
   * This method previously stored each page as a separate document.
   * We now combine all pages into a single document for better UX.
   *
   * Kept for reference in case we need to revert the approach.
   */
  private async importPages(
    pages: any[], // ClickUpPage[]
    docId: string,
    workspaceId: string,
    projectId: string,
    orgId: string,
    integrationId: string,
    parentDocumentId: string | undefined,
    breakdown: Record<string, any>
  ): Promise<void> {
    for (const page of pages) {
      try {
        // Map page to internal document
        const pageData = this.dataMapper.mapPage(
          page,
          docId,
          workspaceId,
          parentDocumentId
        );

        // Store page and get its document ID
        const pageDocumentId = await this.storeDocument(
          projectId,
          integrationId,
          pageData,
          parentDocumentId
        );
        breakdown['pages'].imported++;

        // Recursively import child pages, passing this page's ID as parent
        if (page.pages && page.pages.length > 0) {
          this.logger.debug(
            `Page "${page.name}" has ${page.pages.length} child pages`
          );
          await this.importPages(
            page.pages,
            docId,
            workspaceId,
            projectId,
            orgId,
            integrationId,
            pageDocumentId, // This page becomes parent for its children
            breakdown
          );
        }
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to import page ${page.page_id}: ${err.message}`
        );
        breakdown['pages'].failed++;
      }
    }
  }

  /**
   * Store document in database
   *
   * Stores a document in kb.documents with hierarchical relationship and metadata.
   * Returns the created document UUID for use as parent reference.
   *
   * Source Tracking (docs/spec/22-clickup-integration.md section 3.3.1):
   * - external_source: "clickup"
   * - external_id: ClickUp object ID
   * - external_url: Direct link to ClickUp
   * - external_parent_id: Parent object's ClickUp ID
   * - external_updated_at: Last modified in ClickUp
   * - synced_at: Will be set automatically by database
   */
  private async storeDocument(
    projectId: string,
    integrationId: string,
    doc: any,
    parentDocumentId?: string
  ): Promise<string> {
    this.logger.debug(
      `Storing: ${doc.external_type} - ${doc.title} (${doc.external_id})`
    );

    try {
      // Check if document already exists using DataSource.query for JSONB operator
      const existingDoc = (await this.dataSource.query(
        `SELECT id FROM kb.documents 
                 WHERE integration_metadata->>'external_id' = $1 
                   AND integration_metadata->>'external_source' = $2
                   AND project_id = $3`,
        [doc.external_id, doc.external_source, projectId]
      )) as Array<{ id: string }>;

      let documentId: string;

      if (existingDoc.length > 0) {
        // Update existing document - use DataSource.query for parent_document_id (not in entity)
        documentId = existingDoc[0].id;
        await this.dataSource.query(
          `UPDATE kb.documents 
                     SET content = $1,
                         integration_metadata = $2,
                         parent_document_id = $3,
                         updated_at = NOW()
                     WHERE id = $4`,
          [
            doc.content,
            JSON.stringify(doc.metadata),
            parentDocumentId || null,
            documentId,
          ]
        );
        this.logger.debug(`  Updated existing document: ${documentId}`);
      } else {
        // Create new document with upsert - use DataSource.query for ON CONFLICT
        const result = (await this.dataSource.query(
          `INSERT INTO kb.documents (
                        project_id,
                        source_url,
                        filename,
                        content,
                        parent_document_id,
                        integration_metadata,
                        created_at,
                        updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                    ON CONFLICT (project_id, content_hash) 
                    DO UPDATE SET
                        content = EXCLUDED.content,
                        integration_metadata = EXCLUDED.integration_metadata,
                        parent_document_id = EXCLUDED.parent_document_id,
                        updated_at = NOW()
                    RETURNING id`,
          [
            projectId,
            doc.external_url || null,
            doc.title,
            doc.content,
            parentDocumentId || null,
            JSON.stringify(doc.metadata),
          ]
        )) as Array<{ id: string }>;

        documentId = result[0].id;
        this.logger.debug(`  Created/updated document: ${documentId}`);
      }

      // NOTE: Auto-extraction removed - users will trigger extraction manually
      // after reviewing imported documents (per refactor plan)
      this.logger.debug(
        `  Document stored (auto-extraction disabled): ${documentId}`
      );

      return documentId;
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to store document ${doc.external_id}: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Update ClickUp sync state
   */
  private async updateSyncState(
    integrationId: string,
    updates: Record<string, any>
  ): Promise<void> {
    const setClause = Object.keys(updates)
      .map((key, idx) => `${key} = $${idx + 2}`)
      .join(', ');

    const values = Object.values(updates);

    // Keep as DataSource.query - complex dynamic UPSERT
    await this.dataSource.query(
      `INSERT INTO kb.clickup_sync_state (integration_id, ${Object.keys(
        updates
      ).join(', ')})
             VALUES ($1, ${Object.keys(updates)
               .map((_, idx) => `$${idx + 2}`)
               .join(', ')})
             ON CONFLICT (integration_id)
             DO UPDATE SET ${setClause}`,
      [integrationId, ...values]
    );
  }
}
