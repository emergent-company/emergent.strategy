import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, IsNull, Not } from 'typeorm';
import {
  DocumentParsingJob,
  DocumentParsingJobStatus,
} from '../../entities/document-parsing-job.entity';
import { Project } from '../../entities/project.entity';
import { CreateDocumentParsingJobDto } from './dto';
import {
  sanitizeForPostgres,
  sanitizeObjectForPostgres,
} from '../../common/utils';

/**
 * Result of a dequeue operation
 */
export interface DequeuedJob {
  job: DocumentParsingJob;
  claimedAt: Date;
}

/**
 * Options for creating a document parsing job
 */
export interface CreateJobOptions extends CreateDocumentParsingJobDto {
  /**
   * Maximum retries before marking as failed
   */
  maxRetries?: number;
}

/**
 * Service for managing document parsing jobs.
 *
 * Handles CRUD operations and job queue management for document parsing jobs.
 * Following the pattern from ExtractionJobService.
 */
@Injectable()
export class DocumentParsingJobService {
  private readonly logger = new Logger(DocumentParsingJobService.name);

  constructor(
    @InjectRepository(DocumentParsingJob)
    private readonly repository: Repository<DocumentParsingJob>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>
  ) {}

  /**
   * Create a new document parsing job.
   *
   * @param options - Job creation options
   * @returns The created job
   */
  async createJob(options: CreateJobOptions): Promise<DocumentParsingJob> {
    // Sanitize metadata for PostgreSQL JSONB storage
    const sanitizedMetadata = options.metadata
      ? sanitizeObjectForPostgres(options.metadata)
      : {};

    const job = this.repository.create({
      organizationId: options.organizationId,
      projectId: options.projectId,
      sourceType: options.sourceType,
      sourceFilename: options.sourceFilename ?? null,
      mimeType: options.mimeType ?? null,
      fileSizeBytes: options.fileSizeBytes ?? null,
      storageKey: options.storageKey ?? null,
      documentId: options.documentId ?? null,
      extractionJobId: options.extractionJobId ?? null,
      metadata: sanitizedMetadata,
      status: 'pending',
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
    });

    const saved = await this.repository.save(job);

    this.logger.log(
      `Created document parsing job ${saved.id} (source: ${saved.sourceType}, file: ${saved.sourceFilename})`
    );

    return saved;
  }

  /**
   * Dequeue pending jobs for processing.
   * Atomically claims jobs by setting status to 'processing'.
   *
   * @param batchSize - Maximum number of jobs to dequeue
   * @returns Array of claimed jobs
   */
  async dequeueJobs(batchSize: number): Promise<DocumentParsingJob[]> {
    // Use a transaction to atomically claim jobs
    const result = await this.repository.manager.transaction(
      async (manager) => {
        // Find pending jobs that are ready for processing
        // Include retry_pending jobs where nextRetryAt has passed
        const now = new Date();

        const queryResult = await manager.query(
          `UPDATE kb.document_parsing_jobs
         SET status = 'processing',
             started_at = NOW(),
             updated_at = NOW()
         WHERE id IN (
           SELECT id FROM kb.document_parsing_jobs
           WHERE (status = 'pending')
              OR (status = 'retry_pending' AND next_retry_at <= $1)
           ORDER BY created_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         RETURNING *`,
          [now.toISOString(), batchSize]
        );

        // TypeORM's manager.query() for UPDATE...RETURNING returns a tuple:
        // [rows, affectedCount] - NOT just the rows array!
        // See: documents.service.ts uses queryResult[1] for count
        const rows =
          Array.isArray(queryResult) && Array.isArray(queryResult[0])
            ? queryResult[0]
            : queryResult;

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
          return [];
        }

        // Map raw SQL rows (snake_case) to entity-like objects (camelCase)
        return rows.map((row: any) => this.mapRowToEntity(row));
      }
    );

    if (result.length > 0) {
      this.logger.log(`Dequeued ${result.length} document parsing jobs`);
    }

