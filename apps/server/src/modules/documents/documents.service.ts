import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { HashService } from '../../common/utils/hash.service';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { DocumentDto } from './dto/document.dto';
import { Document } from '../../entities/document.entity';
import { Chunk } from '../../entities/chunk.entity';
import { Project } from '../../entities/project.entity';
import { ChunkerService } from '../../common/utils/chunker.service';
import { ChunkEmbeddingJobsService } from '../chunks/chunk-embedding-jobs.service';
import { EventsService } from '../events/events.service';

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
  total_chars: number | null;
  embedded_chunks: number | null;
  extraction_status: string | null;
  extraction_completed_at: string | null;
  extraction_objects_count: number | null;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Chunk)
    private readonly chunkRepository: Repository<Chunk>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly dataSource: DataSource,
    private readonly hash: HashService,
    private readonly db: DatabaseService,
    private readonly chunker: ChunkerService,
    private readonly chunkEmbeddingJobs: ChunkEmbeddingJobsService,
    private readonly config: AppConfigService,
    @Optional()
    @Inject(EventsService)
    private readonly eventsService?: EventsService
  ) {}

  async list(
    limit = 100,
    cursor?: { createdAt: string; id: string },
    filter?: { orgId?: string; projectId?: string }
  ): Promise<{
    items: DocumentDto[];
    nextCursor: string | null;
    total: number;
  }> {
    // Fetch one extra row (limit + 1) to determine if another page exists
    const params: any[] = [limit + 1];
    const conds: string[] = [];
    let paramIdx = 2; // because $1 reserved for limit

    // NOTE: Project-level filtering is now handled by RLS policies on kb.documents
    // We only need to handle cursor-based pagination here
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

    // Use DatabaseService to ensure RLS context is set
    const queryFn = async () => {
      // Get total count first (respecting RLS)
      const countResult = await this.db.query(
        `SELECT COUNT(*)::int as total FROM kb.documents`
      );
      const total = countResult.rows[0]?.total || 0;

      const result = await this.db.query(
        `SELECT d.id, d.project_id, d.filename, d.source_url, d.mime_type, d.created_at, d.updated_at,
                      d.integration_metadata,
                      LENGTH(d.content) AS content_length,
                      COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
                      COALESCE((SELECT SUM(LENGTH(c.text))::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS total_chars,
                      COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id AND c.embedding IS NOT NULL),0) AS embedded_chunks,
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
               ${where}
               ORDER BY d.created_at DESC, d.id DESC
               LIMIT $1`,
        params
      );
      return { rows: result.rows, total };
    };

    // Always use tenant context when available - RLS policies enforce isolation
    const { rows, total } = filter?.projectId
      ? await this.db.runWithTenantContext(filter.projectId, queryFn)
      : await queryFn();

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items = slice.map((r: any) => this.mapRow(r));

    if (hasMore) {
      const last = items[items.length - 1];
      const nextCursor = Buffer.from(
        JSON.stringify({ createdAt: last.createdAt, id: last.id }),
        'utf8'
      ).toString('base64url');
      return { items, nextCursor, total };
    }
    return { items, nextCursor: null, total };
  }

  async get(
    id: string,
    filter?: { orgId?: string; projectId?: string }
  ): Promise<DocumentDto | null> {
    // Use DatabaseService to ensure RLS context is set
    const queryFn = async () => {
      // NOTE: Project-level filtering is now handled by RLS policies on kb.documents
      // We only filter by document ID - RLS ensures it's from the correct project
      const result = await this.db.query(
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

      return result.rows as DocumentRow[];
    };

    // Always use tenant context when available - RLS policies enforce isolation
    const rows = filter?.projectId
      ? await this.db.runWithTenantContext(filter.projectId, queryFn)
      : await queryFn();

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

    // Emit real-time event for document creation
    if (this.eventsService && savedDoc.projectId) {
      this.eventsService.emitCreated(
        'document',
        savedDoc.id,
        savedDoc.projectId,
        {
          filename: savedDoc.filename,
          contentLength: savedDoc.content?.length,
        }
      );
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
    // Fetch document to get projectId for event emission
    const doc = await this.documentRepository.findOne({
      where: { id },
      select: ['id', 'projectId'],
    });

    // Chunks will be deleted automatically via CASCADE (defined in entity relation)
    const result = await this.documentRepository.delete(id);
    const deleted = (result.affected ?? 0) > 0;

    // Emit real-time event for document deletion
    if (deleted && this.eventsService && doc?.projectId) {
      this.eventsService.emitDeleted('document', id, doc.projectId);
    }

    return deleted;
  }

  /**
   * Get deletion impact analysis for a single document
   */
  async getDeletionImpact(documentId: string): Promise<{
    document: { id: string; name: string; createdAt: string };
    impact: {
      chunks: number;
      extractionJobs: number;
      graphObjects: number;
      graphRelationships: number;
      notifications: number;
    };
  } | null> {
    // Get document info
    const doc = await this.documentRepository.findOne({
      where: { id: documentId },
      select: ['id', 'filename', 'sourceUrl', 'createdAt'],
    });

    if (!doc) {
      return null;
    }

    // Count chunks
    const chunksCount = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM kb.chunks WHERE document_id = $1`,
      [documentId]
    );

    // Count extraction jobs
    const jobsResult = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM kb.object_extraction_jobs WHERE document_id = $1`,
      [documentId]
    );

    // Get extraction job IDs for this document
    const jobIdsResult = await this.dataSource.query(
      `SELECT id FROM kb.object_extraction_jobs WHERE document_id = $1`,
      [documentId]
    );
    const jobIds = jobIdsResult.map((row: any) => row.id);

    // Count graph objects created by these extraction jobs
    let objectsCount = 0;
    let objectIds: string[] = [];
    if (jobIds.length > 0) {
      const objectsResult = await this.dataSource.query(
        `SELECT COUNT(*)::int as count FROM kb.graph_objects WHERE extraction_job_id = ANY($1)`,
        [jobIds]
      );
      objectsCount = objectsResult[0]?.count || 0;

      // Get object IDs for relationship counting
      const objectIdsResult = await this.dataSource.query(
        `SELECT id FROM kb.graph_objects WHERE extraction_job_id = ANY($1)`,
        [jobIds]
      );
      objectIds = objectIdsResult.map((row: any) => row.id);
    }

    // Count graph relationships involving these objects
    let relationshipsCount = 0;
    if (objectIds.length > 0) {
      const relationshipsResult = await this.dataSource.query(
        `SELECT COUNT(*)::int as count FROM kb.graph_relationships 
         WHERE src_id = ANY($1) OR dst_id = ANY($1)`,
        [objectIds]
      );
      relationshipsCount = relationshipsResult[0]?.count || 0;
    }

    // Count notifications referencing this document
    const notificationsResult = await this.dataSource.query(
      `SELECT COUNT(*)::int as count FROM kb.notifications 
       WHERE related_resource_type = 'document' AND related_resource_id = $1`,
      [documentId]
    );

    return {
      document: {
        id: doc.id,
        name: doc.filename || doc.sourceUrl || 'unknown',
        createdAt: doc.createdAt.toISOString(),
      },
      impact: {
        chunks: chunksCount[0]?.count || 0,
        extractionJobs: jobsResult[0]?.count || 0,
        graphObjects: objectsCount,
        graphRelationships: relationshipsCount,
        notifications: notificationsResult[0]?.count || 0,
      },
    };
  }

  /**
   * Get bulk deletion impact analysis for multiple documents
   */
  async getBulkDeletionImpact(documentIds: string[]): Promise<{
    totalDocuments: number;
    impact: {
      chunks: number;
      extractionJobs: number;
      graphObjects: number;
      graphRelationships: number;
      notifications: number;
    };
    documents?: Array<{
      document: { id: string; name: string; createdAt: string };
      impact: {
        chunks: number;
        extractionJobs: number;
        graphObjects: number;
        graphRelationships: number;
        notifications: number;
      };
    }>;
  }> {
    if (documentIds.length === 0) {
      return {
        totalDocuments: 0,
        impact: {
          chunks: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
          notifications: 0,
        },
        documents: [],
      };
    }

    // Get per-document impact by calling getDeletionImpact for each document
    const perDocumentImpacts = await Promise.all(
      documentIds.map(async (docId) => {
        const impact = await this.getDeletionImpact(docId);
        return impact;
      })
    );

    // Filter out null results (documents that don't exist)
    const validImpacts = perDocumentImpacts.filter((impact) => impact !== null);

    // Aggregate total impact
    const totalImpact = validImpacts.reduce(
      (acc, curr) => {
        if (curr) {
          acc.chunks += curr.impact.chunks;
          acc.extractionJobs += curr.impact.extractionJobs;
          acc.graphObjects += curr.impact.graphObjects;
          acc.graphRelationships += curr.impact.graphRelationships;
          acc.notifications += curr.impact.notifications;
        }
        return acc;
      },
      {
        chunks: 0,
        extractionJobs: 0,
        graphObjects: 0,
        graphRelationships: 0,
        notifications: 0,
      }
    );

    return {
      totalDocuments: validImpacts.length,
      impact: totalImpact,
      documents: validImpacts as Array<{
        document: { id: string; name: string; createdAt: string };
        impact: {
          chunks: number;
          extractionJobs: number;
          graphObjects: number;
          graphRelationships: number;
          notifications: number;
        };
      }>,
    };
  }

  /**
   * Delete document with full cascade (hard delete)
   */
  async deleteWithCascade(documentId: string): Promise<{
    status: 'deleted';
    summary: {
      chunks: number;
      extractionJobs: number;
      graphObjects: number;
      graphRelationships: number;
      notifications: number;
    };
  }> {
    return await this.dataSource.transaction(async (manager) => {
      const summary = {
        chunks: 0,
        extractionJobs: 0,
        graphObjects: 0,
        graphRelationships: 0,
        notifications: 0,
      };

      // 1. Get extraction job IDs for this document
      const jobIdsResult = await manager.query(
        `SELECT id FROM kb.object_extraction_jobs WHERE document_id = $1`,
        [documentId]
      );
      const jobIds = jobIdsResult.map((row: any) => row.id);

      // 2. Get graph object IDs created by these extraction jobs
      let objectIds: string[] = [];
      if (jobIds.length > 0) {
        const objectIdsResult = await manager.query(
          `SELECT id FROM kb.graph_objects WHERE extraction_job_id = ANY($1)`,
          [jobIds]
        );
        objectIds = objectIdsResult.map((row: any) => row.id);
      }

      // 3. Delete notifications referencing this document
      const notificationsResult = await manager.query(
        `DELETE FROM kb.notifications 
         WHERE related_resource_type = 'document' AND related_resource_id = $1`,
        [documentId]
      );
      summary.notifications = notificationsResult[1] || 0;

      // 4. Delete graph relationships involving these objects
      if (objectIds.length > 0) {
        const relationshipsResult = await manager.query(
          `DELETE FROM kb.graph_relationships 
           WHERE src_id = ANY($1) OR dst_id = ANY($1)`,
          [objectIds]
        );
        summary.graphRelationships = relationshipsResult[1] || 0;
      }

      // 5. Delete graph objects created by these extraction jobs
      if (jobIds.length > 0) {
        const objectsResult = await manager.query(
          `DELETE FROM kb.graph_objects WHERE extraction_job_id = ANY($1)`,
          [jobIds]
        );
        summary.graphObjects = objectsResult[1] || 0;
      }

      // 6. Delete extraction jobs for this document
      if (jobIds.length > 0) {
        const jobsResult = await manager.query(
          `DELETE FROM kb.object_extraction_jobs WHERE document_id = $1`,
          [documentId]
        );
        summary.extractionJobs = jobsResult[1] || 0;
      }

      // 7. Count chunks before deletion (for summary)
      const chunksCountResult = await manager.query(
        `SELECT COUNT(*)::int as count FROM kb.chunks WHERE document_id = $1`,
        [documentId]
      );
      summary.chunks = chunksCountResult[0]?.count || 0;

      // 8. Delete document (chunks will be CASCADE deleted by FK constraint)
      await manager.query(`DELETE FROM kb.documents WHERE id = $1`, [
        documentId,
      ]);

      return { status: 'deleted' as const, summary };
    });
  }

  /**
   * Bulk delete documents with full cascade (hard delete)
   */
  async bulkDeleteWithCascade(documentIds: string[]): Promise<{
    status: 'deleted' | 'partial';
    deleted: number;
    notFound: string[];
    summary: {
      chunks: number;
      extractionJobs: number;
      graphObjects: number;
      graphRelationships: number;
      notifications: number;
    };
  }> {
    if (documentIds.length === 0) {
      return {
        status: 'deleted',
        deleted: 0,
        notFound: [],
        summary: {
          chunks: 0,
          extractionJobs: 0,
          graphObjects: 0,
          graphRelationships: 0,
          notifications: 0,
        },
      };
    }

    return await this.dataSource.transaction(async (manager) => {
      // Check which documents exist
      const existingDocsResult = await manager.query(
        `SELECT id FROM kb.documents WHERE id = ANY($1)`,
        [documentIds]
      );
      const existingIds = existingDocsResult.map((row: any) => row.id);
      const notFound = documentIds.filter((id) => !existingIds.includes(id));

      const summary = {
        chunks: 0,
        extractionJobs: 0,
        graphObjects: 0,
        graphRelationships: 0,
        notifications: 0,
      };

      if (existingIds.length === 0) {
        return {
          status: 'partial' as const,
          deleted: 0,
          notFound,
          summary,
        };
      }

      // 1. Get extraction job IDs for these documents
      const jobIdsResult = await manager.query(
        `SELECT id FROM kb.object_extraction_jobs WHERE document_id = ANY($1)`,
        [existingIds]
      );
      const jobIds = jobIdsResult.map((row: any) => row.id);

      // 2. Get graph object IDs created by these extraction jobs
      let objectIds: string[] = [];
      if (jobIds.length > 0) {
        const objectIdsResult = await manager.query(
          `SELECT id FROM kb.graph_objects WHERE extraction_job_id = ANY($1)`,
          [jobIds]
        );
        objectIds = objectIdsResult.map((row: any) => row.id);
      }

      // 3. Delete notifications referencing these documents
      const notificationsResult = await manager.query(
        `DELETE FROM kb.notifications 
         WHERE related_resource_type = 'document' AND related_resource_id = ANY($1)`,
        [existingIds]
      );
      summary.notifications = notificationsResult[1] || 0;

      // 4. Delete graph relationships involving these objects
      if (objectIds.length > 0) {
        const relationshipsResult = await manager.query(
          `DELETE FROM kb.graph_relationships 
           WHERE src_id = ANY($1) OR dst_id = ANY($1)`,
          [objectIds]
        );
        summary.graphRelationships = relationshipsResult[1] || 0;
      }

      // 5. Delete graph objects created by these extraction jobs
      if (jobIds.length > 0) {
        const objectsResult = await manager.query(
          `DELETE FROM kb.graph_objects WHERE extraction_job_id = ANY($1)`,
          [jobIds]
        );
        summary.graphObjects = objectsResult[1] || 0;
      }

      // 6. Delete extraction jobs for these documents
      if (jobIds.length > 0) {
        const jobsResult = await manager.query(
          `DELETE FROM kb.object_extraction_jobs WHERE document_id = ANY($1)`,
          [existingIds]
        );
        summary.extractionJobs = jobsResult[1] || 0;
      }

      // 7. Count chunks before deletion (for summary)
      const chunksCountResult = await manager.query(
        `SELECT COUNT(*)::int as count FROM kb.chunks WHERE document_id = ANY($1)`,
        [existingIds]
      );
      summary.chunks = chunksCountResult[0]?.count || 0;

      // 8. Delete documents (chunks will be CASCADE deleted by FK constraint)
      await manager.query(`DELETE FROM kb.documents WHERE id = ANY($1)`, [
        existingIds,
      ]);

      return {
        status:
          notFound.length > 0 ? ('partial' as const) : ('deleted' as const),
        deleted: existingIds.length,
        notFound,
        summary,
      };
    });
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
      totalChars: r.total_chars ?? undefined,
      embeddedChunks: r.embedded_chunks ?? undefined,
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

  /**
   * Recreate chunks for a document using project chunking configuration.
   * Deletes existing chunks and creates new ones based on current document content
   * and project's chunking config.
   */
  async recreateChunks(documentId: string): Promise<{
    status: 'success';
    summary: {
      oldChunks: number;
      newChunks: number;
      strategy: string;
      config: any;
    };
  }> {
    const result = await this.dataSource.transaction(async (manager) => {
      // 1. Fetch document with content
      const document = await manager.findOne(Document, {
        where: { id: documentId },
        select: ['id', 'projectId', 'content'],
      });

      if (!document) {
        throw new NotFoundException('Document not found');
      }

      if (!document.content) {
        throw new BadRequestException('Document has no content to chunk');
      }

      if (!document.projectId) {
        throw new BadRequestException('Document has no associated project');
      }

      // 2. Fetch project chunking configuration
      const project = await manager.findOne(Project, {
        where: { id: document.projectId },
        select: ['id', 'chunkingConfig'],
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      // 3. Count existing chunks before deletion
      const oldChunksResult = await manager.query(
        `SELECT COUNT(*)::int as count FROM kb.chunks WHERE document_id = $1`,
        [documentId]
      );
      const oldChunksCount = oldChunksResult[0]?.count || 0;

      // 4. Delete existing chunks
      await manager.query(`DELETE FROM kb.chunks WHERE document_id = $1`, [
        documentId,
      ]);

      // 5. Generate new chunks using project's chunking config
      const chunkingConfig = project.chunkingConfig || {};
      const chunksWithMeta = this.chunker.chunkWithMetadata(
        document.content,
        chunkingConfig
      );

      // 6. Insert new chunks and get their IDs
      let newChunkIds: string[] = [];
      if (chunksWithMeta.length > 0) {
        const values = chunksWithMeta
          .map(
            (chunk, idx) =>
              `('${documentId}', ${idx + 1}, '${chunk.text.replace(
                /'/g,
                "''"
              )}', '${JSON.stringify(chunk.metadata).replace(/'/g, "''")}')`
          )
          .join(',');

        const insertResult = await manager.query(
          `INSERT INTO kb.chunks (document_id, chunk_index, text, metadata) VALUES ${values} RETURNING id`
        );
        newChunkIds = insertResult.map((row: { id: string }) => row.id);
      }

      return {
        status: 'success' as const,
        summary: {
          oldChunks: oldChunksCount,
          newChunks: chunksWithMeta.length,
          strategy: (chunkingConfig as any).strategy || 'character',
          config: chunkingConfig,
        },
        newChunkIds,
      };
    });

    // 7. Queue embedding jobs for the new chunks (outside transaction)
    if (result.newChunkIds.length > 0) {
      const enqueuedCount = await this.chunkEmbeddingJobs.enqueueBatch(
        result.newChunkIds
      );
      this.logger.log(
        `Queued ${enqueuedCount} embedding jobs for document ${documentId}`
      );

      // Warn if embeddings are disabled - jobs will remain pending
      if (!this.config.embeddingsEnabled) {
        this.logger.warn(
          `Embeddings are disabled (EMBEDDING_PROVIDER not set). ` +
            `${enqueuedCount} embedding jobs queued but will NOT be processed until embeddings are enabled.`
        );
      }
    }

    // Return result without internal chunk IDs
    return {
      status: result.status,
      summary: result.summary,
    };
  }
}
