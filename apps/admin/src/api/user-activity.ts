/**
 * User Activity API Client
 *
 * TypeScript client for user activity tracking endpoints.
 * Used for recording and retrieving recently accessed documents and objects.
 */

/**
 * Recent item entity from the API
 */
export interface RecentItem {
  id: string;
  resourceType: 'document' | 'object';
  resourceId: string;
  resourceName: string | null;
  resourceSubtype: string | null;
  actionType: 'viewed' | 'edited';
  accessedAt: string;
}

/**
 * Response from getRecentItems endpoint
 */
export interface RecentItemsResponse {
  objects: RecentItem[];
  documents: RecentItem[];
}

/**
 * Payload for recording activity
 */
export interface RecordActivityPayload {
  resourceType: 'document' | 'object';
  resourceId: string;
  resourceName?: string;
  resourceSubtype?: string;
  actionType: 'viewed' | 'edited';
}

/**
 * API client interface
 *
 * Usage:
 * ```typescript
 * const { apiBase, fetchJson } = useApi();
 * const client = createUserActivityClient(apiBase, fetchJson);
 *
 * // Record activity (fire-and-forget style)
 * client.recordActivity({
 *   resourceType: 'document',
 *   resourceId: 'doc-uuid',
 *   resourceName: 'requirements.pdf',
 *   resourceSubtype: 'application/pdf',
 *   actionType: 'viewed',
 * });
 *
 * // Get recent items
 * const recent = await client.getRecentItems();
 * console.log(recent.objects, recent.documents);
 * ```
 */
export interface UserActivityClient {
  /**
   * Record user activity (view or edit of a resource).
   * This is designed to be called in a fire-and-forget manner.
   * Errors are silently caught to not disrupt the main flow.
   */
  recordActivity(payload: RecordActivityPayload): Promise<void>;

  /**
   * Get recent items for the current user in the current project.
   * Returns both objects and documents, up to 10 each.
   */
  getRecentItems(): Promise<RecentItemsResponse>;

  /**
   * Get recent items by type.
   * @param type - 'document' or 'object'
   */
  getRecentItemsByType(type: 'document' | 'object'): Promise<RecentItem[]>;

  /**
   * Remove a specific item from the recent items list.
   */
  removeRecentItem(
    type: 'document' | 'object',
    resourceId: string
  ): Promise<void>;

  /**
   * Clear all recent items for the current user in the current project.
   */
  clearAllRecentItems(): Promise<void>;
}

/**
 * Create user activity API client
 *
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @returns User activity client
 */
export function createUserActivityClient(
  apiBase: string,
  fetchJson: <T>(url: string, init?: any) => Promise<T>
): UserActivityClient {
  return {
    async recordActivity(payload: RecordActivityPayload) {
      try {
        const url = `${apiBase}/api/user-activity/record`;
        await fetchJson<{ success: boolean }>(url, {
          method: 'POST',
          body: payload,
        });
      } catch (error) {
        // Fire-and-forget: silently catch errors
        // Activity recording should never block the main operation
        console.debug('Failed to record activity:', error);
      }
    },

    async getRecentItems() {
      const url = `${apiBase}/api/user-activity/recent`;
      const response = await fetchJson<{
        success: boolean;
        data: RecentItemsResponse;
      }>(url);
      return response.data;
    },

    async getRecentItemsByType(type: 'document' | 'object') {
      const url = `${apiBase}/api/user-activity/recent/${type}`;
      const response = await fetchJson<{
        success: boolean;
        data: RecentItem[];
      }>(url);
      return response.data;
    },

    async removeRecentItem(type: 'document' | 'object', resourceId: string) {
      const url = `${apiBase}/api/user-activity/recent/${type}/${resourceId}`;
      await fetchJson<void>(url, {
        method: 'DELETE',
      });
    },

    async clearAllRecentItems() {
      const url = `${apiBase}/api/user-activity/recent`;
      await fetchJson<void>(url, {
        method: 'DELETE',
      });
    },
  };
}

/**
 * React hook for activity recording.
 * Returns a fire-and-forget function that won't throw errors.
 *
 * Usage:
 * ```typescript
 * const recordActivity = useRecordActivity();
 *
 * // When user views a document
 * recordActivity({
 *   resourceType: 'document',
 *   resourceId: document.id,
 *   resourceName: document.filename,
 *   resourceSubtype: document.mimeType,
 *   actionType: 'viewed',
 * });
 * ```
 */
export function createRecordActivityFn(
  client: UserActivityClient
): (payload: RecordActivityPayload) => void {
  return (payload: RecordActivityPayload) => {
    // Don't await - fire and forget
    client.recordActivity(payload);
  };
}
