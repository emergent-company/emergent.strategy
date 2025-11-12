import { Injectable, Logger } from '@nestjs/common';
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
          (ts) => now - ts < this.windowMs
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
 * Handles all communication with the ClickUp API using plain HTTP fetch calls.
 * Implements rate limiting to stay within ClickUp's API limits.
 *
 * Rate Limits:
 * - 100 requests per minute per workspace
 * - Automatically waits when limit is reached
 *
 * Error Handling:
 * - All methods include comprehensive error handling
 * - Failed requests are logged with detailed error messages
 *
 * @see https://clickup.com/api
 */
@Injectable()
export class ClickUpApiClient {
  private readonly logger = new Logger(ClickUpApiClient.name);
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

    this.logger.log(
      `ClickUp API client configured with token: ${apiToken.substring(
        0,
        10
      )}...`
    );
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
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const response = await fetch('https://api.clickup.com/api/v2/team', {
        headers: {
          Authorization: this.apiToken,
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
  async getSpaces(
    workspaceId: string,
    archived: boolean = false
  ): Promise<ClickUpSpacesResponse> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = new URL(
        `https://api.clickup.com/api/v2/team/${workspaceId}/space`
      );
      if (archived) {
        url.searchParams.set('archived', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: this.apiToken,
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
  async getFolders(
    spaceId: string,
    archived: boolean = false
  ): Promise<ClickUpFoldersResponse> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = new URL(
        `https://api.clickup.com/api/v2/space/${spaceId}/folder`
      );
      if (archived) {
        url.searchParams.set('archived', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: this.apiToken,
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
  async getListsInFolder(
    folderId: string,
    archived: boolean = false
  ): Promise<ClickUpListsResponse> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = new URL(
        `https://api.clickup.com/api/v2/folder/${folderId}/list`
      );
      if (archived) {
        url.searchParams.set('archived', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: this.apiToken,
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
      this.logger.error(
        `ClickUp API error in getListsInFolder: ${err.message}`
      );
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get folderless lists in a space
   * Note: ClickUp API may paginate results, but doesn't document pagination for lists endpoint
   */
  async getFolderlessLists(
    spaceId: string,
    archived: boolean = false
  ): Promise<ClickUpListsResponse> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = new URL(
        `https://api.clickup.com/api/v2/space/${spaceId}/list`
      );
      if (archived) {
        url.searchParams.set('archived', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: this.apiToken,
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
      this.logger.error(
        `ClickUp API error in getFolderlessLists: ${err.message}`
      );
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
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
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
        options.statuses.forEach((status) =>
          url.searchParams.append('statuses[]', status)
        );
      }
      if (options.assignees && options.assignees.length > 0) {
        options.assignees.forEach((assignee) =>
          url.searchParams.append('assignees[]', assignee)
        );
      }
      if (options.tags && options.tags.length > 0) {
        options.tags.forEach((tag) => url.searchParams.append('tags[]', tag));
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
          Authorization: this.apiToken,
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
  async getTask(
    taskId: string,
    includeSubtasks: boolean = false
  ): Promise<ClickUpTask> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = new URL(`https://api.clickup.com/api/v2/task/${taskId}`);
      if (includeSubtasks) {
        url.searchParams.set('include_subtasks', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: this.apiToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as ClickUpTask;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getTask: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get comments for a task
   */
  async getTaskComments(taskId: string): Promise<ClickUpCommentsResponse> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const response = await fetch(
        `https://api.clickup.com/api/v2/task/${taskId}/comment`,
        {
          headers: {
            Authorization: this.apiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as ClickUpCommentsResponse;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getTaskComments: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get comments for a list
   */
  async getListComments(listId: string): Promise<ClickUpCommentsResponse> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const response = await fetch(
        `https://api.clickup.com/api/v2/list/${listId}/comment`,
        {
          headers: {
            Authorization: this.apiToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as ClickUpCommentsResponse;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getListComments: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
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
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = new URL(
        `https://api.clickup.com/api/v2/team/${workspaceId}/task`
      );
      url.searchParams.set('query', query);
      if (options.page !== undefined) {
        url.searchParams.set('page', options.page.toString());
      }
      if (options.orderBy) {
        url.searchParams.set('order_by', options.orderBy);
      }
      if (options.reverse !== undefined) {
        url.searchParams.set('reverse', options.reverse.toString());
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: this.apiToken,
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
      this.logger.error(`ClickUp API error in searchTasks: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
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
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = new URL(
        `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs`
      );
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      if (parentId) {
        url.searchParams.set('parent', parentId);
      }
      if (parentType) {
        url.searchParams.set('parent_type', parentType);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: this.apiToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as { docs: ClickUpDoc[]; next_cursor?: string };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getDocs: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get a specific doc (v3 API)
   * @param workspaceId - The workspace ID
   * @param docId - The doc ID
   * @returns Doc details
   */
  async getDoc(workspaceId: string, docId: string): Promise<ClickUpDoc> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}`;

      const response = await fetch(url, {
        headers: {
          Authorization: this.apiToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as ClickUpDoc;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getDoc: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get pages for a doc (v3 API)
   * @param workspaceId - The workspace ID
   * @param docId - The doc ID
   * @returns Array of pages (may be nested with child pages)
   */
  async getDocPages(
    workspaceId: string,
    docId: string
  ): Promise<ClickUpPage[]> {
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`;

      const response = await fetch(url, {
        headers: {
          Authorization: this.apiToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as ClickUpPage[];
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getDocPages: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
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
    if (!this.apiToken) {
      throw new Error(
        'ClickUp API client not configured. Call configure() first.'
      );
    }

    await this.rateLimiter.waitForSlot();

    try {
      const url = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}`;

      const response = await fetch(url, {
        headers: {
          Authorization: this.apiToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as ClickUpPage;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getPage: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }
}
