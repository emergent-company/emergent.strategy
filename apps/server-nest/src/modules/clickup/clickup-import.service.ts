import { Injectable, Logger } from '@nestjs/common';
import { ImportConfig, ImportResult } from '../integrations/base-integration';
import { ClickUpApiClient } from './clickup-api.client';
import { ClickUpDataMapper } from './clickup-data-mapper.service';
import { DatabaseService } from '../../common/database/database.service';

/**
 * ClickUp Import Service
 * 
 * Handles the hierarchical import of ClickUp data into the knowledge base.
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
        private readonly db: DatabaseService
    ) { }

    /**
     * Fetch workspace structure for list selection UI
     * 
     * Returns hierarchical structure with task counts:
     * {
     *   workspace: { id, name },
     *   spaces: [
     *     {
     *       id, name, folders: [...], lists: [...]
     *     }
     *   ]
     * }
     */
    async fetchWorkspaceStructure(
        workspaceId: string,
        includeArchived: boolean = false
    ): Promise<any> {
        try {
            this.logger.log(`Fetching workspace structure for ${workspaceId}`);

            // 1. Fetch workspace metadata
            const workspacesResponse = await this.apiClient.getWorkspaces();
            const workspace = workspacesResponse.teams.find(t => t.id === workspaceId);
            if (!workspace) {
                const availableWorkspaces = workspacesResponse.teams.map(t => `${t.id} (${t.name})`).join(', ');
                throw new Error(`Workspace ${workspaceId} not found. Available workspaces: ${availableWorkspaces}`);
            }

            // 2. Fetch all spaces
            const spacesResponse = await this.apiClient.getSpaces(workspaceId, includeArchived);
            this.logger.log(`Found ${spacesResponse.spaces.length} spaces: ${spacesResponse.spaces.map(s => s.name).join(', ')}`);
            this.logger.debug(`Full spaces response: ${JSON.stringify(spacesResponse).substring(0, 1000)}`);

            // 3. Build hierarchical structure
            const spaces = await Promise.all(
                spacesResponse.spaces.map(async (space) => {
                    try {
                        // Fetch folders in space
                        const foldersResponse = await this.apiClient.getFolders(space.id, includeArchived);
                        this.logger.log(`Space "${space.name}": ${foldersResponse.folders.length} folders: ${foldersResponse.folders.map(f => f.name).join(', ') || '(none)'}`);
                        this.logger.debug(`Space "${space.name}" folders response: ${JSON.stringify(foldersResponse).substring(0, 1000)}`);

                        // Build folder structure with lists and task counts
                        const folders = await Promise.all(
                            foldersResponse.folders.map(async (folder) => {
                                try {
                                    const listsResponse = await this.apiClient.getListsInFolder(folder.id, includeArchived);
                                    this.logger.log(`  Folder "${folder.name}": ${listsResponse.lists.length} lists: ${listsResponse.lists.map(l => l.name).join(', ') || '(none)'}`);

                                    // Get task counts for each list
                                    const lists = await Promise.all(
                                        listsResponse.lists.map(async (list) => {
                                            try {
                                                // Use list.task_count from the API response if available
                                                // Otherwise fetch first page to check if tasks exist
                                                let taskCount = (list as any).task_count || 0;
                                                if (!taskCount) {
                                                    const tasksResponse = await this.apiClient.getTasksInList(list.id, {
                                                        archived: includeArchived,
                                                        page: 0
                                                    });
                                                    // Note: ClickUp doesn't return total count, so we just know if tasks exist
                                                    taskCount = tasksResponse.tasks?.length || 0;
                                                }
                                                return {
                                                    id: list.id,
                                                    name: list.name,
                                                    task_count: taskCount,
                                                    archived: list.archived || false,
                                                };
                                            } catch (error) {
                                                const err = error as Error;
                                                this.logger.warn(`Failed to get task count for list ${list.id}: ${err.message}`);
                                                return {
                                                    id: list.id,
                                                    name: list.name,
                                                    task_count: 0,
                                                    archived: list.archived || false,
                                                };
                                            }
                                        })
                                    );

                                    return {
                                        id: folder.id,
                                        name: folder.name,
                                        lists,
                                        archived: folder.archived || false,
                                    };
                                } catch (error) {
                                    const err = error as Error;
                                    this.logger.warn(`Failed to fetch lists for folder ${folder.id}: ${err.message}`);
                                    return {
                                        id: folder.id,
                                        name: folder.name,
                                        lists: [],
                                        archived: folder.archived || false,
                                    };
                                }
                            })
                        );

                        // Fetch folderless lists
                        const folderlessListsResponse = await this.apiClient.getFolderlessLists(space.id, includeArchived);
                        this.logger.log(`Space "${space.name}": ${folderlessListsResponse.lists.length} folderless lists: ${folderlessListsResponse.lists.map(l => l.name).join(', ') || '(none)'}`);
                        this.logger.debug(`Space "${space.name}" folderless lists response: ${JSON.stringify(folderlessListsResponse).substring(0, 1000)}`);
                        const folderlessLists = await Promise.all(
                            folderlessListsResponse.lists.map(async (list) => {
                                try {
                                    // Use list.task_count from the API response if available
                                    let taskCount = (list as any).task_count || 0;
                                    if (!taskCount) {
                                        const tasksResponse = await this.apiClient.getTasksInList(list.id, {
                                            archived: includeArchived,
                                            page: 0
                                        });
                                        taskCount = tasksResponse.tasks?.length || 0;
                                    }
                                    return {
                                        id: list.id,
                                        name: list.name,
                                        task_count: taskCount,
                                        archived: list.archived || false,
                                    };
                                } catch (error) {
                                    const err = error as Error;
                                    this.logger.warn(`Failed to get task count for list ${list.id}: ${err.message}`);
                                    return {
                                        id: list.id,
                                        name: list.name,
                                        task_count: 0,
                                        archived: list.archived || false,
                                    };
                                }
                            })
                        );

                        return {
                            id: space.id,
                            name: space.name,
                            folders,
                            lists: folderlessLists,
                            archived: space.archived || false,
                        };
                    } catch (error) {
                        const err = error as Error;
                        this.logger.warn(`Failed to fetch structure for space ${space.id}: ${err.message}`);
                        return {
                            id: space.id,
                            name: space.name,
                            folders: [],
                            lists: [],
                            archived: space.archived || false,
                        };
                    }
                })
            );

            const structure = {
                workspace: {
                    id: workspace.id,
                    name: workspace.name,
                },
                spaces,
            };

            this.logger.log(`Workspace structure fetched: ${spaces.length} spaces`);
            return structure;

        } catch (error) {
            const err = error as Error;
            this.logger.error(`Failed to fetch workspace structure: ${err.message}`, err.stack);
            throw new Error(`Failed to fetch workspace structure: ${err.message}`);
        }
    }

    /**
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
        const breakdown: Record<string, { imported: number; failed: number; skipped: number }> = {};

        try {
            // Update sync state to running
            await this.updateSyncState(integrationId, {
                sync_status: 'running',
                last_sync_at: new Date(),
            });

            this.logger.log(`Starting import for workspace ${workspaceId}`);

            // Set workspace ID in mapper for URL construction
            this.dataMapper.setWorkspaceId(workspaceId);

            // 1. Fetch workspace
            const workspacesResponse = await this.apiClient.getWorkspaces();
            const workspace = workspacesResponse.teams.find(t => t.id === workspaceId);
            if (!workspace) {
                throw new Error(`Workspace ${workspaceId} not found`);
            }

            // 2. Fetch all spaces
            const spacesResponse = await this.apiClient.getSpaces(workspaceId, config.includeArchived);
            this.logger.log(`Found ${spacesResponse.spaces.length} spaces`);

            breakdown['spaces'] = { imported: 0, failed: 0, skipped: 0 };
            breakdown['folders'] = { imported: 0, failed: 0, skipped: 0 };
            breakdown['lists'] = { imported: 0, failed: 0, skipped: 0 };
            breakdown['tasks'] = { imported: 0, failed: 0, skipped: 0 };

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
                        await this.storeDocument(projectId, orgId, integrationId, spaceDoc);
                        breakdown['spaces'].imported++;
                        totalImported++;

                        // 4. Fetch folders in space
                        const foldersResponse = await this.apiClient.getFolders(space.id, config.includeArchived);
                        this.logger.log(`Space ${space.name}: ${foldersResponse.folders.length} folders`);

                        // Import folders and their lists
                        for (const folder of foldersResponse.folders) {
                            try {
                                const folderDoc = this.dataMapper.mapFolder(folder, space.id);
                                await this.storeDocument(projectId, orgId, integrationId, folderDoc);
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

            // Update sync state to success
            await this.updateSyncState(integrationId, {
                sync_status: 'success',
                last_successful_sync: new Date(),
                total_synced: totalImported,
                sync_error: null,
            });

            const durationMs = Date.now() - startTime;
            this.logger.log(`Import completed: ${totalImported} imported, ${totalFailed} failed in ${durationMs}ms`);

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
                sync_status: 'error',
                sync_error: err.message,
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
                if (firstPageResponse.tasks.length > 0 && firstPageResponse.tasks[0].list) {
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
                await this.storeDocument(projectId, orgId, integrationId, listDoc);
                breakdown['lists'].imported++;

                // Import tasks from this list
                let page = 0;
                let hasMore = true;
                let taskCount = 0;

                // Process first page (already fetched)
                this.logger.log(`List ${listId}: page 0, ${firstPageResponse.tasks.length} tasks`);
                for (const task of firstPageResponse.tasks) {
                    try {
                        const taskDoc = this.dataMapper.mapTask(task, listId);
                        await this.storeDocument(projectId, orgId, integrationId, taskDoc);
                        breakdown['tasks'].imported++;
                        taskCount++;
                    } catch (error) {
                        const err = error as Error;
                        this.logger.error(`Failed to import task ${task.id}: ${err.message}`);
                        breakdown['tasks'].failed++;
                    }
                }

                hasMore = firstPageResponse.last_page === false && firstPageResponse.tasks.length > 0;
                page = 1;

                // Fetch remaining pages
                while (hasMore) {
                    const tasksPageResponse = await this.apiClient.getTasksInList(listId, {
                        archived: config.includeArchived,
                        page,
                        includeClosed: config.includeArchived,
                    });

                    this.logger.log(`List ${listId}: page ${page}, ${tasksPageResponse.tasks.length} tasks`);

                    for (const task of tasksPageResponse.tasks) {
                        try {
                            const taskDoc = this.dataMapper.mapTask(task, listId);
                            await this.storeDocument(projectId, orgId, integrationId, taskDoc);
                            breakdown['tasks'].imported++;
                            taskCount++;
                        } catch (error) {
                            const err = error as Error;
                            this.logger.error(`Failed to import task ${task.id}: ${err.message}`);
                            breakdown['tasks'].failed++;
                        }
                    }

                    // Check if there are more pages
                    hasMore = tasksPageResponse.last_page === false && tasksPageResponse.tasks.length > 0;
                    page++;

                    // Respect batch size if specified
                    if (config.batchSize && taskCount >= config.batchSize) {
                        this.logger.log(`Reached batch size limit (${config.batchSize}), stopping import for list ${listId}`);
                        break;
                    }
                }

                this.logger.log(`Completed import for list ${listId}: ${taskCount} tasks`);

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
                await this.storeDocument(projectId, orgId, integrationId, listDoc);
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

                    this.logger.log(`List ${list.name}: page ${page}, ${tasksResponse.tasks.length} tasks`);

                    for (const task of tasksResponse.tasks) {
                        try {
                            const taskDoc = this.dataMapper.mapTask(task, list.id);
                            await this.storeDocument(projectId, orgId, integrationId, taskDoc);
                            breakdown['tasks'].imported++;
                        } catch (error) {
                            const err = error as Error;
                            this.logger.error(`Failed to import task ${task.id}: ${err.message}`);
                            breakdown['tasks'].failed++;
                        }
                    }

                    // Check if there are more pages
                    hasMore = tasksResponse.last_page === false && tasksResponse.tasks.length > 0;
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
     * Store document in database
     * 
     * For now, this is a placeholder. In the full implementation,
     * this would call the graph service to create nodes and edges.
     * 
     * Source Tracking (spec/22-clickup-integration.md section 3.3.1):
     * - external_source: "clickup"
     * - external_id: ClickUp object ID
     * - external_url: Direct link to ClickUp
     * - external_parent_id: Parent object's ClickUp ID
     * - external_updated_at: Last modified in ClickUp
     * - synced_at: Will be set automatically by database
     */
    private async storeDocument(
        projectId: string,
        orgId: string,
        integrationId: string,
        doc: any
    ): Promise<void> {
        // TODO: Integrate with graph service to create proper nodes
        // For now, just log what we would store
        this.logger.debug(`Would store: ${doc.external_type} - ${doc.title} (${doc.external_id})`);
        this.logger.debug(`  URL: ${doc.external_url}`);
        this.logger.debug(`  Parent: ${doc.external_parent_id}`);

        // Placeholder: Store in a temporary table or log
        // In full implementation, this would be:
        // await this.graphService.createObject({
        //   org_id: orgId,
        //   project_id: projectId,
        //   type: doc.external_type,
        //   properties: {
        //     title: doc.title,
        //     content: doc.content,
        //     ...doc.metadata,
        //   },
        //   external_source: doc.external_source,
        //   external_id: doc.external_id,
        //   external_url: doc.external_url,
        //   external_parent_id: doc.external_parent_id,
        //   external_updated_at: doc.external_updated_at,
        // });
    }

    /**
     * Update ClickUp sync state
     */
    private async updateSyncState(integrationId: string, updates: Record<string, any>): Promise<void> {
        const setClause = Object.keys(updates)
            .map((key, idx) => `${key} = $${idx + 2}`)
            .join(', ');

        const values = Object.values(updates);

        await this.db.query(
            `INSERT INTO kb.clickup_sync_state (integration_id, ${Object.keys(updates).join(', ')})
             VALUES ($1, ${Object.keys(updates).map((_, idx) => `$${idx + 2}`).join(', ')})
             ON CONFLICT (integration_id)
             DO UPDATE SET ${setClause}`,
            [integrationId, ...values, ...values]
        );
    }
}
