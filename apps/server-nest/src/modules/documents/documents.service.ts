import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { HashService } from '../../common/utils/hash.service';
import { DocumentDto } from './dto/document.dto';
import { Document } from '../../entities/document.entity';
import { Chunk } from '../../entities/chunk.entity';
import { Project } from '../../entities/project.entity';

interface DocumentRow {
  id: string;
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
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Chunk)
    private readonly chunkRepository: Repository<Chunk>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly dataSource: DataSource,
    private readonly hash: HashService
  ) {}

  async list(
    limit = 100,
    cursor?: { createdAt: string; id: string },
    filter?: { orgId?: string; projectId?: string }
  ): Promise<{ items: DocumentDto[]; nextCursor: string | null }> {
    // Fetch one extra row (limit + 1) to determine if another page exists
    const params: any[] = [limit + 1];
    const conds: string[] = [];
    let paramIdx = 2; // because $1 reserved for limit

    if (filter?.orgId) {
      // Filter by organization via project relationship
      params.push(filter.orgId);
      conds.push(`p.organization_id = $${paramIdx++}`);
    }
    if (filter?.projectId) {
      params.push(filter.projectId);
      conds.push(`d.project_id = $${paramIdx++}`);
    }
    if (cursor) {
      params.push(cursor.createdAt, cursor.id);
      conds.push(
        `(d.created_at < $${paramIdx} OR (d.created_at = $${paramIdx} AND d.id < $${
          paramIdx + 1
        }))`
      );
      paramIdx += 2;
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // Use TypeORM DataSource query (LATERAL join not supported by QueryBuilder)
    const rows = await this.dataSource.query(
      `SELECT d.id, d.project_id, d.filename, d.source_url, d.mime_type, d.created_at, d.updated_at,
                    d.integration_metadata,
                    LENGTH(d.content) AS content_length,
                    COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
                    ej.status AS extraction_status,
                    ej.completed_at AS extraction_completed_at,
                    ej.objects_created AS extraction_objects_count
             FROM kb.documents d
             LEFT JOIN kb.projects p ON d.project_id = p.id
             LEFT JOIN LATERAL (
                 SELECT status, completed_at, objects_created
                 FROM kb.object_extraction_jobs
                 WHERE source_type = 'document' AND source_id::uuid = d.id
                 ORDER BY created_at DESC
                 LIMIT 1
             ) ej ON true
             ${where}
             ORDER BY d.created_at DESC, d.id DESC
             LIMIT $1`,
      params
    );

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items = slice.map((r: any) => this.mapRow(r));

    if (hasMore) {
      const last = items[items.length - 1];
      const nextCursor = Buffer.from(
        JSON.stringify({ createdAt: last.createdAt, id: last.id }),
        'utf8'
      ).toString('base64url');
      return { items, nextCursor };
    }
    return { items, nextCursor: null };
  }

  async get(id: string): Promise<DocumentDto | null> {
    // Use TypeORM DataSource query (LATERAL join not supported by QueryBuilder)
    const rows = await this.dataSource.query(
      `SELECT d.id, d.project_id, d.filename, d.source_url, d.mime_type, d.content, d.created_at, d.updated_at,
                    d.integration_metadata,
                    COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
                    ej.status AS extraction_status,
                    ej.completed_at AS extraction_completed_at,
                    ej.objects_created AS extraction_objects_count
             FROM kb.documents d
             LEFT JOIN LATERAL (
                 SELECT status, completed_at, objects_created
                 FROM kb.object_extraction_jobs
                 WHERE source_type = 'document' AND source_id::uuid = d.id
                 ORDER BY created_at DESC
                 LIMIT 1
             ) ej ON true
             WHERE d.id = $1`,
      [id]
    );

    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async create(body: {
    filename?: string;
    projectId?: string;
    content?: string;
    orgId?: string;
  }): Promise<DocumentDto> {
    const projectId = body.projectId;
    if (!projectId) {
      throw new BadRequestException('Unknown projectId');
    }

    // Generate content hash from content
    const content = body.content || '';
    const contentHash = this.hash.sha256(content);

    // Verify project exists and get orgId atomically
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: ['id', 'organizationId'],
    });

    if (!project) {
      throw new BadRequestException('Unknown projectId');
    }

    // Check for existing document with same content_hash (deduplication)
    const existing = await this.documentRepository.findOne({
      where: {
        projectId: project.id,
        contentHash,
      },
    });

    if (existing) {
      // Return existing document instead of creating duplicate
      return {
        id: existing.id,
        orgId: undefined, // Will be derived from project
        projectId: existing.projectId ?? undefined,
        name: existing.filename || 'unknown',
        sourceUrl: existing.sourceUrl ?? undefined,
        mimeType: existing.mimeType ?? undefined,
        content: existing.content ?? undefined,
        contentLength: existing.content?.length,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        integrationMetadata: existing.integrationMetadata ?? undefined,
        chunks: 0,
        extractionStatus: undefined,
        extractionCompletedAt: undefined,
        extractionObjectsCount: undefined,
      };
    }

    // Create document
    const document = this.documentRepository.create({
      projectId: project.id,
      filename: body.filename || 'unnamed.txt',
      content,
      contentHash,
    });

    let savedDoc: Document;
    try {
      savedDoc = await this.documentRepository.save(document);
    } catch (error: any) {
      // Handle race condition: document was created between our check and insert
      if (
        error?.code === '23505' &&
        error?.constraint === 'IDX_a62c6bec50c07764e19636a5a4'
      ) {
        // Fetch the document that was just created by another request
        const raceDoc = await this.documentRepository.findOne({
          where: {
            projectId: project.id,
            contentHash,
          },
        });
        if (raceDoc) {
          savedDoc = raceDoc;
        } else {
          throw error; // Unexpected: constraint violation but can't find the doc
        }
      } else {
        throw error; // Re-throw other errors
      }
    }

    return {
      id: savedDoc.id,
      orgId: undefined, // Will be derived from project
      projectId: savedDoc.projectId ?? undefined,
      name: savedDoc.filename || 'unknown',
      sourceUrl: savedDoc.sourceUrl ?? undefined,
      mimeType: savedDoc.mimeType ?? undefined,
      content: savedDoc.content ?? undefined,
      contentLength: savedDoc.content?.length,
      createdAt: savedDoc.createdAt.toISOString(),
      updatedAt: savedDoc.updatedAt.toISOString(),
      integrationMetadata: savedDoc.integrationMetadata ?? undefined,
      chunks: 0,
      extractionStatus: undefined,
      extractionCompletedAt: undefined,
      extractionObjectsCount: undefined,
    };
  }

  async getProjectOrg(projectId: string): Promise<string | null> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: ['organizationId'],
    });
    return project?.organizationId || null;
  }

  async delete(id: string): Promise<boolean> {
    // Chunks will be deleted automatically via CASCADE (defined in entity relation)
    const result = await this.documentRepository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  decodeCursor(cursor?: string): { createdAt: string; id: string } | undefined {
    if (!cursor) return undefined;
    try {
      const json = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8')
      );
      if (json.createdAt && json.id)
        return { createdAt: json.createdAt, id: json.id };
    } catch {
      /* ignore */
    }
    return undefined;
  }

  private mapRow(r: DocumentRow): DocumentDto {
    return {
      id: r.id,
      orgId: undefined, // Will be derived from project relationship
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

  // ========================================
  // TypeORM Methods (New - Examples)
  // ========================================

  /**
   * Get document count using TypeORM
   */
  async getCount(): Promise<number> {
    return await this.documentRepository.count();
  }

  /**
   * Find document by ID using TypeORM with relations
   */
  async findByIdWithChunks(id: string): Promise<Document | null> {
    return await this.documentRepository.findOne({
      where: { id },
      relations: ['chunks'],
    });
  }

  /**
   * Find recent documents using TypeORM QueryBuilder
   */
  async findRecent(limit: number = 10): Promise<Document[]> {
    return await this.documentRepository
      .createQueryBuilder('doc')
      .leftJoinAndSelect('doc.chunks', 'chunk')
      .orderBy('doc.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }
}
