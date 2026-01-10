/**
 * Documents API Client
 *
 * TypeScript client for document endpoints including deletion with cascade
 */

/**
 * Document entity
 */
export interface Document {
  id: string;
  filename: string;
  organization_id: string;
  project_id: string;
  content?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Deletion impact analysis for a single document
 */
export interface DeletionImpact {
  document: {
    id: string;
    name: string;
    createdAt: string;
  };
  impact: {
    chunks: number;
    extractionJobs: number;
    graphObjects: number;
    graphRelationships: number;
    notifications: number;
  };
}

/**
 * Bulk deletion impact analysis
 */
export interface BulkDeletionImpact {
  totalDocuments: number;
  impact: {
    chunks: number;
    extractionJobs: number;
    graphObjects: number;
    graphRelationships: number;
    notifications: number;
  };
  documents?: Array<{
    document: {
      id: string;
      name: string;
      createdAt: string;
    };
    impact: {
      chunks: number;
      extractionJobs: number;
      graphObjects: number;
      graphRelationships: number;
      notifications: number;
    };
  }>;
}

/**
 * Deletion summary for a single document
 */
export interface DeletionSummary {
  documentId: string;
  deleted: {
    notifications: number;
    relationships: number;
    objects: number;
    jobs: number;
    document: boolean;
  };
}

/**
 * Bulk deletion summary
 */
export interface BulkDeletionSummary {
  status: 'deleted' | 'partial';
  deleted: number;
  notFound: string[];
  summary: {
    chunks: number;
    extractionJobs: number;
    graphObjects: number;
    graphRelationships: number;
    notifications: number;
  };
}

/**
 * Bulk delete request payload
 */
export interface BulkDeleteRequest {
  ids: string[];
}

/**
 * List documents query parameters
 */
export interface ListDocumentsParams {
  limit?: number;
  cursor?: string;
}

/**
 * API client interface
 *
 * Usage:
 * ```typescript
 * const { apiBase, fetchJson } = useApi();
 * const client = createDocumentsClient(apiBase, fetchJson);
 *
 * const docs = await client.listDocuments();
 * const impact = await client.getDeletionImpact(docId);
 * await client.deleteDocument(docId);
 * ```
 */
export interface DocumentsClient {
  /**
   * List documents for a project
   */
  listDocuments(params?: ListDocumentsParams): Promise<Document[]>;

  /**
   * Get a single document by ID
   */
  getDocument(documentId: string): Promise<Document>;

  /**
   * Get deletion impact analysis for a single document
   */
  getDeletionImpact(documentId: string): Promise<DeletionImpact>;

  /**
   * Get bulk deletion impact analysis
   */
  getBulkDeletionImpact(documentIds: string[]): Promise<BulkDeletionImpact>;

  /**
   * Delete a document with cascade
   */
  deleteDocument(documentId: string): Promise<DeletionSummary>;

  /**
   * Bulk delete documents with cascade
   */
  bulkDeleteDocuments(documentIds: string[]): Promise<BulkDeletionSummary>;

  /**
   * Recreate chunks for a document using project chunking config
   */
  recreateChunks(documentId: string): Promise<{
    status: 'success';
    summary: {
      oldChunks: number;
      newChunks: number;
      strategy: string;
      config: any;
    };
  }>;
}

/**
 * Create documents API client
 *
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @param defaultProjectId - Current project ID to use when a call omits one
 * @returns Documents client
 */
export function createDocumentsClient(
  apiBase: string,
  fetchJson: <T, B = unknown>(url: string, init?: any) => Promise<T>,
  defaultProjectId?: string
): DocumentsClient {
  return {
    async listDocuments(params: ListDocumentsParams = {}) {
      if (!defaultProjectId) {
        throw new Error('Project ID is required to list documents');
      }

      const queryParams = new URLSearchParams();
      if (params.limit) queryParams.set('limit', params.limit.toString());
      if (params.cursor) queryParams.set('cursor', params.cursor);

      const query = queryParams.toString();
      const url = `${apiBase}/api/documents${query ? '?' + query : ''}`;

      return fetchJson<Document[]>(url);
    },

    async getDocument(documentId: string) {
      const url = `${apiBase}/api/documents/${documentId}`;
      return fetchJson<Document>(url);
    },

    async getDeletionImpact(documentId: string) {
      const url = `${apiBase}/api/documents/${documentId}/deletion-impact`;
      return fetchJson<DeletionImpact>(url);
    },

    async getBulkDeletionImpact(documentIds: string[]) {
      const url = `${apiBase}/api/documents/deletion-impact`;
      return fetchJson<BulkDeletionImpact>(url, {
        method: 'POST',
        body: { ids: documentIds },
      });
    },

    async deleteDocument(documentId: string) {
      const url = `${apiBase}/api/documents/${documentId}`;
      return fetchJson<DeletionSummary>(url, {
        method: 'DELETE',
      });
    },

    async bulkDeleteDocuments(documentIds: string[]) {
      const url = `${apiBase}/api/documents`;
      return fetchJson<BulkDeletionSummary>(url, {
        method: 'DELETE',
        body: { ids: documentIds },
      });
    },

    async recreateChunks(documentId: string) {
      const url = `${apiBase}/api/documents/${documentId}/recreate-chunks`;
      return fetchJson<{
        status: 'success';
        summary: {
          oldChunks: number;
          newChunks: number;
          strategy: string;
          config: any;
        };
      }>(url, {
        method: 'POST',
      });
    },
  };
}
