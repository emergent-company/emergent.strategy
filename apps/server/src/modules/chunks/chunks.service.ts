import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChunkDto } from './dto/chunk.dto';
import { Chunk } from '../../entities/chunk.entity';
import { DatabaseService } from '../../common/database/database.service';

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
}
