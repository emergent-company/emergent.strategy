import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { HashService } from '../../common/utils/hash.service';
import { DocumentDto } from './dto/document.dto';

interface DocumentRow {
    id: string;
    organization_id: string | null;
    project_id: string | null;
    filename: string | null;
    source_url: string | null;
    mime_type: string | null;
    content: string | null;
    content_length: number | null;
    created_at: string;
    updated_at: string;
    integration_metadata: Record<string, any> | null;
    chunks: number;
    extraction_status: string | null;
    extraction_completed_at: string | null;
    extraction_objects_count: number | null;
}

@Injectable()
export class DocumentsService {
    constructor(
        private readonly db: DatabaseService,
        private readonly hash: HashService,
    ) { }

    async list(limit = 100, cursor?: { createdAt: string; id: string }, filter?: { orgId?: string; projectId?: string }): Promise<{ items: DocumentDto[]; nextCursor: string | null }> {
        // Fetch one extra row (limit + 1) to determine if another page exists. This avoids issuing
        // a nextCursor that would lead to an empty trailing page when rows count is an exact multiple.
        const params: any[] = [limit + 1];
        const conds: string[] = [];
        let paramIdx = 2; // because $1 reserved for limit
        if (filter?.orgId) {
            params.push(filter.orgId);
            conds.push(`d.organization_id = $${paramIdx++}`);
        }
        if (filter?.projectId) {
            params.push(filter.projectId);
            conds.push(`d.project_id = $${paramIdx++}`);
        }
        if (cursor) {
            params.push(cursor.createdAt, cursor.id);
            conds.push(`(d.created_at < $${paramIdx} OR (d.created_at = $${paramIdx} AND d.id < $${paramIdx + 1}))`);
            paramIdx += 2;
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const res = await this.db.query<DocumentRow>(
            `SELECT d.id, d.organization_id, d.project_id, d.filename, d.source_url, d.mime_type, d.created_at, d.updated_at,
                    d.integration_metadata,
                    LENGTH(d.content) AS content_length,
                    COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
                    ej.status AS extraction_status,
                    ej.completed_at AS extraction_completed_at,
                    ej.created_objects AS extraction_objects_count
             FROM kb.documents d
             LEFT JOIN LATERAL (
                 SELECT status, completed_at, created_objects
                 FROM kb.object_extraction_jobs
                 WHERE source_type = 'document' AND source_id::uuid = d.id
                 ORDER BY created_at DESC
                 LIMIT 1
             ) ej ON true
             ${where}
             ORDER BY d.created_at DESC, d.id DESC
             LIMIT $1`,
            params,
        );
        const rows = res.rows;
        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        const items = slice.map(r => this.mapRow(r));
        if (hasMore) {
            const last = items[items.length - 1];
            const nextCursor = Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id }), 'utf8').toString('base64url');
            return { items, nextCursor };
        }
        return { items, nextCursor: null };
    }


    async get(id: string): Promise<DocumentDto | null> {
        const res = await this.db.query<DocumentRow>(
            `SELECT d.id, d.organization_id, d.project_id, d.filename, d.source_url, d.mime_type, d.content, d.created_at, d.updated_at,
                    d.integration_metadata,
                    COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
                    ej.status AS extraction_status,
                    ej.completed_at AS extraction_completed_at,
                    ej.created_objects AS extraction_objects_count
             FROM kb.documents d
             LEFT JOIN LATERAL (
                 SELECT status, completed_at, created_objects
                 FROM kb.object_extraction_jobs
                 WHERE source_type = 'document' AND source_id::uuid = d.id
                 ORDER BY created_at DESC
                 LIMIT 1
             ) ej ON true
             WHERE d.id = $1`,
            [id],
        );
        if (!res.rowCount) return null;
        return this.mapRow(res.rows[0]);
    }

    async create(body: { filename?: string; projectId?: string; content?: string; orgId?: string }): Promise<DocumentDto> {
        const projectId = body.projectId;
        if (!projectId) {
            throw new BadRequestException({ error: { code: 'bad-request', message: 'Unknown projectId' } });
        }

        // Generate content hash from content
        const content = body.content || '';
        const contentHash = this.hash.sha256(content);

        // Atomic existence + insert to avoid race causing FK violation (uses CTE)
        const ins = await this.db.query<DocumentRow>(
            `WITH target AS (
                SELECT p.id AS project_id, $1::uuid AS organization_id
                FROM kb.projects p
                WHERE p.id = $2
                LIMIT 1
            )
            INSERT INTO kb.documents(organization_id, project_id, filename, content, content_hash)
            SELECT target.organization_id, target.project_id, $3, $4, $5 FROM target
            RETURNING id, organization_id, project_id, filename, source_url, mime_type, created_at, updated_at, 0 as chunks`,
            [body.orgId || null, projectId, body.filename || 'unnamed.txt', content, contentHash],
        );
        if (!ins.rowCount) {
            throw new BadRequestException({ error: { code: 'bad-request', message: 'Unknown projectId' } });
        }
        return this.mapRow(ins.rows[0]);
    }

    async getProjectOrg(projectId: string): Promise<string | null> {
        const res = await this.db.query<{ organization_id: string | null }>('SELECT organization_id FROM kb.projects WHERE id=$1 LIMIT 1', [projectId]);
        if (!res.rowCount) return null;
        return res.rows[0].organization_id;
    }

    async delete(id: string): Promise<boolean> {
        // Remove chunks first to avoid FK issues if not ON DELETE CASCADE
        await this.db.query('DELETE FROM kb.chunks WHERE document_id = $1', [id]);
        const res = await this.db.query('DELETE FROM kb.documents WHERE id = $1', [id]);
        return !!res.rowCount && res.rowCount > 0;
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
            orgId: r.organization_id || undefined,
            projectId: r.project_id || undefined,
            name: r.filename || r.source_url || 'unknown',
            sourceUrl: r.source_url,
            mimeType: r.mime_type,
            content: r.content || undefined,
            contentLength: r.content_length ?? undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            integrationMetadata: r.integration_metadata || undefined,
            chunks: r.chunks,
            extractionStatus: r.extraction_status || undefined,
            extractionCompletedAt: r.extraction_completed_at || undefined,
            extractionObjectsCount: r.extraction_objects_count || undefined,
        };
    }
}
