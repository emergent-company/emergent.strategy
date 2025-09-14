import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ChunkerService } from '../../common/utils/chunker.service';
import { HashService } from '../../common/utils/hash.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { AppConfigService } from '../../common/config/config.service';

export interface IngestResult { documentId: string; chunks: number; alreadyExists: boolean; }

@Injectable()
export class IngestionService {
    private readonly logger = new Logger(IngestionService.name);
    // Detect at runtime if content_hash column exists (once per process) so we can use hash-based dedup.
    private hasContentHashColumn: boolean | undefined;
    private readonly metrics = {
        contentHashDetected: 0,
        contentHashMissing: 0,
        embeddingColumnMissing: 0,
        uniqueViolationRaces: 0,
    };
    constructor(
        private readonly db: DatabaseService,
        private readonly chunker: ChunkerService,
        private readonly hash: HashService,
        private readonly embeddings: EmbeddingsService,
        private readonly config: AppConfigService,
    ) { }

    async ingestUrl(url: string, orgId: string | undefined, projectId: string): Promise<IngestResult> {
        // Early validation: avoid outbound fetch if project already deleted / invalid
        if (this.db.isOnline()) {
            const proj = await this.db.query<{ id: string; org_id: string }>('SELECT id, org_id FROM kb.projects WHERE id = $1 LIMIT 1', [projectId]);
            if (!proj.rowCount) {
                throw new BadRequestException({ error: { code: 'project-not-found', message: 'Project not found (ingestion)' } });
            }
            const row = proj.rows[0];
            if (orgId && row.org_id !== orgId) {
                throw new BadRequestException({ error: { code: 'org-project-mismatch', message: 'Provided orgId does not match project org' } });
            }
        }
        let res: Response;
        try {
            res = await fetch(url, { redirect: 'follow' });
        } catch (e) {
            throw new BadRequestException({ error: { code: 'fetch-failed', message: `Failed to fetch URL: ${(e as Error).message}` } });
        }
        if (!res.ok) throw new BadRequestException({ error: { code: 'fetch-bad-status', message: `Status ${res.status}` } });
        const contentType = res.headers.get('content-type') || 'text/plain';
        const buf = Buffer.from(await res.arrayBuffer());
        let text = buf.toString('utf-8');
        if (contentType.includes('text/html')) {
            const { htmlToText } = await import('html-to-text');
            text = htmlToText(text);
        }
        return this.ingestText({ text, sourceUrl: url, mimeType: contentType, orgId, projectId });
    }

