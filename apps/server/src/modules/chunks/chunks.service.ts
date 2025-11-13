import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChunkDto } from './dto/chunk.dto';
import { Chunk } from '../../entities/chunk.entity';

@Injectable()
export class ChunksService {
  constructor(
    @InjectRepository(Chunk)
    private readonly chunkRepository: Repository<Chunk>
  ) {}

  async list(documentId?: string): Promise<ChunkDto[]> {
    try {
      const queryBuilder = this.chunkRepository
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.document', 'd')
        .orderBy('c.created_at', 'ASC')
        .addOrderBy('c.chunk_index', 'ASC');

      if (documentId) {
        queryBuilder.where('c.document_id = :documentId', { documentId });
      }

      const chunks = await queryBuilder.getMany();

      return chunks.map((c) => ({
        id: c.id,
        documentId: c.documentId,
        documentTitle:
          c.document?.filename || c.document?.sourceUrl || c.documentId,
        index: c.chunkIndex,
        size: c.text.length,
        hasEmbedding: !!c.embedding,
        text: c.text,
      }));
    } catch (e: any) {
      // Fallback for missing columns (backward compatibility)
      if (e?.code === '42703') {
        const queryBuilder = this.chunkRepository
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.document', 'd')
          .orderBy('c.chunk_index', 'ASC');

        if (documentId) {
          queryBuilder.where('c.document_id = :documentId', { documentId });
        }

        const chunks = await queryBuilder.getMany();

        return chunks.map((c) => ({
          id: c.id,
          documentId: c.documentId,
          documentTitle:
            c.document?.filename || c.document?.sourceUrl || c.documentId,
          index: c.chunkIndex,
          size: c.text.length,
          hasEmbedding: false,
          text: c.text,
        }));
      }
      throw e;
    }
  }
}
