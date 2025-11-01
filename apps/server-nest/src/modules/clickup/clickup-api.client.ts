import { Injectable, Logger } from '@nestjs/common';
// Dynamic import for ES module SDK
// import clickupSdk from '@api/clickup';
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
    private sdk: any = null; // Will be dynamically imported
    private rateLimiter: RateLimiter;
    private apiToken: string | null = null;
    private sdkInitPromise: Promise<void> | null = null;

    constructor() {
        this.rateLimiter = new RateLimiter(100, 60000); // 100 req/min
        // Start SDK initialization immediately
        this.sdkInitPromise = this.initializeSdk();
    }

    /**
     * Dynamically import the ES module SDK
     */
    private async initializeSdk(): Promise<void> {
        try {
            const module = await import('@api/clickup');
            this.sdk = module.default;
            this.logger.log('ClickUp SDK loaded successfully');
        } catch (error) {
            this.logger.error('Failed to load ClickUp SDK:', error);
            throw error;
        }
    }

    /**
     * Ensure SDK is loaded before use
     */
    private async ensureSdkLoaded(): Promise<void> {
        if (this.sdkInitPromise) {
            await this.sdkInitPromise;
        }
        if (!this.sdk) {
            throw new Error('ClickUp SDK failed to initialize');
        }
    }

    /**
     * Initialize the API client with an API token
     */
    async configure(apiToken: string): Promise<void> {
        if (!apiToken) {
            throw new Error('ClickUp API token is required');
        }

        // Ensure SDK is loaded first
        await this.ensureSdkLoaded();

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

        // Ensure SDK is loaded
        await this.ensureSdkLoaded();

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
        if (!this.apiToken) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        await this.rateLimiter.waitForSlot();

        try {
            const response = await fetch('https://api.clickup.com/api/v2/team', {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data as ClickUpWorkspacesResponse;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`ClickUp API error in getWorkspaces: ${err.message}`);
            throw new Error(`ClickUp API request failed: ${err.message}`);
        }
    }

    /**
     * Get spaces in a workspace
     * Note: ClickUp API may paginate results, but doesn't document pagination for spaces endpoint
     */
    async getSpaces(workspaceId: string, archived: boolean = false): Promise<ClickUpSpacesResponse> {
        if (!this.apiToken) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        await this.rateLimiter.waitForSlot();

        try {
            const url = new URL(`https://api.clickup.com/api/v2/team/${workspaceId}/space`);
            if (archived) {
                url.searchParams.set('archived', 'true');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data as ClickUpSpacesResponse;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`ClickUp API error in getSpaces: ${err.message}`);
            throw new Error(`ClickUp API request failed: ${err.message}`);
        }
    }

    /**
     * Get folders in a space
     * Note: ClickUp API may paginate results, but doesn't document pagination for folders endpoint
     */
    async getFolders(spaceId: string, archived: boolean = false): Promise<ClickUpFoldersResponse> {
        if (!this.apiToken) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        await this.rateLimiter.waitForSlot();

        try {
            const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/folder`);
            if (archived) {
                url.searchParams.set('archived', 'true');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data as ClickUpFoldersResponse;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`ClickUp API error in getFolders: ${err.message}`);
            throw new Error(`ClickUp API request failed: ${err.message}`);
        }
    }

    /**
     * Get lists in a folder
     * Note: ClickUp API may paginate results, but doesn't document pagination for lists endpoint
     */
    async getListsInFolder(folderId: string, archived: boolean = false): Promise<ClickUpListsResponse> {
        if (!this.apiToken) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        await this.rateLimiter.waitForSlot();

        try {
            const url = new URL(`https://api.clickup.com/api/v2/folder/${folderId}/list`);
            if (archived) {
                url.searchParams.set('archived', 'true');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data as ClickUpListsResponse;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`ClickUp API error in getListsInFolder: ${err.message}`);
            throw new Error(`ClickUp API request failed: ${err.message}`);
        }
    }

    /**
     * Get folderless lists in a space
     * Note: ClickUp API may paginate results, but doesn't document pagination for lists endpoint
     */
    async getFolderlessLists(spaceId: string, archived: boolean = false): Promise<ClickUpListsResponse> {
        if (!this.apiToken) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        await this.rateLimiter.waitForSlot();

        try {
            const url = new URL(`https://api.clickup.com/api/v2/space/${spaceId}/list`);
            if (archived) {
                url.searchParams.set('archived', 'true');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data as ClickUpListsResponse;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`ClickUp API error in getFolderlessLists: ${err.message}`);
            throw new Error(`ClickUp API request failed: ${err.message}`);
        }
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
        if (!this.apiToken) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        await this.rateLimiter.waitForSlot();

        try {
            const url = new URL(`https://api.clickup.com/api/v2/list/${listId}/task`);

            if (options.archived !== undefined) {
                url.searchParams.set('archived', String(options.archived));
            }
            if (options.page !== undefined) {
                url.searchParams.set('page', String(options.page));
            }
            if (options.orderBy) {
                url.searchParams.set('order_by', options.orderBy);
            }
            if (options.reverse !== undefined) {
                url.searchParams.set('reverse', String(options.reverse));
            }
            if (options.subtasks !== undefined) {
                url.searchParams.set('subtasks', String(options.subtasks));
            }
            if (options.includeClosed !== undefined) {
                url.searchParams.set('include_closed', String(options.includeClosed));
            }
            if (options.statuses && options.statuses.length > 0) {
                options.statuses.forEach(status => url.searchParams.append('statuses[]', status));
            }
            if (options.assignees && options.assignees.length > 0) {
                options.assignees.forEach(assignee => url.searchParams.append('assignees[]', assignee));
            }
            if (options.tags && options.tags.length > 0) {
                options.tags.forEach(tag => url.searchParams.append('tags[]', tag));
            }
            if (options.dueDateGt) {
                url.searchParams.set('due_date_gt', String(options.dueDateGt));
            }
            if (options.dueDateLt) {
                url.searchParams.set('due_date_lt', String(options.dueDateLt));
            }
            if (options.dateCreatedGt) {
                url.searchParams.set('date_created_gt', String(options.dateCreatedGt));
            }
            if (options.dateCreatedLt) {
                url.searchParams.set('date_created_lt', String(options.dateCreatedLt));
            }
            if (options.dateUpdatedGt) {
                url.searchParams.set('date_updated_gt', String(options.dateUpdatedGt));
            }
            if (options.dateUpdatedLt) {
                url.searchParams.set('date_updated_lt', String(options.dateUpdatedLt));
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Authorization': this.apiToken,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data as ClickUpTasksResponse;
        } catch (error) {
            const err = error as Error;
            this.logger.error(`ClickUp API error in getTasksInList: ${err.message}`);
            throw new Error(`ClickUp API request failed: ${err.message}`);
        }
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
