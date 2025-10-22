import { Injectable, Logger } from '@nestjs/common';
import clickupSdk from '@api/clickup';
import {
    ClickUpWorkspacesResponse,
    ClickUpSpacesResponse,
    ClickUpFoldersResponse,
    ClickUpListsResponse,
    ClickUpTasksResponse,
    ClickUpCommentsResponse,
    ClickUpTask,
    ClickUpList,
    ClickUpFolder,
    ClickUpSpace,
    // v3 API types for Docs
    ClickUpDoc,
    ClickUpPage,
} from './clickup.types';

/**
 * Rate Limiter for ClickUp API
 * 
 * ClickUp has a rate limit of 100 requests per minute per workspace.
 * This rate limiter ensures we stay under that limit.
 */
class RateLimiter {
    private queue: Array<() => void> = [];
    private requestTimestamps: number[] = [];
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number = 100, windowMs: number = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    /**
     * Wait until we can make a request
     */
    async waitForSlot(): Promise<void> {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                // Remove timestamps outside the window
                const now = Date.now();
                this.requestTimestamps = this.requestTimestamps.filter(
                    ts => now - ts < this.windowMs
                );

                // Check if we have capacity
                if (this.requestTimestamps.length < this.maxRequests) {
                    this.requestTimestamps.push(now);
                    resolve();
                } else {
                    // Wait until the oldest request expires
                    const oldestTimestamp = this.requestTimestamps[0];
                    const waitTime = this.windowMs - (now - oldestTimestamp) + 100; // +100ms buffer
                    setTimeout(tryAcquire, waitTime);
                }
            };

            tryAcquire();
        });
    }

    /**
     * Reset the rate limiter
     */
    reset(): void {
        this.requestTimestamps = [];
        this.queue = [];
    }
}

/**
 * ClickUp API Client
 * 
 * Handles all communication with the ClickUp API using the official SDK.
 * Implements rate limiting for additional safety on top of SDK functionality.
 * 
 * Rate Limits:
 * - 100 requests per minute per workspace
 * - Automatically waits when limit is reached
 * 
 * Error Handling:
 * - SDK handles retries and errors internally
 * - Rate limiter provides additional safety layer
 * 
 * @see https://clickup.com/api
 */
@Injectable()
export class ClickUpApiClient {
    private readonly logger = new Logger(ClickUpApiClient.name);
    private sdk = clickupSdk;
    private rateLimiter: RateLimiter;
    private apiToken: string | null = null;

    constructor() {
        this.rateLimiter = new RateLimiter(100, 60000); // 100 req/min
    }

    /**
     * Initialize the API client with an API token
     */
    configure(apiToken: string): void {
        if (!apiToken) {
            throw new Error('ClickUp API token is required');
        }

        this.apiToken = apiToken;

        // Configure SDK with authentication and timeout
        this.sdk.auth(apiToken);
        this.sdk.config({ timeout: 30000 }); // 30 seconds

        this.logger.log(`ClickUp API client configured with token: ${apiToken.substring(0, 10)}...`);
    }

