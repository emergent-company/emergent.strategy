/**
 * Chunks API Client
 *
 * TypeScript client for chunk endpoints including deletion
 */

/**
 * Chunk entity
 */
export interface Chunk {
  id: string;
  documentId: string;
  documentTitle: string;
  index: number;
  size: number;
  hasEmbedding: boolean;
  text: string;
}

/**
 * Result of a single chunk deletion
 */
export interface ChunkDeletionResult {
  chunkId: string;
  success: boolean;
  error?: string;
}

/**
 * Summary of bulk chunk deletion
 */
export interface BulkChunkDeletionSummary {
  totalDeleted: number;
  totalFailed: number;
  results: ChunkDeletionResult[];
}

/**
 * Result of deleting chunks for a single document
 */
export interface DocumentChunksDeletionResult {
  documentId: string;
  documentTitle: string;
  chunksDeleted: number;
  success: boolean;
  error?: string;
}

/**
 * Summary of bulk document chunks deletion
 */
export interface BulkDocumentChunksDeletionSummary {
  totalDocuments: number;
  totalChunksDeleted: number;
  totalFailed: number;
  results: DocumentChunksDeletionResult[];
}

/**
 * API client interface
 *
 * Usage:
 * ```typescript
 * const { apiBase, fetchJson } = useApi();
 * const client = createChunksClient(apiBase, fetchJson);
 *
 * await client.deleteChunk(chunkId);
 * await client.bulkDeleteChunks(chunkIds);
 * await client.deleteChunksByDocument(documentId);
 * await client.bulkDeleteChunksByDocuments(documentIds);
 * ```
 */
export interface ChunksClient {
  /**
   * Delete a single chunk by ID
   */
  deleteChunk(chunkId: string): Promise<{ success: boolean }>;

  /**
   * Bulk delete chunks
   */
  bulkDeleteChunks(chunkIds: string[]): Promise<BulkChunkDeletionSummary>;

  /**
   * Delete all chunks for a specific document
   */
  deleteChunksByDocument(
    documentId: string
  ): Promise<DocumentChunksDeletionResult>;

  /**
   * Delete all chunks for multiple documents
   */
  bulkDeleteChunksByDocuments(
    documentIds: string[]
  ): Promise<BulkDocumentChunksDeletionSummary>;
}

/**
 * Create chunks API client
 *
 * @param apiBase - Base API URL from useApi hook
 * @param fetchJson - Fetch function from useApi hook
 * @returns Chunks client
 */
export function createChunksClient(
  apiBase: string,
  fetchJson: <T>(url: string, init?: any) => Promise<T>
): ChunksClient {
  return {
    async deleteChunk(chunkId: string) {
      const url = `${apiBase}/api/chunks/${chunkId}`;
      return fetchJson<{ success: boolean }>(url, {
        method: 'DELETE',
      });
    },

    async bulkDeleteChunks(chunkIds: string[]) {
      const url = `${apiBase}/api/chunks`;
      return fetchJson<BulkChunkDeletionSummary>(url, {
        method: 'DELETE',
        body: { ids: chunkIds },
      });
    },

    async deleteChunksByDocument(documentId: string) {
      const url = `${apiBase}/api/chunks/by-document/${documentId}`;
      return fetchJson<DocumentChunksDeletionResult>(url, {
        method: 'DELETE',
      });
    },

    async bulkDeleteChunksByDocuments(documentIds: string[]) {
      const url = `${apiBase}/api/chunks/by-documents`;
      return fetchJson<BulkDocumentChunksDeletionSummary>(url, {
        method: 'DELETE',
        body: { documentIds },
      });
    },
  };
}