    return result;
  }

  /**
   * Map a raw SQL row (snake_case columns) to entity-like object (camelCase).
   * This is needed because raw SQL queries don't go through TypeORM's
   * automatic column name transformation.
   */
  private mapRowToEntity(row: any): DocumentParsingJob {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      status: row.status,
      sourceType: row.source_type,
      sourceFilename: row.source_filename,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes ? Number(row.file_size_bytes) : null,
      storageKey: row.storage_key,
      documentId: row.document_id,
      extractionJobId: row.extraction_job_id,
      parsedContent: row.parsed_content,
      errorMessage: row.error_message,
      metadata: row.metadata || {},
      retryCount: Number(row.retry_count ?? 0),
      maxRetries: Number(row.max_retries ?? 3),
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    } as DocumentParsingJob;
  }

  /**
   * Update job status with optional metadata updates.
   *
   * @param jobId - Job ID
   * @param status - New status
   * @param updates - Optional additional updates
   */
  async updateStatus(
    jobId: string,
    status: DocumentParsingJobStatus,
    updates?: Partial<{
      parsedContent: string | null;
      errorMessage: string | null;
      metadata: Record<string, any>;
      documentId: string | null;
    }>
  ): Promise<DocumentParsingJob> {
    // Build update object for TypeORM
    const updateData: {
      status: DocumentParsingJobStatus;
      updatedAt: Date;
      parsedContent?: string | null;
      errorMessage?: string | null;
      documentId?: string | null;
      metadata?: Record<string, any>;
    } = {
      status,
      updatedAt: new Date(),
    };

    if (updates?.parsedContent !== undefined) {
      updateData.parsedContent = updates.parsedContent;
    }

    if (updates?.errorMessage !== undefined) {
      updateData.errorMessage = updates.errorMessage;
    }

    if (updates?.documentId !== undefined) {
      updateData.documentId = updates.documentId;
    }

    if (updates?.metadata) {
      // Merge metadata and sanitize all string values for PostgreSQL JSONB
      // JSONB is strict about Unicode escape sequences, so we sanitize everything
      const existing = await this.repository.findOne({ where: { id: jobId } });
      if (existing) {
        const mergedMetadata = { ...existing.metadata, ...updates.metadata };
        updateData.metadata = sanitizeObjectForPostgres(mergedMetadata);
      }
    }

    await this.repository.update(jobId, updateData);

    const updated = await this.repository.findOne({ where: { id: jobId } });
    if (!updated) {
      throw new NotFoundException(`Document parsing job ${jobId} not found`);
    }

    return updated;
  }

  /**
   * Mark a job as completed successfully.
   *
   * @param jobId - Job ID
   * @param result - Parsing result
   */
  async markCompleted(
    jobId: string,
    result: {
      parsedContent: string;
      metadata?: Record<string, any>;
      documentId?: string;
    }
  ): Promise<DocumentParsingJob> {
    // Sanitize content to remove characters PostgreSQL doesn't support
    // This uses the centralized utility from common/utils
    const sanitizedContent = sanitizeForPostgres(result.parsedContent);

    const job = await this.updateStatus(jobId, 'completed', {
      parsedContent: sanitizedContent,
      metadata: {
        ...(result.metadata ?? {}),
        completedAt: new Date().toISOString(),
        characterCount: sanitizedContent.length,
        originalCharacterCount: result.parsedContent.length,
        sanitized: sanitizedContent.length !== result.parsedContent.length,
      },
      documentId: result.documentId ?? null,
    });

    // Update completedAt separately (TypeORM doesn't handle this well in partial updates)
    await this.repository.update(jobId, { completedAt: new Date() });

    this.logger.log(
      `Document parsing job ${jobId} completed (${
        sanitizedContent.length
      } chars${
        sanitizedContent.length !== result.parsedContent.length
          ? `, sanitized from ${result.parsedContent.length}`
          : ''
      })`
    );

    return job;
  }

  /**
   * Mark a job as failed with error details.
   *
   * @param jobId - Job ID
   * @param error - Error message or Error object
   */
  async markFailed(
    jobId: string,
    error: string | Error
  ): Promise<DocumentParsingJob> {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Sanitize error message and stack for PostgreSQL
    const sanitizedErrorMessage = sanitizeForPostgres(errorMessage);
    const sanitizedErrorStack = errorStack
      ? sanitizeForPostgres(errorStack)
      : undefined;

    const job = await this.repository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Document parsing job ${jobId} not found`);
    }

    const shouldRetry = job.retryCount < job.maxRetries;

    if (shouldRetry) {
      // Schedule retry with exponential backoff
      const delayMs = this.calculateRetryDelay(job.retryCount);
      const nextRetryAt = new Date(Date.now() + delayMs);

      const retryMetadata: Record<string, any> = {
        ...job.metadata,
        lastError: sanitizedErrorMessage,
        lastErrorStack: sanitizedErrorStack,
        lastFailedAt: new Date().toISOString(),
      };

      // Sanitize entire metadata object for PostgreSQL JSONB
      const sanitizedMetadata = sanitizeObjectForPostgres(retryMetadata);

      await this.repository.update(jobId, {
        status: 'retry_pending' as const,
        errorMessage: sanitizedErrorMessage,
        retryCount: job.retryCount + 1,
        nextRetryAt,
        updatedAt: new Date(),
        metadata: sanitizedMetadata,
      });

      this.logger.warn(
        `Document parsing job ${jobId} failed (retry ${job.retryCount + 1}/${
          job.maxRetries
        }), next retry at ${nextRetryAt.toISOString()}: ${sanitizedErrorMessage}`
      );
    } else {
      // No more retries - mark as permanently failed
      const failedMetadata: Record<string, any> = {
        ...job.metadata,
        lastError: sanitizedErrorMessage,
        lastErrorStack: sanitizedErrorStack,
        failedAt: new Date().toISOString(),
      };

      // Sanitize entire metadata object for PostgreSQL JSONB
      const sanitizedMetadata = sanitizeObjectForPostgres(failedMetadata);

      await this.repository.update(jobId, {
        status: 'failed' as const,
        errorMessage: sanitizedErrorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
        metadata: sanitizedMetadata,
      });

      this.logger.error(
        `Document parsing job ${jobId} failed permanently after ${job.maxRetries} retries: ${sanitizedErrorMessage}`
      );
    }

    const updated = await this.repository.findOne({ where: { id: jobId } });
    return updated!;
  }

  /**
   * Find orphaned jobs (stuck in 'processing' status).
   * These jobs may have been abandoned due to server restart.
   *
   * @param thresholdMinutes - Minutes since startedAt to consider orphaned
   * @returns Array of orphaned jobs
   */
  async findOrphanedJobs(thresholdMinutes = 10): Promise<DocumentParsingJob[]> {
    const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const orphaned = await this.repository.find({
      where: {
        status: 'processing',
        startedAt: LessThan(threshold),
      },
      order: { startedAt: 'ASC' },
    });

    return orphaned;
  }

  /**
   * Reset orphaned jobs back to pending status.
   *
   * @param jobIds - IDs of jobs to reset
   * @returns Number of jobs reset
   */
  async resetOrphanedJobs(jobIds: string[]): Promise<number> {
    if (jobIds.length === 0) return 0;

    const result = await this.repository.update(
      { id: In(jobIds), status: 'processing' },
      {
        status: 'pending',
        startedAt: null,
        updatedAt: new Date(),
      }
    );

    const count = result.affected ?? 0;
    if (count > 0) {
      this.logger.warn(`Reset ${count} orphaned document parsing jobs`);
    }

    return count;
  }

  /**
   * Get jobs by project ID.
   *
   * @param projectId - Project ID
   * @param limit - Maximum number of jobs to return
   * @param offset - Offset for pagination
   * @returns Array of jobs
   */
  async findByProject(
    projectId: string,
    limit = 20,
    offset = 0
  ): Promise<DocumentParsingJob[]> {
    return this.repository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get jobs by status.
   *
   * @param status - Job status to filter by
   * @param limit - Maximum number of jobs to return
   * @returns Array of jobs
   */
  async findByStatus(
    status: DocumentParsingJobStatus,
    limit = 100
  ): Promise<DocumentParsingJob[]> {
    return this.repository.find({
      where: { status },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * Find a job by ID.
   *
   * @param id - Job UUID
   * @returns The job or null if not found
   */
  async findById(id: string): Promise<DocumentParsingJob | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Get the organization ID for a project.
   * Used to derive org ID when creating jobs since frontend
   * only sends project ID (org ID is derived automatically).
   *
   * @param projectId - Project ID
   * @returns Organization ID or null if project not found
   */
  async getProjectOrg(projectId: string): Promise<string | null> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: ['organizationId'],
    });
    return project?.organizationId || null;
  }

  /**
   * Calculate retry delay using exponential backoff.
   * Base delay: 10 seconds, max: 5 minutes, multiplier: 3
   *
   * @param retryCount - Current retry count (0-indexed)
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(retryCount: number): number {
    const baseDelayMs = 10000; // 10 seconds
    const maxDelayMs = 300000; // 5 minutes
    const multiplier = 3;

    const delay = baseDelayMs * Math.pow(multiplier, retryCount);
    return Math.min(delay, maxDelayMs);
  }

  /**
   * Find jobs by document ID.
   *
   * @param documentId - Document ID
   * @returns Array of jobs associated with the document
   */
  async findByDocumentId(documentId: string): Promise<DocumentParsingJob[]> {
    return this.repository.find({
      where: { documentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Cancel pending/processing jobs for a document.
   * Sets job status to 'failed' with a cancellation message.
   *
   * @param documentId - Document ID to cancel jobs for
   * @returns Number of jobs cancelled
   */
  async cancelJobsForDocument(documentId: string): Promise<number> {
    const result = await this.repository.update(
      {
        documentId,
        status: In(['pending', 'processing', 'retry_pending']),
      },
      {
        status: 'failed',
        errorMessage: 'Cancelled by user',
        completedAt: new Date(),
        updatedAt: new Date(),
      }
    );

    const count = result.affected ?? 0;
    if (count > 0) {
      this.logger.log(
        `Cancelled ${count} parsing jobs for document ${documentId}`
      );
    }

    return count;
  }
}
