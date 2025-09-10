import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { DocumentDto } from './dto/document.dto';

interface DocumentRow {
    id: string;
    filename: string | null;
    source_url: string | null;
    mime_type: string | null;
    created_at: string;
    updated_at: string;
}

@Injectable()
export class DocumentsService {
    constructor(private readonly db: DatabaseService) { }

    async list(limit = 100, cursor?: { createdAt: string; id: string }): Promise<{ items: DocumentDto[]; nextCursor: string | null }> {
        const params: any[] = [limit];
        let where = '';
        if (cursor) {
            // Seek pagination: fetch records strictly older than cursor (created_at,id) tuple
            params.push(cursor.createdAt, cursor.id);
            where = `WHERE (created_at < $2 OR (created_at = $2 AND id < $3))`;
        }
        const res = await this.db.query<DocumentRow>(
            `SELECT id, filename, source_url, mime_type, created_at, updated_at
         FROM kb.documents
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $1`,
            params,
        );
        const items = res.rows.map(r => this.mapRow(r));
        if (items.length === limit) {
            const last = items[items.length - 1];
            const nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id }), 'utf8').toString('base64url');
            return { items, nextCursor };
        }
        return { items, nextCursor: null };
    }

    async get(id: string): Promise<DocumentDto | null> {
        const res = await this.db.query<DocumentRow>(
            `SELECT id, filename, source_url, mime_type, created_at, updated_at
         FROM kb.documents WHERE id = $1 LIMIT 1`,
            [id],
        );
        if (!res.rowCount) return null;
        return this.mapRow(res.rows[0]);
    }

    decodeCursor(cursor?: string): { createdAt: string; id: string } | undefined {
        if (!cursor) return undefined;
        try {
            const json = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            if (json.createdAt && json.id) return { createdAt: json.createdAt, id: json.id };
        } catch { /* ignore */ }
        return undefined;
    }

    private mapRow(r: DocumentRow): DocumentDto {
        return {
            id: r.id,
            name: r.filename || r.source_url || 'unknown',
            sourceUrl: r.source_url,
            mimeType: r.mime_type,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    }
}