    /**
     * Helper method to wrap SDK calls with rate limiting and error handling
     */
    private async sdkCall<T>(
        sdkMethod: () => Promise<{ data: T; status: number }>,
        methodName: string
    ): Promise<T> {
        if (!this.apiToken) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        // Wait for rate limiter
        await this.rateLimiter.waitForSlot();

        try {
            const response = await sdkMethod();

            // Log API responses for debugging (redact sensitive data)
            if (process.env.NODE_ENV !== 'production') {
                this.logger.debug(`SDK Call: ${methodName}`);
                this.logger.debug(`Response data: ${JSON.stringify(response.data).substring(0, 500)}...`);
            }

            return response.data;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`ClickUp SDK error in ${methodName}: ${err.message}`);
            throw new Error(`ClickUp API request failed: ${err.message}`);
        }
    }

    /**
     * Test API connection
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.getWorkspaces();
            return true;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`Connection test failed: ${err.message}`);
            throw err;
        }
    }

    /**
     * Get all workspaces (teams)
     */
    async getWorkspaces(): Promise<ClickUpWorkspacesResponse> {
        return this.sdkCall(
            () => this.sdk.getAuthorizedTeams(),
            'getWorkspaces'
        ) as Promise<ClickUpWorkspacesResponse>;
    }

    /**
     * Get spaces in a workspace
     * Note: ClickUp API may paginate results, but doesn't document pagination for spaces endpoint
     */
    async getSpaces(workspaceId: string, archived: boolean = false): Promise<ClickUpSpacesResponse> {
        return this.sdkCall(
            () => this.sdk.getSpaces({ team_id: parseInt(workspaceId), archived }),
            'getSpaces'
        ) as unknown as Promise<ClickUpSpacesResponse>;
    }

    /**
     * Get folders in a space
     * Note: ClickUp API may paginate results, but doesn't document pagination for folders endpoint
     */
    async getFolders(spaceId: string, archived: boolean = false): Promise<ClickUpFoldersResponse> {
        return this.sdkCall(
            () => this.sdk.getFolders({ space_id: parseInt(spaceId), archived }),
            'getFolders'
        ) as unknown as Promise<ClickUpFoldersResponse>;
    }

    /**
     * Get lists in a folder
     * Note: ClickUp API may paginate results, but doesn't document pagination for lists endpoint
     */
    async getListsInFolder(folderId: string, archived: boolean = false): Promise<ClickUpListsResponse> {
        return this.sdkCall(
            () => this.sdk.getLists({ folder_id: parseInt(folderId), archived }),
            'getListsInFolder'
        ) as unknown as Promise<ClickUpListsResponse>;
    }

    /**
     * Get folderless lists in a space
     * Note: ClickUp API may paginate results, but doesn't document pagination for lists endpoint
     */
    async getFolderlessLists(spaceId: string, archived: boolean = false): Promise<ClickUpListsResponse> {
        return this.sdkCall(
            () => this.sdk.getFolderlessLists({ space_id: parseInt(spaceId), archived }),
            'getFolderlessLists'
        ) as unknown as Promise<ClickUpListsResponse>;
    }

    /**
     * Get tasks in a list
     * 
     * Supports pagination via page parameter (0-indexed)
     */
    async getTasksInList(
        listId: string,
        options: {
            archived?: boolean;
            page?: number;
            orderBy?: string;
            reverse?: boolean;
            subtasks?: boolean;
            statuses?: string[];
            includeClosed?: boolean;
            assignees?: string[];
            tags?: string[];
            dueDateGt?: number;
            dueDateLt?: number;
            dateCreatedGt?: number;
            dateCreatedLt?: number;
            dateUpdatedGt?: number;
            dateUpdatedLt?: number;
        } = {}
    ): Promise<ClickUpTasksResponse> {
        return this.sdkCall(
            () => this.sdk.getTasks({
                list_id: parseInt(listId),
                archived: options.archived,
                page: options.page,
                order_by: options.orderBy,
                reverse: options.reverse,
                subtasks: options.subtasks,
                statuses: options.statuses,
                include_closed: options.includeClosed,
                assignees: options.assignees,
                tags: options.tags,
                due_date_gt: options.dueDateGt,
                due_date_lt: options.dueDateLt,
                date_created_gt: options.dateCreatedGt,
                date_created_lt: options.dateCreatedLt,
                date_updated_gt: options.dateUpdatedGt,
                date_updated_lt: options.dateUpdatedLt,
            }),
            'getTasksInList'
        ) as unknown as Promise<ClickUpTasksResponse>;
    }

    /**
     * Get a single task by ID
     */
    async getTask(taskId: string, includeSubtasks: boolean = false): Promise<ClickUpTask> {
        return this.sdkCall(
            () => this.sdk.getTask({
                task_id: taskId,
                include_subtasks: includeSubtasks
            }),
            'getTask'
        ) as unknown as Promise<ClickUpTask>;
    }

    /**
     * Get comments for a task
     */
    async getTaskComments(taskId: string): Promise<ClickUpCommentsResponse> {
        return this.sdkCall(
            () => this.sdk.getTaskComments({ task_id: taskId }),
            'getTaskComments'
        ) as unknown as Promise<ClickUpCommentsResponse>;
    }

    /**
     * Get comments for a list
     */
    async getListComments(listId: string): Promise<ClickUpCommentsResponse> {
        return this.sdkCall(
            () => this.sdk.getListComments({ list_id: parseInt(listId) }),
            'getListComments'
        ) as unknown as Promise<ClickUpCommentsResponse>;
    }

    /**
     * Search for tasks across a workspace
     */
    async searchTasks(
        workspaceId: string,
        query: string,
        options: {
            page?: number;
            orderBy?: string;
            reverse?: boolean;
        } = {}
    ): Promise<ClickUpTasksResponse> {
        return this.sdkCall(
            () => this.sdk.getFilteredTeamTasks({
                team_Id: parseInt(workspaceId),
                query,
                page: options.page,
                order_by: options.orderBy,
                reverse: options.reverse,
            }),
            'searchTasks'
        ) as unknown as Promise<ClickUpTasksResponse>;
    }

    /**
     * Reset rate limiter (useful for testing)
     */
    resetRateLimiter(): void {
        this.rateLimiter.reset();
    }

    /**
     * Check if client is configured
     */
    isConfigured(): boolean {
        return this.apiToken !== null;
    }

    // ============================================================================
    // ClickUp API v3 - Docs Endpoints
    // ============================================================================

    /**
     * Get all docs in a workspace (v3 API)
     * @param workspaceId - The workspace ID
     * @param cursor - Optional pagination cursor
     * @param parentId - Optional parent ID to filter docs
     * @param parentType - Optional parent type (SPACE, FOLDER, LIST, EVERYTHING, WORKSPACE)
     * @returns List of docs with pagination cursor
     */
    async getDocs(
        workspaceId: string,
        cursor?: string,
        parentId?: string,
        parentType?: string
    ): Promise<{ docs: ClickUpDoc[]; next_cursor?: string }> {
        return this.sdkCall(
            () => this.sdk.searchDocs({
                workspaceId: parseInt(workspaceId),
                next_cursor: cursor,
                parent_id: parentId,
                parent_type: parentType,
            }),
            'getDocs'
        ) as unknown as Promise<{ docs: ClickUpDoc[]; next_cursor?: string }>;
    }

    /**
     * Get a specific doc (v3 API)
     * @param workspaceId - The workspace ID
     * @param docId - The doc ID
     * @returns Doc details
     */
    async getDoc(workspaceId: string, docId: string): Promise<ClickUpDoc> {
        return this.sdkCall(
            () => this.sdk.getDoc({
                workspaceId: parseInt(workspaceId),
                docId: docId,
            }),
            'getDoc'
        ) as unknown as Promise<ClickUpDoc>;
    }

    /**
     * Get pages for a doc (v3 API)
     * @param workspaceId - The workspace ID
     * @param docId - The doc ID
     * @returns Array of pages (may be nested with child pages)
     */
    async getDocPages(workspaceId: string, docId: string): Promise<ClickUpPage[]> {
        return this.sdkCall(
            () => this.sdk.getDocPages({
                workspaceId: parseInt(workspaceId),
                docId: docId,
            }),
            'getDocPages'
        ) as unknown as Promise<ClickUpPage[]>;
    }

    /**
     * Get a specific page from a doc (v3 API)
     * @param workspaceId - The workspace ID
     * @param docId - The doc ID
     * @param pageId - The page ID
     * @returns Page details with full content
     */
    async getPage(
        workspaceId: string,
        docId: string,
        pageId: string
    ): Promise<ClickUpPage> {
        return this.sdkCall(
            () => this.sdk.getPage({
                workspaceId: parseInt(workspaceId),
                docId: docId,
                pageId: pageId,
            }),
            'getPage'
        ) as unknown as Promise<ClickUpPage>;
    }
}
