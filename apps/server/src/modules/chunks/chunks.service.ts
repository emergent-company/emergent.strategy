import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChunkDto } from './dto/chunk.dto';
import { Chunk } from '../../entities/chunk.entity';
import { DatabaseService } from '../../common/database/database.service';

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

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  text: string;
  embedding: number[] | null;
  filename: string | null;
  source_url: string | null;
  created_at: string;
  total_chars?: number;
  chunk_count?: number;
  embedded_chunks?: number;
}

@Injectable()
export class ChunksService {
  constructor(
    @InjectRepository(Chunk)
    private readonly chunkRepository: Repository<Chunk>,
    private readonly db: DatabaseService
  ) {}

  async list(documentId?: string, projectId?: string): Promise<ChunkDto[]> {
    // Use raw SQL with DatabaseService.query() to leverage RLS enforcement
    const queryFn = async () => {
      const result = await this.db.query<ChunkRow>(
        `SELECT c.id, c.document_id, c.chunk_index, c.text, c.embedding, c.created_at,
                d.filename, d.source_url,
                SUM(LENGTH(c.text)) OVER (PARTITION BY c.document_id) as total_chars,
                COUNT(*) OVER (PARTITION BY c.document_id) as chunk_count,
                COUNT(c.embedding) OVER (PARTITION BY c.document_id) as embedded_chunks
         FROM kb.chunks c
         INNER JOIN kb.documents d ON c.document_id = d.id
         WHERE ($1::uuid IS NULL OR c.document_id = $1)
         ORDER BY d.created_at DESC, c.chunk_index ASC`,
        [documentId || null]
      );
      return result.rows;
    };

    // Use tenant context for RLS enforcement when projectId is provided
    const rows = projectId
      ? await this.db.runWithTenantContext(projectId, queryFn)
      : await queryFn();

    return rows.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      documentTitle: row.filename || row.source_url || row.document_id,
      index: row.chunk_index,
      size: row.text?.length || 0,
      hasEmbedding: !!row.embedding,
      text: row.text,
      createdAt: row.created_at,
      totalChars: row.total_chars,
      chunkCount: row.chunk_count,
      embeddedChunks: row.embedded_chunks,
    }));
  }

  /**
   * Delete a single chunk by ID
   * Uses RLS to ensure user can only delete chunks they have access to
   */
  async delete(chunkId: string, projectId: string): Promise<void> {
    const queryFn = async () => {
      // First check if chunk exists and user has access
      const checkResult = await this.db.query<{ id: string }>(
        `SELECT id FROM kb.chunks WHERE id = $1`,
        [chunkId]
      );

      if (checkResult.rows.length === 0) {
        throw new NotFoundException(`Chunk ${chunkId} not found`);
      }

      // Delete the chunk
      await this.db.query(`DELETE FROM kb.chunks WHERE id = $1`, [chunkId]);
    };

    await this.db.runWithTenantContext(projectId, queryFn);
  }

  /**
   * Delete multiple chunks by IDs
   * Uses RLS to ensure user can only delete chunks they have access to
   */
  async bulkDelete(
    chunkIds: string[],
    projectId: string
  ): Promise<BulkChunkDeletionSummary> {
    const results: ChunkDeletionResult[] = [];
    let totalDeleted = 0;
    let totalFailed = 0;

    for (const chunkId of chunkIds) {
      try {
        await this.delete(chunkId, projectId);
        results.push({ chunkId, success: true });
        totalDeleted++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({ chunkId, success: false, error: message });
        totalFailed++;
      }
    }

    return {
      totalDeleted,
      totalFailed,
      results,
    };
  }

  /**
   * Delete all chunks for a specific document
   * Uses RLS to ensure user can only delete chunks they have access to
   */
  async deleteByDocument(
    documentId: string,
    projectId: string
  ): Promise<DocumentChunksDeletionResult> {
    const queryFn = async () => {
      // First get document info and count chunks
      const docResult = await this.db.query<{
        id: string;
        filename: string | null;
        source_url: string | null;
      }>(`SELECT id, filename, source_url FROM kb.documents WHERE id = $1`, [
        documentId,
      ]);

      if (docResult.rows.length === 0) {
        throw new NotFoundException(`Document ${documentId} not found`);
      }

      const doc = docResult.rows[0];
      const documentTitle = doc.filename || doc.source_url || documentId;

      // Count chunks before deletion
      const countResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM kb.chunks WHERE document_id = $1`,
        [documentId]
      );
      const chunkCount = parseInt(countResult.rows[0]?.count || '0', 10);

      // Delete all chunks for this document
      await this.db.query(`DELETE FROM kb.chunks WHERE document_id = $1`, [
        documentId,
      ]);

      return {
        documentId,
        documentTitle,
        chunksDeleted: chunkCount,
        success: true,
      };
    };

    return this.db.runWithTenantContext(projectId, queryFn);
  }

  /**
   * Delete all chunks for multiple documents
   * Uses RLS to ensure user can only delete chunks they have access to
   */
  async bulkDeleteByDocuments(
    documentIds: string[],
    projectId: string
  ): Promise<BulkDocumentChunksDeletionSummary> {
    const results: DocumentChunksDeletionResult[] = [];
    let totalChunksDeleted = 0;
    let totalFailed = 0;

    for (const documentId of documentIds) {
      try {
        const result = await this.deleteByDocument(documentId, projectId);
        results.push(result);
        totalChunksDeleted += result.chunksDeleted;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({
          documentId,
          documentTitle: documentId,
          chunksDeleted: 0,
          success: false,
          error: message,
        });
        totalFailed++;
      }
    }

    return {
      totalDocuments: documentIds.length,
      totalChunksDeleted,
      totalFailed,
      results,
    };
  }
}
