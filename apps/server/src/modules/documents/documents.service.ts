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
import {
  Document,
  DocumentConversionStatus,
} from '../../entities/document.entity';
import { Chunk } from '../../entities/chunk.entity';
import { Project } from '../../entities/project.entity';
import { ChunkerService } from '../../common/utils/chunker.service';
import { ChunkEmbeddingJobsService } from '../chunks/chunk-embedding-jobs.service';
import { EventsService } from '../events/events.service';
import { StorageService } from '../storage/storage.service';
import {
  sanitizeForPostgres,
  sanitizeObjectForPostgres,
} from '../../common/utils';

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
  metadata: Record<string, any> | null;
  chunks: number;
  total_chars: number | null;
  embedded_chunks: number | null;
  extraction_status: string | null;
  extraction_completed_at: string | null;
  extraction_objects_count: number | null;
  // Conversion status fields
  conversion_status: string | null;
  conversion_error: string | null;
  conversion_completed_at: string | null;
  storage_key: string | null;
  storage_url: string | null;
  file_size_bytes: number | null;
  // Data source fields
  source_type: string | null;
  data_source_integration_id: string | null;
  parent_document_id: string | null;
  child_count: number | null;
  // Additional system fields
  external_source_id: string | null;
  sync_version: number | null;
  file_hash: string | null;
  content_hash: string | null;
}

/**
 * Filter options for listing documents.
 */
