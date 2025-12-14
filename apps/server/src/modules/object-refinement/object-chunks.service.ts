import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectChunk } from '../../entities/object-chunk.entity';
import { DatabaseService } from '../../common/database/database.service';
import { ChunkContext } from './object-refinement.types';

/**
 * Service for managing object-to-chunk provenance links
 */
@Injectable()
export class ObjectChunksService {
  constructor(
    @InjectRepository(ObjectChunk)
    private readonly objectChunkRepository: Repository<ObjectChunk>,
    private readonly db: DatabaseService
  ) {}

  /**
   * Get all chunks associated with an object, including document metadata
   */
  async getChunksForObject(objectId: string): Promise<ChunkContext[]> {
    const sql = `
      SELECT 
        c.id,
        c.document_id as "documentId",
        c.chunk_index as "chunkIndex",
        c.text,
        d.filename as "documentTitle"
      FROM kb.object_chunks oc
      JOIN kb.chunks c ON oc.chunk_id = c.id
      JOIN kb.documents d ON c.document_id = d.id
      WHERE oc.object_id = $1
      ORDER BY d.filename, c.chunk_index
    `;

    const result = await this.db.query<{
      id: string;
      documentId: string;
      chunkIndex: number;
      text: string;
      documentTitle: string;
    }>(sql, [objectId]);

    return result.rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      documentTitle: row.documentTitle || 'Untitled Document',
      chunkIndex: row.chunkIndex,
      text: row.text,
    }));
  }

  /**
   * Link a chunk to an object
   */
  async linkChunkToObject(
    objectId: string,
    chunkId: string,
    extractionJobId?: string,
    confidence?: number
  ): Promise<ObjectChunk> {
    // Use upsert to handle duplicates gracefully
    const existing = await this.objectChunkRepository.findOne({
      where: { objectId, chunkId },
    });

    if (existing) {
      // Update if needed
      if (extractionJobId !== undefined) {
        existing.extractionJobId = extractionJobId;
      }
      if (confidence !== undefined) {
        existing.confidence = confidence;
      }
      return this.objectChunkRepository.save(existing);
    }

    const objectChunk = this.objectChunkRepository.create({
      objectId,
      chunkId,
      extractionJobId: extractionJobId || null,
      confidence: confidence || null,
    });

    return this.objectChunkRepository.save(objectChunk);
  }

  /**
   * Unlink a chunk from an object
   */
  async unlinkChunk(objectId: string, chunkId: string): Promise<boolean> {
    const result = await this.objectChunkRepository.delete({
      objectId,
      chunkId,
    });
    return (result.affected ?? 0) > 0;
  }

  /**
   * Get all object IDs linked to a specific chunk
   */
  async getObjectsForChunk(chunkId: string): Promise<string[]> {
    const sql = `
      SELECT object_id
      FROM kb.object_chunks
      WHERE chunk_id = $1
    `;

    const result = await this.db.query<{ object_id: string }>(sql, [chunkId]);
    return result.rows.map((row) => row.object_id);
  }

  /**
   * Bulk link chunks to an object (used during extraction)
   */
  async bulkLinkChunks(
    objectId: string,
    chunkIds: string[],
    extractionJobId?: string,
    confidence?: number
  ): Promise<number> {
    if (chunkIds.length === 0) return 0;

    const sql = `
      INSERT INTO kb.object_chunks (object_id, chunk_id, extraction_job_id, confidence, created_at)
      SELECT $1, unnest($2::uuid[]), $3, $4, NOW()
      ON CONFLICT (object_id, chunk_id) DO NOTHING
    `;

    const result = await this.db.query(sql, [
      objectId,
      chunkIds,
      extractionJobId || null,
      confidence || null,
    ]);

    return result.rowCount ?? 0;
  }

  /**
   * Get chunk count for an object
   */
  async getChunkCount(objectId: string): Promise<number> {
    const result = await this.objectChunkRepository.count({
      where: { objectId },
    });
    return result;
  }
}
