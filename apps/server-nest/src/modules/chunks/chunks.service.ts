import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ChunkDto } from './dto/chunk.dto';

interface ChunkRow { id: string; document_id: string; chunk_index: number; text: string; embedding: unknown | null; filename: string | null; source_url: string | null; }

@Injectable()
export class ChunksService {
    constructor(private readonly db: DatabaseService) { }

    async list(documentId?: string): Promise<ChunkDto[]> {
        const params: any[] = [];
        let where = '';
        if (documentId) { params.push(documentId); where = 'WHERE c.document_id = $1'; }
        let res: { rows: ChunkRow[] };
        try {
            res = await this.db.query<ChunkRow>(
                `SELECT c.id, c.document_id, c.chunk_index, c.text, c.embedding, d.filename, d.source_url, c.created_at
                 FROM kb.chunks c
                 JOIN kb.documents d ON d.id = c.document_id
                 ${where}
                 ORDER BY c.created_at ASC, c.chunk_index ASC`,
                params,
            );
        } catch (e: any) {
            if (e?.code === '42703') { // embedding or created_at column missing
                const fallback = await this.db.query<Omit<ChunkRow, 'embedding'> & { embedding: null }>(
                    `SELECT c.id, c.document_id, c.chunk_index, c.text, NULL as embedding, d.filename, d.source_url
                     FROM kb.chunks c
                     JOIN kb.documents d ON d.id = c.document_id
                     ${where}
                     ORDER BY c.chunk_index ASC`,
                    params,
                );
                res = fallback as any;
            } else throw e;
        }
        return res.rows.map(r => ({
            id: r.id,
            documentId: r.document_id,
            documentTitle: r.filename || r.source_url || r.document_id,
            index: r.chunk_index,
            size: r.text.length,
            hasEmbedding: !!r.embedding,
            text: r.text,
        }));
    }
}