interface DocumentListFilter {
  orgId?: string;
  projectId?: string;
  /** Filter by source type (e.g., 'upload', 'email', 'url') */
  sourceType?: string;
  /** Filter by data source integration ID */
  dataSourceIntegrationId?: string;
  /** If true, only return root documents (no parent) */
  rootOnly?: boolean;
  /** Filter by parent document ID (get children of a specific document) */
  parentDocumentId?: string;
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
    private readonly storageService?: StorageService,
    @Optional()
    @Inject(EventsService)
    private readonly eventsService?: EventsService
  ) {}

  async list(
    limit = 100,
    cursor?: { createdAt: string; id: string },
    filter?: DocumentListFilter
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
        `(d.created_at < $${paramIdx}::timestamptz OR (d.created_at = $${paramIdx}::timestamptz AND d.id < $${
          paramIdx + 1
        }::uuid))`
      );
      paramIdx += 2;
    }

    // Filter by source type
    if (filter?.sourceType) {
      params.push(filter.sourceType);
      conds.push(`d.source_type = $${paramIdx}::text`);
      paramIdx++;
    }

    // Filter by data source integration ID
    if (filter?.dataSourceIntegrationId) {
      params.push(filter.dataSourceIntegrationId);
      conds.push(`d.data_source_integration_id = $${paramIdx}::uuid`);
      paramIdx++;
    }

    // Filter to root documents only (no parent)
    if (filter?.rootOnly) {
      conds.push(`d.parent_document_id IS NULL`);
    }

    // Filter by parent document ID (get children of a specific document)
    if (filter?.parentDocumentId) {
      params.push(filter.parentDocumentId);
      conds.push(`d.parent_document_id = $${paramIdx}::uuid`);
      paramIdx++;
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // Use DatabaseService to ensure RLS context is set
    const queryFn = async () => {
      // Build count query with same filters (respecting RLS)
      // Re-number parameters for count query since we exclude the limit param ($1)
      const countConds = conds.map((cond) =>
        cond.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num, 10) - 1}`)
      );
      const countWhere = countConds.length
        ? `WHERE ${countConds.join(' AND ')}`
        : '';
      const countParams = params.slice(1); // Remove limit param
      const countResult = await this.db.query(
        `SELECT COUNT(*)::int as total FROM kb.documents d ${countWhere}`,
        countParams
      );
      const total = countResult.rows[0]?.total || 0;

      const result = await this.db.query(
        `SELECT d.id, d.project_id, d.filename, d.source_url, d.mime_type, d.created_at, d.updated_at,
                      d.integration_metadata, d.metadata,
                      d.conversion_status, d.conversion_error, d.conversion_completed_at,
                      d.storage_key, d.storage_url, d.file_size_bytes,
                      d.source_type, d.data_source_integration_id, d.parent_document_id,
                      d.external_source_id, d.sync_version, d.file_hash, d.content_hash,
                      LENGTH(d.content) AS content_length,
                      COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
                      COALESCE((SELECT SUM(LENGTH(c.text))::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS total_chars,
                      COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id AND c.embedding IS NOT NULL),0) AS embedded_chunks,
                      COALESCE((SELECT COUNT(*)::int FROM kb.documents child WHERE child.parent_document_id = d.id),0) AS child_count,
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
                      d.integration_metadata, d.metadata,
                      d.conversion_status, d.conversion_error, d.conversion_completed_at,
                      d.storage_key, d.storage_url, d.file_size_bytes,
                      d.source_type, d.data_source_integration_id, d.parent_document_id,
                      d.external_source_id, d.sync_version, d.file_hash, d.content_hash,
                      LENGTH(d.content) AS content_length,
                      COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS chunks,
                      COALESCE((SELECT SUM(LENGTH(c.text))::int FROM kb.chunks c WHERE c.document_id = d.id),0) AS total_chars,
                      COALESCE((SELECT COUNT(*)::int FROM kb.chunks c WHERE c.document_id = d.id AND c.embedding IS NOT NULL),0) AS embedded_chunks,
                      COALESCE((SELECT COUNT(*)::int FROM kb.documents child WHERE child.parent_document_id = d.id),0) AS child_count,
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

  /**
   * Get distinct source types with document counts for a project.
   * Useful for building a sidebar showing available document sources.
   * Only counts root documents (parent_document_id IS NULL) to match table view.
   */
  async getSourceTypesWithCounts(projectId: string): Promise<
    Array<{
      sourceType: string;
      count: number;
      dataSourceIntegrationId?: string;
      integrationName?: string;
    }>
  > {
    const queryFn = async () => {
      // Get counts grouped by source_type and data_source_integration_id
      // Only count root documents (no parent) to match the table view which uses rootOnly=true
      const result = await this.db.query(
        `SELECT 
           d.source_type,
           d.data_source_integration_id,
           dsi.name as integration_name,
           COUNT(*)::int as count
         FROM kb.documents d
         LEFT JOIN kb.data_source_integrations dsi ON dsi.id = d.data_source_integration_id
         WHERE d.parent_document_id IS NULL
         GROUP BY d.source_type, d.data_source_integration_id, dsi.name
         ORDER BY count DESC, d.source_type`,
        []
      );
      return result.rows;
    };

    const rows = await this.db.runWithTenantContext(projectId, queryFn);

    return rows.map((row: any) => ({
      sourceType: row.source_type || 'upload',
      count: row.count,
      dataSourceIntegrationId: row.data_source_integration_id || undefined,
      integrationName: row.integration_name || undefined,
    }));
  }

  /**
   * Get document with storage information for downloads.
   * Returns basic document info plus storage_key for file retrieval.
   */
  async getWithStorageInfo(
    id: string,
    filter?: { projectId?: string }
  ): Promise<{
    id: string;
    filename: string | null;
    storageKey: string | null;
    mimeType: string | null;
    fileSizeBytes: number | null;
    projectId: string;
    conversionStatus: string | null;
  } | null> {
    const queryFn = async () => {
      const result = await this.db.query(
        `SELECT id, filename, storage_key, mime_type, file_size_bytes, project_id, conversion_status 
         FROM kb.documents WHERE id = $1`,
        [id]
      );
      return result.rows;
    };

    const rows = filter?.projectId
      ? await this.db.runWithTenantContext(filter.projectId, queryFn)
      : await queryFn();

    if (!rows || rows.length === 0) return null;

    return {
      id: rows[0].id,
      filename: rows[0].filename,
      storageKey: rows[0].storage_key,
      mimeType: rows[0].mime_type,
      fileSizeBytes: rows[0].file_size_bytes
        ? Number(rows[0].file_size_bytes)
        : null,
      projectId: rows[0].project_id,
      conversionStatus: rows[0].conversion_status,
    };
  }

  /**
   * Get just the content of a document.
   * Useful for lazy loading content in UIs without fetching full document metadata.
   */
  async getContent(
    id: string,
    filter?: { projectId?: string }
  ): Promise<{ content: string | null } | null> {
    const queryFn = async () => {
      const result = await this.db.query(
        `SELECT content FROM kb.documents WHERE id = $1`,
        [id]
      );
      return result.rows;
    };

    const rows = filter?.projectId
      ? await this.db.runWithTenantContext(filter.projectId, queryFn)
      : await queryFn();

    if (!rows || rows.length === 0) return null;

    return {
      content: rows[0].content,
    };
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

  /**
   * Create a document from an uploaded file BEFORE parsing.
   * This is the document-first approach where:
   * 1. Document is created immediately and visible to user
   * 2. Parsing/conversion happens asynchronously
   * 3. User can see and retry failed conversions
   *
   * @param params - Upload parameters
   * @returns Document info and whether it was a duplicate
   */
  async createFromUpload(params: {
    projectId: string;
    storageKey: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
    fileHash: string;
    requiresConversion: boolean;
  }): Promise<{
    document: DocumentDto;
    isDuplicate: boolean;
    existingDocumentId?: string;
  }> {
    const {
      projectId,
      storageKey,
      filename,
      mimeType,
      fileSizeBytes,
      fileHash,
      requiresConversion,
    } = params;

    // Verify project exists
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: ['id', 'organizationId'],
    });

    if (!project) {
      throw new BadRequestException(`Project not found: ${projectId}`);
    }

    // Check for duplicate file by file_hash (same file uploaded before)
    const existingByFileHash = await this.documentRepository.findOne({
      where: {
        projectId,
        fileHash,
      },
    });

    if (existingByFileHash) {
      this.logger.log(
        `Duplicate file detected by file_hash: ${existingByFileHash.id} (${filename})`
      );
      return {
        document: {
          id: existingByFileHash.id,
          orgId: undefined,
          projectId: existingByFileHash.projectId ?? undefined,
          name: existingByFileHash.filename || filename,
          sourceUrl: existingByFileHash.sourceUrl ?? undefined,
          mimeType: existingByFileHash.mimeType ?? mimeType,
          createdAt: existingByFileHash.createdAt.toISOString(),
          updatedAt: existingByFileHash.updatedAt.toISOString(),
          chunks: 0,
          conversionStatus: existingByFileHash.conversionStatus,
          conversionError: existingByFileHash.conversionError,
          conversionCompletedAt:
            existingByFileHash.conversionCompletedAt?.toISOString() ?? null,
          storageKey: existingByFileHash.storageKey,
          fileSizeBytes: existingByFileHash.fileSizeBytes
            ? Number(existingByFileHash.fileSizeBytes)
            : undefined,
        },
        isDuplicate: true,
        existingDocumentId: existingByFileHash.id,
      };
    }

    // Determine conversion status based on file type
    const conversionStatus: DocumentConversionStatus = requiresConversion
      ? 'pending'
      : 'not_required';

    // Create document
    const document = this.documentRepository.create({
      projectId,
      storageKey,
      filename,
      mimeType,
      fileSizeBytes,
      fileHash,
      sourceType: 'upload',
      conversionStatus,
      content: null, // Will be filled after conversion (or read directly for plain text)
      metadata: {
        originalFilename: filename,
        uploadedAt: new Date().toISOString(),
      },
    });

    let savedDoc: Document;
    try {
      savedDoc = await this.documentRepository.save(document);
    } catch (error: any) {
      // Handle race condition: document was created between our check and insert
      if (error?.code === '23505') {
        // Unique constraint violation - another request created the document
        const raceDoc = await this.documentRepository.findOne({
          where: {
            projectId,
            fileHash,
          },
        });
        if (raceDoc) {
          return {
            document: {
              id: raceDoc.id,
              orgId: undefined,
              projectId: raceDoc.projectId ?? undefined,
              name: raceDoc.filename || filename,
              sourceUrl: raceDoc.sourceUrl ?? undefined,
              mimeType: raceDoc.mimeType ?? mimeType,
              createdAt: raceDoc.createdAt.toISOString(),
              updatedAt: raceDoc.updatedAt.toISOString(),
              chunks: 0,
              conversionStatus: raceDoc.conversionStatus,
              conversionError: raceDoc.conversionError,
              conversionCompletedAt:
                raceDoc.conversionCompletedAt?.toISOString() ?? null,
              storageKey: raceDoc.storageKey,
              fileSizeBytes: raceDoc.fileSizeBytes
                ? Number(raceDoc.fileSizeBytes)
                : undefined,
            },
            isDuplicate: true,
            existingDocumentId: raceDoc.id,
          };
        }
        throw error; // Unexpected: constraint violation but can't find the doc
      }
      throw error;
    }

    // Emit real-time event for document creation
    if (this.eventsService && savedDoc.projectId) {
      this.eventsService.emitCreated(
        'document',
        savedDoc.id,
        savedDoc.projectId,
        {
          filename: savedDoc.filename,
          conversionStatus: savedDoc.conversionStatus,
          fileSizeBytes: savedDoc.fileSizeBytes,
        }
      );
    }

    this.logger.log(
      `Created document ${savedDoc.id} from upload: ${filename} (conversion: ${conversionStatus})`
    );

    return {
      document: {
        id: savedDoc.id,
        orgId: undefined,
        projectId: savedDoc.projectId ?? undefined,
        name: savedDoc.filename || filename,
        sourceUrl: savedDoc.sourceUrl ?? undefined,
        mimeType: savedDoc.mimeType ?? mimeType,
        createdAt: savedDoc.createdAt.toISOString(),
        updatedAt: savedDoc.updatedAt.toISOString(),
        chunks: 0,
        conversionStatus: savedDoc.conversionStatus,
        conversionError: savedDoc.conversionError,
        conversionCompletedAt:
          savedDoc.conversionCompletedAt?.toISOString() ?? null,
        storageKey: savedDoc.storageKey,
        fileSizeBytes: savedDoc.fileSizeBytes
          ? Number(savedDoc.fileSizeBytes)
          : undefined,
      },
      isDuplicate: false,
    };
  }

  /**
   * Update document after conversion completes (success or failure).
   * Called by the document parsing worker after processing.
   */
  async updateConversionStatus(
    documentId: string,
    status: 'completed' | 'failed',
    options: {
      content?: string;
      contentHash?: string;
      error?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const updateData: {
      conversionStatus: DocumentConversionStatus;
      conversionCompletedAt: Date;
      content?: string | null;
      contentHash?: string | null;
      conversionError?: string | null;
      metadata?: Record<string, any>;
    } = {
      conversionStatus: status,
      conversionCompletedAt: new Date(),
    };

    if (status === 'completed' && options.content !== undefined) {
      updateData.content = sanitizeForPostgres(options.content);
      updateData.contentHash = options.contentHash ?? null;
    }

    if (status === 'failed' && options.error) {
      updateData.conversionError = options.error;
    }

    if (options.metadata) {
      // Merge with existing metadata
      const existing = await this.documentRepository.findOne({
        where: { id: documentId },
        select: ['metadata'],
      });
      updateData.metadata = {
        ...existing?.metadata,
        ...sanitizeObjectForPostgres(options.metadata),
      };
    }

    await this.documentRepository.update(documentId, updateData);

    this.logger.log(
      `Updated document ${documentId} conversion status: ${status}`
    );

    // Emit event for status change
    const doc = await this.documentRepository.findOne({
      where: { id: documentId },
      select: ['id', 'projectId'],
    });
    if (this.eventsService && doc?.projectId) {
      this.eventsService.emitUpdated('document', documentId, doc.projectId, {
        conversionStatus: status,
        conversionError: options.error,
      });
    }
  }

  /**
   * Mark document as processing (conversion started).
   */
  async markConversionProcessing(documentId: string): Promise<void> {
    await this.documentRepository.update(documentId, {
      conversionStatus: 'processing',
      conversionError: null, // Clear any previous error
    });
  }

  /**
   * Reset document conversion status to pending (for retry).
   */
  async resetConversionStatus(documentId: string): Promise<void> {
    await this.documentRepository.update(documentId, {
      conversionStatus: 'pending',
      conversionError: null, // Clear any previous error
      conversionCompletedAt: null,
    });
  }

  /**
   * Mark document conversion as failed with an error message.
   */
  async markConversionFailed(documentId: string, error: string): Promise<void> {
    await this.documentRepository.update(documentId, {
      conversionStatus: 'failed',
      conversionError: error,
      conversionCompletedAt: new Date(),
    });
  }

  /**
   * Mark document as not requiring conversion.
   */
  async markConversionNotRequired(documentId: string): Promise<void> {
    await this.documentRepository.update(documentId, {
      conversionStatus: 'not_required',
      conversionError: null,
      conversionCompletedAt: null,
    });
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
   * Uses batched SQL queries for efficiency with large numbers of documents
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

    // Use batched queries for efficiency instead of per-document queries
    // This is critical for bulk operations with many documents (e.g., 50-100+)

    // 1. Get all documents info in one query
    const docsResult = await this.dataSource.query(
      `SELECT id, filename, source_url, created_at 
       FROM kb.documents 
       WHERE id = ANY($1)`,
      [documentIds]
    );

    if (docsResult.length === 0) {
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

    const existingDocIds = docsResult.map((row: any) => row.id);

    // 2. Count chunks per document in one query
    const chunksResult = await this.dataSource.query(
      `SELECT document_id, COUNT(*)::int as count 
       FROM kb.chunks 
       WHERE document_id = ANY($1) 
       GROUP BY document_id`,
      [existingDocIds]
    );
    const chunksMap = new Map<string, number>(
      chunksResult.map((row: any) => [row.document_id, row.count])
    );

    // 3. Count extraction jobs per document in one query
    const jobsResult = await this.dataSource.query(
      `SELECT document_id, COUNT(*)::int as count 
       FROM kb.object_extraction_jobs 
       WHERE document_id = ANY($1) 
       GROUP BY document_id`,
      [existingDocIds]
    );
    const jobsMap = new Map<string, number>(
      jobsResult.map((row: any) => [row.document_id, row.count])
    );

    // 4. Get all extraction job IDs for these documents in one query
    const jobIdsResult = await this.dataSource.query(
      `SELECT id, document_id 
       FROM kb.object_extraction_jobs 
       WHERE document_id = ANY($1)`,
      [existingDocIds]
    );
    const allJobIds = jobIdsResult.map((row: any) => row.id);
    const jobIdsByDoc = new Map<string, string[]>();
    for (const row of jobIdsResult) {
      const existing = jobIdsByDoc.get(row.document_id) || [];
      existing.push(row.id);
      jobIdsByDoc.set(row.document_id, existing);
    }

    // 5. Count graph objects per extraction job (then aggregate per document)
    let objectsMap = new Map<string, number>();
    let allObjectIds: string[] = [];
    let objectIdsByDoc = new Map<string, string[]>();

    if (allJobIds.length > 0) {
      const objectsResult = await this.dataSource.query(
        `SELECT extraction_job_id, COUNT(*)::int as count 
         FROM kb.graph_objects 
         WHERE extraction_job_id = ANY($1) 
         GROUP BY extraction_job_id`,
        [allJobIds]
      );
      const objectsByJob = new Map<string, number>(
        objectsResult.map((row: any) => [row.extraction_job_id, row.count])
      );

      // Aggregate objects per document
      for (const [docId, jobIds] of jobIdsByDoc) {
        const total = jobIds.reduce(
          (sum, jobId) => sum + (objectsByJob.get(jobId) || 0),
          0
        );
        objectsMap.set(docId, total);
      }

      // Get all object IDs for relationship counting
      const objectIdsResult = await this.dataSource.query(
        `SELECT id, extraction_job_id 
         FROM kb.graph_objects 
         WHERE extraction_job_id = ANY($1)`,
        [allJobIds]
      );
      allObjectIds = objectIdsResult.map((row: any) => row.id);

      // Map object IDs to documents via extraction jobs
      const jobToDoc = new Map<string, string>();
      for (const [docId, jobIds] of jobIdsByDoc) {
        for (const jobId of jobIds) {
          jobToDoc.set(jobId, docId);
        }
      }
      for (const row of objectIdsResult) {
        const docId = jobToDoc.get(row.extraction_job_id);
        if (docId) {
          const existing = objectIdsByDoc.get(docId) || [];
          existing.push(row.id);
          objectIdsByDoc.set(docId, existing);
        }
      }
    }

    // 6. Count relationships per document (objects where src or dst belongs to doc)
    let relationshipsMap = new Map<string, number>();
    if (allObjectIds.length > 0) {
      // For bulk, just get total count - per-document breakdown would require complex query
      const relResult = await this.dataSource.query(
        `SELECT COUNT(*)::int as count 
         FROM kb.graph_relationships 
         WHERE src_id = ANY($1) OR dst_id = ANY($1)`,
        [allObjectIds]
      );
      const totalRelationships = relResult[0]?.count || 0;

      // Distribute relationships proportionally based on object count per doc
      // This is an approximation for the summary, exact per-doc would need subqueries
      const totalObjects = allObjectIds.length;
      for (const [docId, objIds] of objectIdsByDoc) {
        const proportion = objIds.length / totalObjects;
        relationshipsMap.set(
          docId,
          Math.round(totalRelationships * proportion)
        );
      }
    }

    // 7. Count notifications per document in one query
    const notificationsResult = await this.dataSource.query(
      `SELECT related_resource_id, COUNT(*)::int as count 
       FROM kb.notifications 
       WHERE related_resource_type = 'document' AND related_resource_id = ANY($1) 
       GROUP BY related_resource_id`,
      [existingDocIds]
    );
    const notificationsMap = new Map<string, number>(
      notificationsResult.map((row: any) => [
        row.related_resource_id,
        row.count,
      ])
    );

    // Build per-document results
    type DocumentImpact = {
      document: { id: string; name: string; createdAt: string };
      impact: {
        chunks: number;
        extractionJobs: number;
        graphObjects: number;
        graphRelationships: number;
        notifications: number;
      };
    };
    const documents: DocumentImpact[] = docsResult.map((doc: any) => ({
      document: {
        id: doc.id as string,
        name: (doc.filename || doc.source_url || 'unknown') as string,
        createdAt: new Date(doc.created_at).toISOString(),
      },
      impact: {
        chunks: chunksMap.get(doc.id) || 0,
        extractionJobs: jobsMap.get(doc.id) || 0,
        graphObjects: objectsMap.get(doc.id) || 0,
        graphRelationships: relationshipsMap.get(doc.id) || 0,
        notifications: notificationsMap.get(doc.id) || 0,
      },
    }));

    // Aggregate total impact
    const totalImpact = documents.reduce(
      (acc, curr) => {
        acc.chunks += curr.impact.chunks;
        acc.extractionJobs += curr.impact.extractionJobs;
        acc.graphObjects += curr.impact.graphObjects;
        acc.graphRelationships += curr.impact.graphRelationships;
        acc.notifications += curr.impact.notifications;
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
      totalDocuments: documents.length,
      impact: totalImpact,
      documents,
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
    // Get storage key before starting transaction (for cleanup after DB deletion)
    let storageKey: string | null = null;
    const storageResult = await this.dataSource.query(
      `SELECT storage_key FROM kb.documents WHERE id = $1`,
      [documentId]
    );
    storageKey = storageResult[0]?.storage_key || null;

    const result = await this.dataSource.transaction(async (manager) => {
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

    // Clean up storage file after successful DB deletion
    if (storageKey && this.storageService) {
      try {
        await this.storageService.delete(storageKey);
        this.logger.debug(`Deleted storage file: ${storageKey}`);
      } catch (err) {
        // Log warning but don't fail the deletion - DB is source of truth
        this.logger.warn(
          `Failed to delete storage file ${storageKey} for document ${documentId}: ${err}`
        );
      }
    }

    return result;
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

    // Get storage keys before starting transaction (for cleanup after DB deletion)
    const storageKeysResult = await this.dataSource.query(
      `SELECT storage_key FROM kb.documents WHERE id = ANY($1) AND storage_key IS NOT NULL`,
      [documentIds]
    );
    const storageKeys: string[] = storageKeysResult
      .map((row: any) => row.storage_key)
      .filter((key: string | null) => key !== null);

    const result = await this.dataSource.transaction(async (manager) => {
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

    // Clean up storage files after successful DB deletion
    if (storageKeys.length > 0 && this.storageService) {
      for (const key of storageKeys) {
        try {
          await this.storageService.delete(key);
          this.logger.debug(`Deleted storage file: ${key}`);
        } catch (err) {
          // Log warning but don't fail the deletion - DB is source of truth
          this.logger.warn(`Failed to delete storage file ${key}: ${err}`);
        }
      }
    }

    return result;
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
      metadata: r.metadata || undefined,
      chunks: r.chunks,
      totalChars: r.total_chars ?? undefined,
      embeddedChunks: r.embedded_chunks ?? undefined,
      extractionStatus: r.extraction_status || undefined,
      extractionCompletedAt: r.extraction_completed_at || undefined,
      extractionObjectsCount: r.extraction_objects_count || undefined,
      // Conversion status fields
      conversionStatus: r.conversion_status || undefined,
      conversionError: r.conversion_error,
      conversionCompletedAt: r.conversion_completed_at,
      storageKey: r.storage_key,
      storageUrl: r.storage_url,
      fileSizeBytes: r.file_size_bytes ? Number(r.file_size_bytes) : undefined,
      // Data source fields
      sourceType: r.source_type || undefined,
      dataSourceIntegrationId: r.data_source_integration_id || undefined,
      parentDocumentId: r.parent_document_id || undefined,
      childCount: r.child_count ?? undefined,
      // Additional system fields
      externalSourceId: r.external_source_id || undefined,
      syncVersion: r.sync_version ?? undefined,
      fileHash: r.file_hash || undefined,
      contentHash: r.content_hash || undefined,
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

  /**
   * Create or update a Document from a completed document parsing job.
   * This is called by the DocumentParsingWorkerService after parsing completes.
   *
   * The document will be created with:
   * - Reference to storage (storageKey) - content stays in MinIO, not in DB
   * - Metadata from parsing (page count, word count, etc.)
   * - Chunks generated from parsed content
   * - Embedding jobs queued for chunks
   */
  async createFromParsingJob(params: {
    projectId: string;
    organizationId: string;
    storageKey: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
    parsedContent: string;
    metadata?: Record<string, any>;
  }): Promise<{
    documentId: string;
    chunksCreated: number;
    embeddingJobsQueued: number;
  }> {
    const {
      projectId,
      organizationId,
      storageKey,
      filename,
      mimeType,
      fileSizeBytes,
      metadata: rawMetadata = {},
    } = params;

    // Sanitize content for PostgreSQL storage (safety net - content should already be sanitized)
    const parsedContent = sanitizeForPostgres(params.parsedContent);

    // Sanitize metadata for PostgreSQL JSONB storage
    const metadata = sanitizeObjectForPostgres(rawMetadata);

    // Generate content hash for deduplication
    const contentHash = this.hash.sha256(parsedContent);

    // Check for existing document with same content (deduplication)
    const existing = await this.documentRepository.findOne({
      where: {
        projectId,
        contentHash,
      },
    });

    if (existing) {
      this.logger.log(
        `Document with same content hash already exists: ${existing.id}, updating storage reference`
      );

      // Update existing document with new storage info if it was missing
      if (!existing.storageKey) {
        await this.documentRepository.update(existing.id, {
          storageKey,
          fileSizeBytes,
          filename,
          mimeType,
          metadata: { ...existing.metadata, ...metadata },
        });
      }

      return {
        documentId: existing.id,
        chunksCreated: 0,
        embeddingJobsQueued: 0,
      };
    }

    // Get project for chunking configuration
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: ['id', 'chunkingConfig'],
    });

    if (!project) {
      throw new BadRequestException(`Project not found: ${projectId}`);
    }

    // Create document in a transaction
    const result = await this.dataSource.transaction(async (manager) => {
      // Create document WITHOUT content in DB - only reference to storage
      const document = manager.create(Document, {
        projectId,
        storageKey,
        filename,
        mimeType,
        fileSizeBytes,
        contentHash,
        content: null, // Content stays in MinIO, not in DB
        sourceType: 'upload',
        metadata: {
          ...metadata,
          parsedContentLength: parsedContent.length,
        },
      });

      const savedDoc = await manager.save(document);

      // Generate chunks from parsed content using project's chunking config
      const chunkingConfig = project.chunkingConfig || {};
      const chunksWithMeta = this.chunker.chunkWithMetadata(
        parsedContent,
        chunkingConfig
      );

      // Insert chunks
      let chunkIds: string[] = [];
      if (chunksWithMeta.length > 0) {
        // Use parameterized query for safety
        for (let i = 0; i < chunksWithMeta.length; i++) {
          const chunk = chunksWithMeta[i];
          // Sanitize chunk text and metadata for PostgreSQL
          const sanitizedChunkText = sanitizeForPostgres(chunk.text);
          const sanitizedChunkMetadata = sanitizeObjectForPostgres(
            chunk.metadata
          );
          const insertResult = await manager.query(
            `INSERT INTO kb.chunks (document_id, chunk_index, text, metadata) 
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [
              savedDoc.id,
              i + 1,
              sanitizedChunkText,
              JSON.stringify(sanitizedChunkMetadata),
            ]
          );
          chunkIds.push(insertResult[0].id);
        }
      }

      return {
        documentId: savedDoc.id,
        chunkIds,
        chunksCreated: chunksWithMeta.length,
      };
    });

    // Queue embedding jobs for the chunks (outside transaction)
    let embeddingJobsQueued = 0;
    if (result.chunkIds.length > 0) {
      embeddingJobsQueued = await this.chunkEmbeddingJobs.enqueueBatch(
        result.chunkIds
      );
      this.logger.log(
        `Queued ${embeddingJobsQueued} embedding jobs for document ${result.documentId}`
      );

      if (!this.config.embeddingsEnabled) {
        this.logger.warn(
          `Embeddings are disabled. ${embeddingJobsQueued} jobs queued but will NOT be processed.`
        );
      }
    }

    // Emit real-time event for document creation
    if (this.eventsService) {
      this.eventsService.emitCreated('document', result.documentId, projectId, {
        filename,
        storageKey,
        chunksCreated: result.chunksCreated,
      });
    }

    this.logger.log(
      `Created document ${result.documentId} from parsing job: ` +
        `${result.chunksCreated} chunks, ${embeddingJobsQueued} embedding jobs queued`
    );

    return {
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      embeddingJobsQueued,
    };
  }

  /**
   * Find documents that have content but no chunks.
   * Useful for identifying documents imported before chunking was implemented.
   */
  async findUnchunkedDocuments(
    projectId: string,
    options?: {
      sourceTypes?: string[];
      limit?: number;
    }
  ): Promise<{ id: string; filename: string; sourceType: string }[]> {
    const limit = options?.limit || 100;

    let query = `
      SELECT d.id, d.filename, d.source_type as "sourceType"
      FROM kb.documents d
      WHERE d.project_id = $1
        AND d.content IS NOT NULL
        AND d.content != ''
        AND NOT EXISTS (
          SELECT 1 FROM kb.chunks c WHERE c.document_id = d.id
        )
    `;

    const params: any[] = [projectId];

    if (options?.sourceTypes && options.sourceTypes.length > 0) {
      query += ` AND d.source_type = ANY($2)`;
      params.push(options.sourceTypes);
    }

    query += ` ORDER BY d.created_at ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    return this.dataSource.query(query, params);
  }

  /**
   * Bulk recreate chunks for multiple documents.
   * Processes documents sequentially to avoid overwhelming the system.
   */
  async bulkRecreateChunks(
    documentIds: string[],
    options?: {
      onProgress?: (processed: number, total: number, docId: string) => void;
    }
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    errors: { documentId: string; error: string }[];
  }> {
    const result = {
      total: documentIds.length,
      successful: 0,
      failed: 0,
      errors: [] as { documentId: string; error: string }[],
    };

    for (let i = 0; i < documentIds.length; i++) {
      const docId = documentIds[i];

      try {
        await this.recreateChunks(docId);
        result.successful++;
        this.logger.debug(
          `Chunked document ${i + 1}/${documentIds.length}: ${docId}`
        );
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          documentId: docId,
          error: error.message,
        });
        this.logger.warn(`Failed to chunk document ${docId}: ${error.message}`);
      }

      if (options?.onProgress) {
        options.onProgress(i + 1, documentIds.length, docId);
      }
    }

    this.logger.log(
      `Bulk chunking complete: ${result.successful} successful, ${result.failed} failed out of ${result.total}`
    );

    return result;
  }

  /**
   * Update document fields for email source type.
   * Used when converting an uploaded email file to properly mark it as email type.
   */
  async updateDocumentForEmail(
    documentId: string,
    options: {
      sourceType: 'email';
      filename: string;
    }
  ): Promise<void> {
    await this.documentRepository.update(documentId, {
      sourceType: options.sourceType,
      filename: options.filename,
    });
    this.logger.debug(
      `Updated document ${documentId} as email: "${options.filename}"`
    );
  }

  /**
   * Create a child document from an email attachment.
   * Sets up the document with parentDocumentId and triggers a parsing job.
   */
  async createFromEmailAttachment(options: {
    projectId: string;
    organizationId: string;
    parentDocumentId: string;
    storageKey: string;
    filename: string;
    mimeType: string;
    fileSizeBytes: number;
  }): Promise<{ documentId: string }> {
    const {
      projectId,
      parentDocumentId,
      storageKey,
      filename,
      mimeType,
      fileSizeBytes,
    } = options;

    // Check if this is a plain text file that doesn't need conversion
    const needsConversion = this.needsConversion(mimeType, filename);

    // Create the document
    const document = this.documentRepository.create({
      projectId,
      parentDocumentId,
      sourceType: 'upload', // Attachment inherits upload type
      filename,
      mimeType,
      storageKey,
      fileSizeBytes,
      conversionStatus: needsConversion ? 'pending' : 'not_required',
      metadata: {
        isEmailAttachment: true,
        parentDocumentId,
      },
    });

    const savedDoc = await this.documentRepository.save(document);
    this.logger.debug(
      `Created email attachment document ${savedDoc.id}: ${filename}`
    );

    // Note: The parsing job is created by the caller (DocumentParsingWorkerService)
    // to avoid circular dependencies between DocumentsService and DocumentParsingJobService

    // Emit event
    if (this.eventsService && projectId) {
      this.eventsService.emitCreated('document', savedDoc.id, projectId, {
        filename,
        sourceType: 'upload',
        parentDocumentId,
      });
    }

    return { documentId: savedDoc.id };
  }

  /**
   * Check if a file needs conversion based on MIME type and filename.
   */
  private needsConversion(
    mimeType: string | null,
    filename: string | null
  ): boolean {
    // Plain text types don't need conversion
    const plainTextMimeTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'text/xml',
      'application/json',
      'application/xml',
      'text/yaml',
      'application/x-yaml',
    ];

    if (mimeType && plainTextMimeTypes.includes(mimeType)) {
      return false;
    }

    // Check extension
    const plainTextExtensions = [
      '.txt',
      '.md',
      '.markdown',
      '.csv',
      '.json',
      '.xml',
      '.yaml',
      '.yml',
    ];

    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext && plainTextExtensions.includes(`.${ext}`)) {
        return false;
      }
    }

    // Default to needing conversion
    return true;
  }
}