    async ingestText({ text, sourceUrl, filename, mimeType, orgId, projectId }: { text: string; sourceUrl?: string; filename?: string; mimeType?: string; orgId?: string; projectId: string; }): Promise<IngestResult> {
        if (!text || !text.trim()) throw new BadRequestException({ error: { code: 'empty', message: 'Text content empty' } });
        if (!projectId) throw new BadRequestException({ error: { code: 'project-required', message: 'projectId is required' } });
        // Lazy detect content_hash feature: attempt simple query referencing column; cache result.
        if (this.hasContentHashColumn === undefined && this.db.isOnline()) {
            try {
                await this.db.query('SELECT content_hash FROM kb.documents LIMIT 1');
                this.hasContentHashColumn = true;
                this.metrics.contentHashDetected++;
            } catch (e: any) {
                if (e?.code === '42703') {
                    this.hasContentHashColumn = false;
                    this.metrics.contentHashMissing++;
                    if (process.env.E2E_DEBUG_VERBOSE === 'true') {
                        this.logger.warn('kb.documents.content_hash missing; using raw content equality for dedup');
                    }
                } else {
                    // For transient errors default to hash path off this run, will retry next call.
                    this.hasContentHashColumn = false;
                    this.metrics.contentHashMissing++;
                }
            }
        }

        // Validate project & derive org (if not provided). If DB offline, allow ingestion but set nulls.
        let derivedOrg: string | null = null;
        if (this.db.isOnline()) {
            const projRes = await this.db.query<{ id: string; org_id: string }>('SELECT id, org_id FROM kb.projects WHERE id = $1 LIMIT 1', [projectId]);
            if (!projRes.rowCount || !projRes.rows.length) {
                throw new BadRequestException({ error: { code: 'project-not-found', message: 'Project not found (ingestion)' } });
            }
            const row = projRes.rows[0];
            if (!row || !row.id) {
                throw new BadRequestException({ error: { code: 'project-load-failed', message: 'Failed to load project metadata' } });
            }
            derivedOrg = row.org_id;
            if (orgId && orgId !== derivedOrg) {
                throw new BadRequestException({ error: { code: 'org-project-mismatch', message: 'Provided orgId does not match project org' } });
            }
        }
        let documentId: string | undefined;
        if (this.hasContentHashColumn) {
            const hash = this.hash.sha256(text);
            // Project-scoped unique index ensures race-safe upsert semantics.
            const existing = await this.db.query<{ id: string }>(
                'SELECT id FROM kb.documents WHERE project_id = $1 AND content_hash = $2 LIMIT 1',
                [projectId, hash],
            );
            if (existing.rowCount) {
                return { documentId: existing.rows[0].id, chunks: 0, alreadyExists: true };
            }
            try {
                // Atomic existence + insert to avoid FK race (project may be deleted concurrently)
                const insertDoc = await this.db.query<{ id: string }>(
                    `WITH target AS (
                        SELECT p.id AS project_id, $1::uuid AS org_id
                        FROM kb.projects p
                        WHERE p.id = $2
                        LIMIT 1
                    )
                    INSERT INTO kb.documents(org_id, project_id, source_url, filename, mime_type, content, content_hash)
                    SELECT target.org_id, target.project_id, $3, $4, $5, $6, $7 FROM target
                    RETURNING id`,
                    [derivedOrg || orgId || null, projectId, sourceUrl || null, filename || null, mimeType || 'text/plain', text, hash],
                );
                if (!insertDoc.rowCount) {
                    throw new BadRequestException({ error: { code: 'project-not-found', message: 'Project not found (ingestion)' } });
                }
                documentId = insertDoc.rows[0]?.id;
            } catch (e: any) {
                if (e?.code === '23505') { // unique violation -> doc already ingested concurrently
                    this.metrics.uniqueViolationRaces++;
                    const again = await this.db.query<{ id: string }>('SELECT id FROM kb.documents WHERE project_id = $1 AND content_hash = $2 LIMIT 1', [projectId, hash]);
                    if (again.rowCount) return { documentId: again.rows[0].id, chunks: 0, alreadyExists: true };
                    throw e;
                }
                if (e?.code === '42703') { // column appeared missing mid-flight (unexpected)
                    this.hasContentHashColumn = false; // downgrade and retry equality path
                    this.metrics.contentHashMissing++;
                } else {
                    throw e;
                }
            }
        }
        if (!documentId) {
            // Fallback: content equality (legacy schema path)
            const existingByContent = await this.db.query<{ id: string }>('SELECT id FROM kb.documents WHERE project_id = $1 AND content = $2 LIMIT 1', [projectId, text]);
            if (existingByContent.rowCount) return { documentId: existingByContent.rows[0].id, chunks: 0, alreadyExists: true };
            const insertDoc = await this.db.query<{ id: string }>(
                `WITH target AS (
                    SELECT p.id AS project_id, $1::uuid AS org_id
                    FROM kb.projects p
                    WHERE p.id = $2
                    LIMIT 1
                )
                INSERT INTO kb.documents(org_id, project_id, source_url, filename, mime_type, content)
                SELECT target.org_id, target.project_id, $3, $4, $5, $6 FROM target
                RETURNING id`,
                [derivedOrg || orgId || null, projectId, sourceUrl || null, filename || null, mimeType || 'text/plain', text],
            );
            if (!insertDoc.rowCount) {
                throw new BadRequestException({ error: { code: 'project-not-found', message: 'Project not found (ingestion)' } });
            }
            documentId = insertDoc.rows[0]?.id;
        }
        if (!documentId) {
            // If DB offline or insert failed silently, return graceful error
            throw new BadRequestException({ error: { code: 'document-insert-failed', message: 'Failed to insert document (database offline or schema mismatch)' } });
        }
        // documentId already set above within insert branches
        const chunks = this.chunker.chunk(text);
        let vectors: number[][] = [];
        if (this.config.embeddingsEnabled) {
            try {
                vectors = await this.embeddings.embedDocuments(chunks);
            } catch (e) {
                this.logger.warn(`Embedding generation failed, proceeding with NULL embeddings: ${(e as Error).message}`);
                vectors = [];
            }
        }
        let hasEmbeddingColumn: boolean | undefined;
        let hasChunkUpsertConstraint = true; // (document_id, chunk_index) unique key
        for (let i = 0; i < chunks.length; i++) {
            const vec = vectors[i];
            const vecLiteral = vec ? '[' + vec.map(n => (Number.isFinite(n) ? String(n) : '0')).join(',') + ']' : null;
            if (hasEmbeddingColumn === false) {
                if (hasChunkUpsertConstraint) {
                    try {
                        await this.db.query(
                            `INSERT INTO kb.chunks(document_id, chunk_index, text)
                             VALUES ($1,$2,$3)
                             ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
                            [documentId, i, chunks[i]],
                        );
                    } catch (e) {
                        if ((e as any)?.code === '42P10') { // no inferable unique index
                            hasChunkUpsertConstraint = false;
                            await this.db.query(
                                `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                 VALUES ($1,$2,$3)`,
                                [documentId, i, chunks[i]],
                            );
                        } else throw e;
                    }
                } else {
                    await this.db.query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text)
                         VALUES ($1,$2,$3)`,
                        [documentId, i, chunks[i]],
                    );
                }
                continue;
            }
            try {
                if (hasChunkUpsertConstraint) {
                    await this.db.query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                         VALUES ($1,$2,$3,${vecLiteral ? '$4::vector' : 'NULL'})
                         ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text, embedding = EXCLUDED.embedding`,
                        vecLiteral ? [documentId, i, chunks[i], vecLiteral] : [documentId, i, chunks[i]],
                    );
                } else {
                    await this.db.query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                         VALUES ($1,$2,$3,${vecLiteral ? '$4::vector' : 'NULL'})`,
                        vecLiteral ? [documentId, i, chunks[i], vecLiteral] : [documentId, i, chunks[i]],
                    );
                }
                hasEmbeddingColumn = true;
            } catch (e) {
                if ((e as any)?.code === '42703') { // embedding column missing; fallback
                    this.metrics.embeddingColumnMissing++;
                    if (process.env.E2E_DEBUG_VERBOSE === 'true') {
                        this.logger.warn('kb.chunks.embedding column missing; continuing without embeddings');
                    }
                    hasEmbeddingColumn = false;
                    if (hasChunkUpsertConstraint) {
                        try {
                            await this.db.query(
                                `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                 VALUES ($1,$2,$3)
                                 ON CONFLICT (document_id, chunk_index) DO UPDATE SET text = EXCLUDED.text`,
                                [documentId, i, chunks[i]],
                            );
                        } catch (e2) {
                            if ((e2 as any)?.code === '42P10') {
                                hasChunkUpsertConstraint = false;
                                await this.db.query(
                                    `INSERT INTO kb.chunks(document_id, chunk_index, text)
                                     VALUES ($1,$2,$3)`,
                                    [documentId, i, chunks[i]],
                                );
                            } else throw e2;
                        }
                    } else {
                        await this.db.query(
                            `INSERT INTO kb.chunks(document_id, chunk_index, text)
                             VALUES ($1,$2,$3)`,
                            [documentId, i, chunks[i]],
                        );
                    }
                } else if ((e as any)?.code === '42P10') { // missing unique constraint
                    hasChunkUpsertConstraint = false;
                    // Retry without ON CONFLICT
                    await this.db.query(
                        `INSERT INTO kb.chunks(document_id, chunk_index, text, embedding)
                         VALUES ($1,$2,$3,${vecLiteral ? '$4::vector' : 'NULL'})`,
                        vecLiteral ? [documentId, i, chunks[i], vecLiteral] : [documentId, i, chunks[i]],
                    );
                } else {
                    throw e;
                }
            }
        }
        return { documentId, chunks: chunks.length, alreadyExists: false };
    }
}

// For tests / diagnostics (avoid leaking mutable reference)
export function getIngestionServiceMetrics(service: IngestionService) {
    // @ts-expect-error accessing private field for controlled export; acceptable for test helper
    const m = service.metrics as Record<string, number>;
    return { ...m };
}
