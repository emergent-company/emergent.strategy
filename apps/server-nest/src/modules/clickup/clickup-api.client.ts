import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosError } from 'axios';
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
 * Handles all communication with the ClickUp API v2.
 * Implements rate limiting, error handling, and retry logic.
 * 
 * Rate Limits:
 * - 100 requests per minute per workspace
 * - Automatically waits when limit is reached
 * 
 * Error Handling:
 * - Retries on 429 (rate limit) with exponential backoff
 * - Retries on 5xx errors (server errors)
 * - Throws descriptive errors for 4xx errors
 * 
 * @see https://clickup.com/api
 */
@Injectable()
export class ClickUpApiClient {
    private readonly logger = new Logger(ClickUpApiClient.name);
    private client: AxiosInstance | null = null;
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
        this.client = axios.create({
            baseURL: 'https://api.clickup.com/api/v2',
            headers: {
                'Authorization': apiToken,
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 seconds
        });

        this.logger.log(`ClickUp API client configured with token: ${apiToken.substring(0, 10)}...`);
    }

    /**
     * Make an API request with rate limiting and retries
     */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        data?: any,
        params?: any,
        retries: number = 3
    ): Promise<T> {
        if (!this.client) {
            throw new Error('ClickUp API client not configured. Call configure() first.');
        }

        // Wait for rate limiter
        await this.rateLimiter.waitForSlot();

        try {
            const response = await this.client.request<T>({
                method,
                url: path,
                data,
                params,
            });

            // Log API responses for debugging (redact sensitive data)
            if (process.env.NODE_ENV !== 'production') {
                this.logger.debug(`API Response: ${method} ${path}`);
                this.logger.debug(`Response data: ${JSON.stringify(response.data).substring(0, 500)}...`);
            }

            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError;

            // Retry on rate limit (429) or server errors (5xx)
            if (axiosError.response?.status === 429 && retries > 0) {
                const retryAfter = axiosError.response.headers['retry-after'];
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;

                this.logger.warn(`Rate limited. Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));

                return this.request(method, path, data, params, retries - 1);
            }

            if (axiosError.response?.status && axiosError.response.status >= 500 && retries > 0) {
                const waitTime = Math.pow(2, 4 - retries) * 1000; // Exponential backoff

                this.logger.warn(`Server error ${axiosError.response.status}. Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));

                return this.request(method, path, data, params, retries - 1);
            }

            // Handle 4xx errors
            if (axiosError.response?.status && axiosError.response.status >= 400) {
                const errorData = axiosError.response.data as any;
                const message = errorData?.err || errorData?.error || axiosError.message;
                throw new Error(`ClickUp API error (${axiosError.response.status}): ${message}`);
            }

            throw new Error(`ClickUp API request failed: ${axiosError.message}`);
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
        return this.request<ClickUpWorkspacesResponse>('GET', '/team');
    }

    /**
     * Get spaces in a workspace
     * Note: ClickUp API may paginate results, but doesn't document pagination for spaces endpoint
     */
    async getSpaces(workspaceId: string, archived: boolean = false): Promise<ClickUpSpacesResponse> {
        return this.request<ClickUpSpacesResponse>('GET', `/team/${workspaceId}/space`, undefined, {
            archived,
        });
    }

    /**
     * Get folders in a space
     * Note: ClickUp API may paginate results, but doesn't document pagination for folders endpoint
     */
    async getFolders(spaceId: string, archived: boolean = false): Promise<ClickUpFoldersResponse> {
        return this.request<ClickUpFoldersResponse>('GET', `/space/${spaceId}/folder`, undefined, {
            archived,
        });
    }

    /**
     * Get lists in a folder
     * Note: ClickUp API may paginate results, but doesn't document pagination for lists endpoint
     */
    async getListsInFolder(folderId: string, archived: boolean = false): Promise<ClickUpListsResponse> {
        return this.request<ClickUpListsResponse>('GET', `/folder/${folderId}/list`, undefined, {
            archived,
        });
    }

    /**
     * Get folderless lists in a space
     * Note: ClickUp API may paginate results, but doesn't document pagination for lists endpoint
     */
    async getFolderlessLists(spaceId: string, archived: boolean = false): Promise<ClickUpListsResponse> {
        return this.request<ClickUpListsResponse>('GET', `/space/${spaceId}/list`, undefined, {
            archived,
        });
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
        return this.request<ClickUpTasksResponse>('GET', `/list/${listId}/task`, undefined, {
            archived: options.archived || false,
            page: options.page || 0,
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
        });
    }

    /**
     * Get a single task by ID
     */
    async getTask(taskId: string, includeSubtasks: boolean = false): Promise<ClickUpTask> {
        return this.request<ClickUpTask>('GET', `/task/${taskId}`, undefined, {
            include_subtasks: includeSubtasks,
        });
    }

    /**
     * Get comments for a task
     */
    async getTaskComments(taskId: string): Promise<ClickUpCommentsResponse> {
        return this.request<ClickUpCommentsResponse>('GET', `/task/${taskId}/comment`);
    }

    /**
     * Get comments for a list
     */
    async getListComments(listId: string): Promise<ClickUpCommentsResponse> {
        return this.request<ClickUpCommentsResponse>('GET', `/list/${listId}/comment`);
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
        return this.request<ClickUpTasksResponse>('GET', `/team/${workspaceId}/task`, undefined, {
            query,
            page: options.page || 0,
            order_by: options.orderBy,
            reverse: options.reverse,
        });
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
        return this.client !== null && this.apiToken !== null;
    }
}
