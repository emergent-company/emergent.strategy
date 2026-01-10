import { Injectable, Logger } from '@nestjs/common';
import {
  ClickUpWorkspacesResponse,
  ClickUpSpacesResponse,
  ClickUpDoc,
  ClickUpPage,
} from '../../../clickup/clickup.types';

/**
 * Rate Limiter for ClickUp API
 *
 * ClickUp has a rate limit of 100 requests per minute per workspace.
 * This rate limiter ensures we stay under that limit.
 */
class RateLimiter {
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
  }
}

/**
 * ClickUp API Service (Stateless)
 *
 * Handles all communication with the ClickUp API using plain HTTP fetch calls.
 * This is a stateless version of the ClickUpApiClient that accepts config
 * with each method call, suitable for the DataSourceProvider pattern.
 *
 * Implements rate limiting to stay within ClickUp's API limits.
 *
 * Rate Limits:
 * - 100 requests per minute per workspace
 * - Automatically waits when limit is reached
 *
 * @see https://clickup.com/api
 */
@Injectable()
export class ClickUpApiService {
  private readonly logger = new Logger(ClickUpApiService.name);
  private rateLimiter: RateLimiter;

  constructor() {
    this.rateLimiter = new RateLimiter(100, 60000); // 100 req/min
  }

  /**
   * Make an authenticated API request
   */
  private async request<T>(
    apiToken: string,
    url: string,
    options?: RequestInit
  ): Promise<T> {
    await this.rateLimiter.waitForSlot();

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: apiToken,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `HTTP ${response.status}: ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Get all workspaces (teams)
   */
  async getWorkspaces(apiToken: string): Promise<ClickUpWorkspacesResponse> {
    try {
      return await this.request<ClickUpWorkspacesResponse>(
        apiToken,
        'https://api.clickup.com/api/v2/team'
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getWorkspaces: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get spaces in a workspace
   */
  async getSpaces(
    apiToken: string,
    workspaceId: string,
    archived: boolean = false
  ): Promise<ClickUpSpacesResponse> {
    try {
      const url = new URL(
        `https://api.clickup.com/api/v2/team/${workspaceId}/space`
      );
      if (archived) {
        url.searchParams.set('archived', 'true');
      }

      return await this.request<ClickUpSpacesResponse>(
        apiToken,
        url.toString()
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getSpaces: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  // ============================================================================
  // ClickUp API v3 - Docs Endpoints
  // ============================================================================

  /**
   * Get all docs in a workspace (v3 API)
   * @param apiToken - ClickUp API token
   * @param workspaceId - The workspace ID
   * @param cursor - Optional pagination cursor
   * @param parentId - Optional parent ID to filter docs (e.g., space ID)
   * @param parentType - Optional parent type (SPACE, FOLDER, LIST, EVERYTHING, WORKSPACE)
   * @returns List of docs with pagination cursor
   */
  async getDocs(
    apiToken: string,
    workspaceId: string,
    cursor?: string,
    parentId?: string,
    parentType?: string
  ): Promise<{ docs: ClickUpDoc[]; next_cursor?: string }> {
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

      return await this.request<{ docs: ClickUpDoc[]; next_cursor?: string }>(
        apiToken,
        url.toString()
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getDocs: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get a specific doc (v3 API)
   * @param apiToken - ClickUp API token
   * @param workspaceId - The workspace ID
   * @param docId - The doc ID
   * @returns Doc details
   */
  async getDoc(
    apiToken: string,
    workspaceId: string,
    docId: string
  ): Promise<ClickUpDoc> {
    try {
      const url = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}`;
      return await this.request<ClickUpDoc>(apiToken, url);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getDoc: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get pages for a doc (v3 API)
   * @param apiToken - ClickUp API token
   * @param workspaceId - The workspace ID
   * @param docId - The doc ID
   * @returns Array of pages (may be nested with child pages)
   */
  async getDocPages(
    apiToken: string,
    workspaceId: string,
    docId: string
  ): Promise<ClickUpPage[]> {
    try {
      const url = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages`;
      return await this.request<ClickUpPage[]>(apiToken, url);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getDocPages: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Get a specific page from a doc (v3 API)
   * @param apiToken - ClickUp API token
   * @param workspaceId - The workspace ID
   * @param docId - The doc ID
   * @param pageId - The page ID
   * @returns Page details with full content
   */
  async getPage(
    apiToken: string,
    workspaceId: string,
    docId: string,
    pageId: string
  ): Promise<ClickUpPage> {
    try {
      const url = `https://api.clickup.com/api/v3/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}`;
      return await this.request<ClickUpPage>(apiToken, url);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`ClickUp API error in getPage: ${err.message}`);
      throw new Error(`ClickUp API request failed: ${err.message}`);
    }
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset();
  }
}
