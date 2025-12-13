import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import {
  CreateExtractionJobDto,
  UpdateExtractionJobDto,
  ExtractionJobDto,
  ListExtractionJobsDto,
  ExtractionJobListDto,
  ExtractionJobStatus,
} from './dto/extraction-job.dto';
import { ObjectExtractionJob } from '../../entities/object-extraction-job.entity';
import { EventsService } from '../events/events.service';

interface ExtractionJobSchemaInfo {
  orgColumn?: 'organization_id';
  projectColumn: 'project_id';
  subjectColumn?: 'subject_id' | 'created_by';
  totalItemsColumn?: 'total_items';
  processedItemsColumn?: 'processed_items';
  successfulItemsColumn?: 'successful_items';
  failedItemsColumn?: 'failed_items';
  discoveredTypesColumn?: 'discovered_types';
  createdObjectsColumn?: 'created_objects' | 'objects_created';
  createdObjectsIsArray: boolean;
  errorDetailsColumn?: 'error_details';
  debugInfoColumn?: 'debug_info';
  extraColumns: Set<string>;
}

/**
 * Extraction Job Service
 *
 * Phase 1: Basic job tracking and lifecycle management
 * Phase 2: Integration with Bull queue for async workers
 * Phase 3: Advanced features (retry logic, job dependencies, scheduling)
 */
@Injectable()
export class ExtractionJobService {
  private readonly logger = new Logger(ExtractionJobService.name);
  private schemaInfo: ExtractionJobSchemaInfo | null = null;
  private schemaInfoPromise: Promise<ExtractionJobSchemaInfo> | null = null;

  constructor(
    @InjectRepository(ObjectExtractionJob)
    private readonly extractionJobRepository: Repository<ObjectExtractionJob>,
    private readonly dataSource: DataSource,
    private readonly db: DatabaseService,
    private readonly config: AppConfigService,
    @Optional()
    @Inject(EventsService)
    private readonly eventsService?: EventsService
  ) {}

  /**
   * Derive organization ID from project ID
   * Used for tenant context - organization_id is no longer required as a parameter
   */
  private async getOrganizationIdFromProject(
    projectId: string
  ): Promise<string | null> {
    const orgResult = await this.db.query<{ organization_id: string }>(
      'SELECT organization_id FROM kb.projects WHERE id = $1',
      [projectId]
    );

    if (!orgResult.rows[0]) {
      throw new BadRequestException(`Project ${projectId} not found`);
    }

    return orgResult.rows[0].organization_id ?? null;
  }

  private async getSchemaInfo(): Promise<ExtractionJobSchemaInfo> {
    if (this.schemaInfo) {
      return this.schemaInfo;
    }

    if (!this.schemaInfoPromise) {
      this.schemaInfoPromise = (async () => {
        // Check if database is online before attempting schema detection
        if (!this.db.isOnline()) {
          this.logger.warn(
            'Database is offline during schema detection - waiting for initialization'
          );
          // Wait a bit and retry (database might still be initializing)
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (!this.db.isOnline()) {
            throw new Error(
              'Database offline - cannot detect schema. Check database initialization logs.'
            );
          }
        }

        const result = await this.db.query<{
          column_name: string;
          data_type: string;
        }>(
          `SELECT column_name, data_type
                     FROM information_schema.columns
                     WHERE table_schema = 'kb' AND table_name = 'object_extraction_jobs'`
        );

        const columns = new Map<string, string>();
        for (const row of result.rows) {
          columns.set(row.column_name, row.data_type);
        }

        // Debug logging
        if (columns.size === 0) {
          this.logger.error(
            'Schema detection returned 0 columns from information_schema.columns'
          );
          this.logger.error(`Query result: ${JSON.stringify(result)}`);
          this.logger.error(`Database online status: ${this.db.isOnline()}`);
          throw new Error(
            'Failed to detect object_extraction_jobs schema - no columns returned from information_schema'
          );
        }

        this.logger.debug(
          `Detected ${
            columns.size
          } columns in object_extraction_jobs: ${Array.from(
            columns.keys()
          ).join(', ')}`
        );

        // organization_id column is optional (removed in migration)
        const orgColumn = columns.has('organization_id')
          ? ('organization_id' as const)
          : undefined;

        if (!columns.has('project_id')) {
          throw new Error('object_extraction_jobs missing project_id column');
        }

        const createdObjectsColumn = columns.has('created_objects')
          ? 'created_objects'
          : columns.has('objects_created')
          ? 'objects_created'
          : undefined;

        const schema: ExtractionJobSchemaInfo = {
          orgColumn,
          projectColumn: 'project_id',
          subjectColumn: columns.has('subject_id')
            ? 'subject_id'
            : columns.has('created_by')
            ? 'created_by'
            : undefined,
          totalItemsColumn: columns.has('total_items')
            ? 'total_items'
            : undefined,
          processedItemsColumn: columns.has('processed_items')
            ? 'processed_items'
            : undefined,
          successfulItemsColumn: columns.has('successful_items')
            ? 'successful_items'
            : undefined,
          failedItemsColumn: columns.has('failed_items')
            ? 'failed_items'
            : undefined,
          discoveredTypesColumn: columns.has('discovered_types')
            ? 'discovered_types'
            : undefined,
          createdObjectsColumn,
          createdObjectsIsArray: createdObjectsColumn === 'created_objects',
          errorDetailsColumn: columns.has('error_details')
            ? 'error_details'
            : undefined,
          debugInfoColumn: columns.has('debug_info') ? 'debug_info' : undefined,
          extraColumns: new Set(columns.keys()),
        };

        this.schemaInfo = schema;
        return schema;
      })().finally(() => {
        this.schemaInfoPromise = null;
      });
    }

    return this.schemaInfoPromise;
  }

  /**
   * Create a new extraction job
   *
   * Phase 1: Creates job record with 'queued' status
   * Phase 2: Will enqueue job to Bull queue for processing
   */
  async createJob(dto: CreateExtractionJobDto): Promise<ExtractionJobDto> {
    const schema = await this.getSchemaInfo();
    const projectId = dto.project_id ?? null;

    if (!projectId) {
      throw new BadRequestException(
        'project_id is required to create an extraction job'
      );
    }

    // Derive organization_id from project for tenant context
    // In Phase 6, extraction jobs are project-scoped, so organization_id is only needed for setTenantContext
    const organizationId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(organizationId, projectId);
    this.logger.log(
      `Creating extraction job for project ${projectId}, source: ${dto.source_type}`
    );

    const columns: string[] = [
      schema.projectColumn,
      'source_type',
      'status',
      'extraction_config',
      'source_metadata',
      'source_id',
    ];
    const values: any[] = [
      projectId,
      dto.source_type,
      ExtractionJobStatus.QUEUED,
      JSON.stringify(dto.extraction_config ?? {}),
      JSON.stringify(dto.source_metadata ?? {}),
      dto.source_id ?? null,
    ];

    // organization_id column is optional (removed in migration)
    if (schema.orgColumn) {
      columns.unshift(schema.orgColumn);
      values.unshift(organizationId);
    }

    if (schema.subjectColumn) {
      columns.push(schema.subjectColumn);
      values.push(dto.subject_id ?? null);
    }

    const placeholders = columns.map((_, index) => `$${index + 1}`);

    const result = await this.db.query<ExtractionJobDto>(
      `INSERT INTO kb.object_extraction_jobs (${columns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING *`,
      values
    );

    if (!result.rowCount) {
      throw new BadRequestException('Failed to create extraction job');
    }

    const job = this.mapRowToDto(result.rows[0], schema);
    this.logger.log(
      `Created extraction job ${job.id} with status ${job.status}`
    );

    return job;
  }

  /**
   * Get extraction job by ID
   */
  async getJobById(
    jobId: string,
    projectId: string
  ): Promise<ExtractionJobDto> {
    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const result = await this.db.query<ExtractionJobDto>(
      `SELECT * FROM kb.object_extraction_jobs 
             WHERE id = $1 AND ${schema.projectColumn} = $2`,
      [jobId, projectId]
    );

    if (!result.rowCount) {
      throw new NotFoundException(`Extraction job ${jobId} not found`);
    }

    return this.mapRowToDto(result.rows[0], schema);
  }

  /**
   * List extraction jobs with filters and pagination
   */
  async listJobs(
    projectId: string,
    query: ListExtractionJobsDto
  ): Promise<ExtractionJobListDto> {
    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const { status, source_type, source_id, page = 1, limit = 20 } = query;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`${schema.projectColumn} = $1`];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (source_type) {
      conditions.push(`source_type = $${paramIndex++}`);
      params.push(source_type);
    }

    if (source_id) {
      conditions.push(`source_id = $${paramIndex++}`);
      params.push(source_id);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM kb.object_extraction_jobs WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const dataResult = await this.db.query<ExtractionJobDto>(
      `SELECT * FROM kb.object_extraction_jobs 
             WHERE ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const jobs = dataResult.rows.map((row) => this.mapRowToDto(row, schema));
    const total_pages = Math.ceil(total / limit);

    return {
      jobs,
      total,
      page,
      limit,
      total_pages,
    };
  }

  /**
   * Update extraction job
   *
   * Used to update job status, progress, results, and errors
   */
  async updateJob(
    jobId: string,
    projectId: string,
    dto: UpdateExtractionJobDto
  ): Promise<ExtractionJobDto> {
    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const pushUpdate = (column: string, value: any) => {
      updates.push(`${column} = $${paramIndex}`);
      params.push(value);
      paramIndex += 1;
    };

    if (dto.status !== undefined) {
      pushUpdate('status', dto.status);

      // Auto-set started_at when transitioning to running
      if (dto.status === ExtractionJobStatus.RUNNING) {
        updates.push('started_at = COALESCE(started_at, NOW())');
      }

      // Auto-set completed_at when transitioning to completed/failed/cancelled
      if (
        [
          ExtractionJobStatus.COMPLETED,
          ExtractionJobStatus.FAILED,
          ExtractionJobStatus.CANCELLED,
        ].includes(dto.status as ExtractionJobStatus)
      ) {
        updates.push('completed_at = NOW()');
      }
    }

    if (schema.totalItemsColumn && dto.total_items !== undefined) {
      pushUpdate(schema.totalItemsColumn, dto.total_items);
    }

    if (schema.processedItemsColumn && dto.processed_items !== undefined) {
      pushUpdate(schema.processedItemsColumn, dto.processed_items);
    }

    if (schema.successfulItemsColumn && dto.successful_items !== undefined) {
      pushUpdate(schema.successfulItemsColumn, dto.successful_items);
    }

    if (schema.failedItemsColumn && dto.failed_items !== undefined) {
      pushUpdate(schema.failedItemsColumn, dto.failed_items);
    }

    if (schema.discoveredTypesColumn && dto.discovered_types !== undefined) {
      // For JSONB columns, must stringify arrays explicitly - pg driver uses PostgreSQL array syntax otherwise
      pushUpdate(
        schema.discoveredTypesColumn,
        dto.discovered_types ? JSON.stringify(dto.discovered_types) : null
      );
    }

    if (schema.createdObjectsColumn && dto.created_objects !== undefined) {
      if (schema.createdObjectsIsArray) {
        // For JSONB columns, must stringify arrays explicitly - pg driver uses PostgreSQL array syntax otherwise
        pushUpdate(
          schema.createdObjectsColumn,
          dto.created_objects ? JSON.stringify(dto.created_objects) : null
        );
      } else {
        const count = Array.isArray(dto.created_objects)
          ? dto.created_objects.length
          : Number(dto.created_objects) || 0;
        pushUpdate(schema.createdObjectsColumn, count);
      }
    }

    if (dto.error_message !== undefined) {
      pushUpdate('error_message', dto.error_message);
    }

    const errorDetailsColumn = schema.errorDetailsColumn ?? 'error_details';
    if (
      dto.error_details !== undefined &&
      schema.extraColumns.has(errorDetailsColumn)
    ) {
      pushUpdate(
        errorDetailsColumn,
        dto.error_details ? JSON.stringify(dto.error_details) : null
      );
    }

    const debugInfoColumn = schema.debugInfoColumn ?? 'debug_info';
    if (
      dto.debug_info !== undefined &&
      schema.extraColumns.has(debugInfoColumn)
    ) {
      pushUpdate(
        debugInfoColumn,
        dto.debug_info ? JSON.stringify(dto.debug_info) : null
      );
    }

    if (updates.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    updates.push('updated_at = NOW()');

    const whereJobIndex = paramIndex;
    const whereProjectIndex = paramIndex + 1;

    const sql = `UPDATE kb.object_extraction_jobs 
             SET ${updates.join(', ')}
             WHERE id = $${whereJobIndex}
               AND ${schema.projectColumn} = $${whereProjectIndex}
             RETURNING *`;
    const allParams = [...params, jobId, projectId];

    // Debug: Log the full SQL and parameters
    this.logger.debug(`Update SQL: ${sql}`);
    this.logger.debug(`Update params: ${JSON.stringify(allParams)}`);

    const result = await this.db.query<ExtractionJobDto>(sql, allParams);

    if (!result.rowCount) {
      throw new NotFoundException(`Extraction job ${jobId} not found`);
    }

    const job = this.mapRowToDto(result.rows[0], schema);
    this.logger.log(`Updated extraction job ${jobId}, status: ${job.status}`);

    return job;
  }

  /**
   * Dequeue pending jobs for processing (used by worker)
   *
   * Uses FOR UPDATE SKIP LOCKED for safe concurrent access
   *
   * Unlike most service methods, this runs at the system level (no tenant context)
   * to find pending jobs across all tenants. Each job is then updated with its
   * own tenant context using runWithTenantContext().
   *
   * @param batchSize - Number of jobs to claim
   * @returns Array of claimed jobs
   */
  async dequeueJobs(batchSize: number = 1): Promise<ExtractionJobDto[]> {
    this.logger.debug(
      `[DEQUEUE] Attempting to dequeue ${batchSize} queued jobs`
    );

    const schema = await this.getSchemaInfo();

    // Step 1: Find queued jobs across all tenants (no tenant context needed for read)
    // Clear any existing tenant context so RLS allows system-level SELECT
    await this.db.setTenantContext(null, null);

    // Phase 6: organization_id removed from object_extraction_jobs table
    // We now derive organization_id from project_id via projects table join
    //
    // Job queuing logic:
    // - By default, only one job can run per project at a time
    // - Projects with allow_parallel_extraction=true can have multiple running jobs
    // - We use a subquery to filter out projects that already have a running job
    //   (unless that project allows parallel extraction)
    const candidatesResult = await this.db.query<{
      id: string;
      project_id: string | null;
    }>(
      `SELECT j.id, j.project_id
             FROM kb.object_extraction_jobs j
             LEFT JOIN kb.projects p ON j.project_id = p.id
             WHERE j.status = $1
               AND (
                 -- Allow if project has parallel extraction enabled
                 p.allow_parallel_extraction = true
                 OR
                 -- Or if project has no running jobs
                 NOT EXISTS (
                   SELECT 1 FROM kb.object_extraction_jobs running
                   WHERE running.project_id = j.project_id
                     AND running.status = 'running'
                 )
               )
             ORDER BY j.created_at ASC
             LIMIT $2
             FOR UPDATE OF j SKIP LOCKED`,
      [ExtractionJobStatus.QUEUED, batchSize]
    );

    if (!candidatesResult.rowCount || candidatesResult.rowCount === 0) {
      this.logger.debug(
        `[DEQUEUE] Found 0 jobs (rowCount=${candidatesResult.rowCount})`
      );
      return [];
    }

    // Step 2: Claim each job by updating it within its tenant context
    const claimedJobs: ExtractionJobDto[] = [];
    for (const candidate of candidatesResult.rows) {
      const projectId = candidate.project_id ?? null;

      // Derive organization_id from project for tenant context
      let orgId: string | null = null;
      if (projectId) {
        const orgResult = await this.db.query<{ organization_id: string }>(
          'SELECT organization_id FROM kb.projects WHERE id = $1',
          [projectId]
        );
        orgId = orgResult.rows[0]?.organization_id ?? null;
      }

      if (!orgId || !projectId) {
        this.logger.warn(
          `Skipping job ${candidate.id} - missing tenant context (org=${orgId}, project=${projectId})`
        );
        continue;
      }

      try {
        // Update job status within its tenant context (RLS enforced)
        const updateResult = await this.db.runWithTenantContext(
          projectId,
          async () =>
            this.db.query<ExtractionJobDto>(
              `UPDATE kb.object_extraction_jobs
                         SET status = $1, 
                             started_at = NOW(),
                             updated_at = NOW()
                         WHERE id = $2
                           AND status = $3
                         RETURNING *`,
              [
                ExtractionJobStatus.RUNNING,
                candidate.id,
                ExtractionJobStatus.QUEUED,
              ]
            )
        );

        if (updateResult.rowCount && updateResult.rowCount > 0) {
          const job = this.mapRowToDto(updateResult.rows[0], schema);
          claimedJobs.push(job);
        } else {
          this.logger.warn(
            `Failed to claim job ${candidate.id} - may have been claimed by another worker`
          );
        }
      } catch (error) {
        this.logger.error(`Error claiming job ${candidate.id}`, error);
        // Continue to next job
      }
    }

    if (claimedJobs.length > 0) {
      this.logger.log(
        `[DEQUEUE] Claimed ${claimedJobs.length} jobs: ${claimedJobs
          .map((j) => j.id)
          .join(', ')}`
      );
    } else {
      this.logger.debug('[DEQUEUE] Claimed 0 jobs');
    }

    return claimedJobs;
  }

  /**
   * Mark job as running (idempotent)
   */
  async markRunning(jobId: string): Promise<void> {
    const result = await this.db.query<{ id: string; project_id: string }>(
      `UPDATE kb.object_extraction_jobs
             SET status = $1,
                 started_at = COALESCE(started_at, NOW()),
                 updated_at = NOW()
             WHERE id = $2
             RETURNING id, project_id`,
      [ExtractionJobStatus.RUNNING, jobId]
    );

    // Emit real-time event for extraction job started
    if (this.eventsService && result.rows[0]?.project_id) {
      this.eventsService.emitUpdated(
        'extraction_job',
        jobId,
        result.rows[0].project_id,
        {
          status: 'running',
        }
      );
    }

    this.logger.debug(`Marked job ${jobId} as running`);
  }

  /**
   * Mark job as completed
   */
  async markCompleted(
    jobId: string,
    results: {
      created_objects?: string[];
      discovered_types?: string[];
      successful_items?: number;
      total_items?: number;
      rejected_items?: number;
      review_required_count?: number;
      debug_info?: Record<string, any>;
    },
    finalStatus: 'completed' | 'requires_review' = 'completed'
  ): Promise<void> {
    const schema = await this.getSchemaInfo();
    const status =
      finalStatus === 'requires_review'
        ? ExtractionJobStatus.REQUIRES_REVIEW
        : ExtractionJobStatus.COMPLETED;

    const assignments: string[] = [
      'status = $1',
      'completed_at = NOW()',
      'updated_at = NOW()',
    ];
    const params: any[] = [status];
    let idx = 2;

    if (schema.createdObjectsColumn) {
      const value = schema.createdObjectsIsArray
        ? results.created_objects
          ? JSON.stringify(results.created_objects)
          : null
        : results.created_objects
        ? results.created_objects.length
        : null;
      assignments.push(
        `${schema.createdObjectsColumn} = COALESCE($${idx}, ${schema.createdObjectsColumn})`
      );
      params.push(value);
      idx += 1;
    }

    if (schema.discoveredTypesColumn) {
      assignments.push(
        `${schema.discoveredTypesColumn} = COALESCE($${idx}, ${schema.discoveredTypesColumn})`
      );
      params.push(
        results.discovered_types
          ? JSON.stringify(results.discovered_types)
          : null
      );
      idx += 1;
    }

    if (schema.successfulItemsColumn) {
      assignments.push(
        `${schema.successfulItemsColumn} = COALESCE($${idx}, ${schema.successfulItemsColumn})`
      );
      params.push(results.successful_items ?? null);
      idx += 1;
    }

    if (schema.totalItemsColumn) {
      assignments.push(
        `${schema.totalItemsColumn} = COALESCE($${idx}, ${schema.totalItemsColumn})`
      );
      params.push(results.total_items ?? null);
      idx += 1;
    }

    if (schema.processedItemsColumn) {
      assignments.push(
        `${schema.processedItemsColumn} = COALESCE($${idx}, ${schema.processedItemsColumn})`
      );
      params.push(results.total_items ?? null);
      idx += 1;
    }

    const debugInfoColumn = schema.debugInfoColumn ?? 'debug_info';
    if (schema.extraColumns.has(debugInfoColumn)) {
      assignments.push(
        `${debugInfoColumn} = COALESCE($${idx}, ${debugInfoColumn})`
      );
      params.push(
        results.debug_info ? JSON.stringify(results.debug_info) : null
      );
      idx += 1;
    }

    params.push(jobId);

    const result = await this.db.query<{ id: string; project_id: string }>(
      `UPDATE kb.object_extraction_jobs
             SET ${assignments.join(', ')}
             WHERE id = $${idx}
             RETURNING id, project_id`,
      params
    );

    // Emit real-time event for extraction job completion
    if (this.eventsService && result.rows[0]?.project_id) {
      this.eventsService.emitUpdated(
        'extraction_job',
        jobId,
        result.rows[0].project_id,
        {
          status:
            finalStatus === 'requires_review' ? 'requires_review' : 'completed',
          successfulItems: results.successful_items,
          totalItems: results.total_items,
          createdObjectsCount: results.created_objects?.length ?? 0,
        }
      );
    }

    if (finalStatus === 'requires_review') {
      this.logger.log(
        `Marked job ${jobId} as requires_review: ` +
          `${results.review_required_count || 0} objects need review, ` +
          `${results.rejected_items || 0} rejected`
      );
    } else {
      this.logger.log(
        `Marked job ${jobId} as completed: ` +
          `${results.successful_items}/${results.total_items} items` +
          `${
            results.rejected_items ? `, ${results.rejected_items} rejected` : ''
          }`
      );
    }
  }

  /**
   * Mark job as failed
   *
   * Note: Without retry_count column, all failures are permanent
   * TODO: Add retry_count and next_retry_at columns for retry logic
   */
  async markFailed(
    jobId: string,
    errorMessage: string,
    errorDetails?: any,
    debugInfo?: Record<string, any>
  ): Promise<void> {
    const schema = await this.getSchemaInfo();
    const errorDetailsColumn = schema.errorDetailsColumn ?? 'error_details';
    const debugInfoColumn = schema.debugInfoColumn ?? 'debug_info';

    const assignments: string[] = [
      'status = $1',
      'completed_at = NOW()',
      'error_message = $2',
      'updated_at = NOW()',
    ];
    const params: any[] = [ExtractionJobStatus.FAILED, errorMessage];
    let idx = 3;

    if (schema.extraColumns.has(errorDetailsColumn)) {
      assignments.push(`${errorDetailsColumn} = $${idx}`);
      params.push(JSON.stringify(errorDetails || {}));
      idx += 1;
    }

    if (debugInfo !== undefined && schema.extraColumns.has(debugInfoColumn)) {
      assignments.push(`${debugInfoColumn} = $${idx}`);
      params.push(debugInfo ? JSON.stringify(debugInfo) : null);
      idx += 1;
    }

    params.push(jobId);

    const result = await this.db.query<{ id: string; project_id: string }>(
      `UPDATE kb.object_extraction_jobs
             SET ${assignments.join(', ')}
             WHERE id = $${idx}
             RETURNING id, project_id`,
      params
    );

    // Emit real-time event for extraction job failure
    if (this.eventsService && result.rows[0]?.project_id) {
      this.eventsService.emitUpdated(
        'extraction_job',
        jobId,
        result.rows[0].project_id,
        {
          status: 'failed',
          errorMessage,
        }
      );
    }

    this.logger.error(`Job ${jobId} marked as failed: ${errorMessage}`);
  }

  /**
   * Update job progress (for long-running extractions)
   */
  async updateProgress(
    jobId: string,
    processed: number,
    total: number
  ): Promise<void> {
    const schema = await this.getSchemaInfo();
    const assignments: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (schema.processedItemsColumn) {
      assignments.push(`${schema.processedItemsColumn} = $${idx}`);
      params.push(processed);
      idx += 1;
    }

    if (schema.totalItemsColumn) {
      assignments.push(`${schema.totalItemsColumn} = $${idx}`);
      params.push(total);
      idx += 1;
    }

    assignments.push('updated_at = NOW()');

    const result = await this.db.query<{ id: string; project_id: string }>(
      `UPDATE kb.object_extraction_jobs
             SET ${assignments.join(', ')}
             WHERE id = $${idx}
             RETURNING id, project_id`,
      [...params, jobId]
    );

    // Emit real-time event for extraction job progress
    if (this.eventsService && result.rows[0]?.project_id) {
      this.eventsService.emitUpdated(
        'extraction_job',
        jobId,
        result.rows[0].project_id,
        {
          status: 'running',
          processedItems: processed,
          totalItems: total,
        }
      );
    }
  }

  /**
   * Retry/recover a stuck job
   *
   * Resets a stuck 'running' job back to 'queued' so it can be retried.
   * Useful for manual recovery when server restarts leave jobs orphaned.
   */
  async retryJob(jobId: string, projectId: string): Promise<ExtractionJobDto> {
    const job = await this.getJobById(jobId, projectId);

    // Can only retry running or failed jobs
    if (
      job.status !== ExtractionJobStatus.RUNNING &&
      job.status !== ExtractionJobStatus.FAILED
    ) {
      throw new BadRequestException(
        `Cannot retry job with status: ${job.status}. Only 'running' or 'failed' jobs can be retried.`
      );
    }

    this.logger.log(`Retrying extraction job ${jobId} (was ${job.status})`);

    return this.updateJob(jobId, projectId, {
      status: ExtractionJobStatus.QUEUED,
      error_message: job.error_message
        ? `${job.error_message}\n\nJob was manually retried.`
        : 'Job was manually retried.',
    });
  }

  /**
   * Cancel an extraction job
   *
   * Phase 1: Updates status to 'cancelled'
   * Phase 2: Will also remove job from Bull queue if still pending
   */
  async cancelJob(jobId: string, projectId: string): Promise<ExtractionJobDto> {
    const job = await this.getJobById(jobId, projectId);

    // Can only cancel pending or running jobs
    if (
      job.status === ExtractionJobStatus.COMPLETED ||
      job.status === ExtractionJobStatus.FAILED ||
      job.status === ExtractionJobStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel job with status: ${job.status}`
      );
    }

    this.logger.log(`Cancelling extraction job ${jobId}`);

    // Phase 2: Remove from Bull queue here
    // await this.queueService.removeJob(jobId);

    return this.updateJob(jobId, projectId, {
      status: ExtractionJobStatus.CANCELLED,
    });
  }

  /**
   * Delete an extraction job
   *
   * Note: Should only delete completed/failed/cancelled jobs
   */
  async deleteJob(jobId: string, projectId: string): Promise<void> {
    const job = await this.getJobById(jobId, projectId);

    // Prevent deletion of running jobs
    if (
      job.status === ExtractionJobStatus.RUNNING ||
      job.status === ExtractionJobStatus.QUEUED
    ) {
      throw new BadRequestException(
        `Cannot delete job with status: ${job.status}. Cancel it first.`
      );
    }

    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const result = await this.db.query(
      `DELETE FROM kb.object_extraction_jobs 
             WHERE id = $1 AND ${schema.projectColumn} = $2`,
      [jobId, projectId]
    );

    if (!result.rowCount) {
      throw new NotFoundException(`Extraction job ${jobId} not found`);
    }

    this.logger.log(`Deleted extraction job ${jobId}`);
  }

  /**
   * Bulk cancel all pending/running jobs for a project
   */
  async bulkCancelJobs(projectId: string): Promise<number> {
    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const result = await this.db.query(
      `UPDATE kb.object_extraction_jobs 
             SET status = $1, updated_at = NOW()
             WHERE ${schema.projectColumn} = $2 
               AND status IN ($3, $4)`,
      [
        ExtractionJobStatus.CANCELLED,
        projectId,
        ExtractionJobStatus.QUEUED,
        ExtractionJobStatus.RUNNING,
      ]
    );

    const cancelled = result.rowCount || 0;
    this.logger.log(
      `Bulk cancelled ${cancelled} jobs for project ${projectId}`
    );
    return cancelled;
  }

  /**
   * Bulk delete all completed/failed/cancelled jobs for a project
   */
  async bulkDeleteJobs(projectId: string): Promise<number> {
    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const result = await this.db.query(
      `DELETE FROM kb.object_extraction_jobs 
             WHERE ${schema.projectColumn} = $1 
               AND status IN ($2, $3, $4)`,
      [
        projectId,
        ExtractionJobStatus.COMPLETED,
        ExtractionJobStatus.FAILED,
        ExtractionJobStatus.CANCELLED,
      ]
    );

    const deleted = result.rowCount || 0;
    this.logger.log(`Bulk deleted ${deleted} jobs for project ${projectId}`);
    return deleted;
  }

  /**
   * Bulk retry all failed jobs for a project
   */
  async bulkRetryJobs(projectId: string): Promise<number> {
    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const result = await this.db.query(
      `UPDATE kb.object_extraction_jobs 
             SET status = $1, 
                 error_message = NULL,
                 error_details = NULL,
                 updated_at = NOW()
             WHERE ${schema.projectColumn} = $2 
               AND status = $3`,
      [ExtractionJobStatus.QUEUED, projectId, ExtractionJobStatus.FAILED]
    );

    const retried = result.rowCount || 0;
    this.logger.log(
      `Bulk retried ${retried} failed jobs for project ${projectId}`
    );
    return retried;
  }

  /**
   * Get job statistics for a project
   */
  async getJobStatistics(projectId: string): Promise<{
    total: number;
    by_status: Record<ExtractionJobStatus, number>;
    by_source_type: Record<string, number>;
    avg_duration_ms: number | null;
    total_objects_created: number;
    total_types_discovered: number;
  }> {
    const schema = await this.getSchemaInfo();
    const orgId = await this.getOrganizationIdFromProject(projectId);
    await this.db.setTenantContext(orgId, projectId);

    const totalObjectsExpression = schema.createdObjectsColumn
      ? schema.createdObjectsIsArray
        ? `SUM(COALESCE(jsonb_array_length(${schema.createdObjectsColumn}), 0))`
        : `SUM(COALESCE(${schema.createdObjectsColumn}, 0))`
      : '0';

    const result = await this.db.query<{
      status: ExtractionJobStatus;
      source_type: string;
      count: string;
      avg_duration_ms: string | null;
      total_objects: string;
    }>(
      `SELECT 
                status,
                source_type,
                COUNT(*) as count,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::INTEGER as avg_duration_ms,
                ${totalObjectsExpression} as total_objects
             FROM kb.object_extraction_jobs
             WHERE ${schema.projectColumn} = $1
             GROUP BY status, source_type`,
      [projectId]
    );
    let total = 0;
    const by_status: Record<string, number> = {};
    const by_source_type: Record<string, number> = {};
    let total_duration = 0;
    let completed_jobs = 0;
    let total_objects_created = 0;
    const discovered_types_set = new Set<string>();

    for (const row of result.rows) {
      const count = parseInt(row.count, 10);
      total += count;

      by_status[row.status] = (by_status[row.status] || 0) + count;
      by_source_type[row.source_type] =
        (by_source_type[row.source_type] || 0) + count;

      if (row.avg_duration_ms) {
        total_duration += parseFloat(row.avg_duration_ms) * count;
        completed_jobs += count;
      }

      total_objects_created += parseInt(row.total_objects || '0', 10);
    }

    // Get unique discovered types separately
    let total_types_discovered = 0;
    if (schema.discoveredTypesColumn) {
      const typesResult = await this.db.query<{ type_name: string }>(
        `SELECT DISTINCT jsonb_array_elements_text(${schema.discoveredTypesColumn}) as type_name
                 FROM kb.object_extraction_jobs
                 WHERE ${schema.projectColumn} = $1 AND jsonb_array_length(${schema.discoveredTypesColumn}) > 0`,
        [projectId]
      );
      total_types_discovered = typesResult.rowCount || 0;
    }

    return {
      total,
      by_status: by_status as Record<ExtractionJobStatus, number>,
      by_source_type,
      avg_duration_ms:
        completed_jobs > 0 ? Math.round(total_duration / completed_jobs) : null,
      total_objects_created,
      total_types_discovered,
    };
  }

  /**
   * Map database row to DTO
   */
  private mapRowToDto(
    row: any,
    schema?: ExtractionJobSchemaInfo
  ): ExtractionJobDto {
    const info = schema ?? this.schemaInfo;
    if (!info) {
      throw new Error('Extraction job schema info not initialized');
    }

    const totalItems = info.totalItemsColumn
      ? Number(row[info.totalItemsColumn] ?? 0)
      : 0;
    const processedItems = info.processedItemsColumn
      ? Number(row[info.processedItemsColumn] ?? 0)
      : 0;
    const successfulItems = info.successfulItemsColumn
      ? Number(row[info.successfulItemsColumn] ?? 0)
      : 0;
    const failedItems = info.failedItemsColumn
      ? Number(row[info.failedItemsColumn] ?? 0)
      : 0;
    let discoveredTypes: string[] = [];
    if (info.discoveredTypesColumn) {
      const value = row[info.discoveredTypesColumn];
      // pg driver automatically parses JSONB as objects/arrays
      if (Array.isArray(value)) {
        discoveredTypes = value;
      } else if (typeof value === 'string') {
        // Fallback for string representation
        try {
          discoveredTypes = JSON.parse(value);
        } catch {
          discoveredTypes = [];
        }
      } else {
        discoveredTypes = [];
      }
    } else if (Array.isArray(row.discovered_types)) {
      discoveredTypes = row.discovered_types;
    }

    let createdObjects: string[] = [];
    if (info.createdObjectsColumn) {
      if (info.createdObjectsIsArray) {
        const value = row[info.createdObjectsColumn];
        this.logger.debug(
          `Reading created_objects from column '${
            info.createdObjectsColumn
          }': type=${typeof value}, value=${JSON.stringify(value)}`
        );
        if (typeof value === 'string') {
          try {
            createdObjects = JSON.parse(value);
          } catch {
            createdObjects = [];
          }
        } else if (Array.isArray(value)) {
          createdObjects = value;
        }
      } else {
        const count = Number(row[info.createdObjectsColumn] ?? 0);
        createdObjects =
          count > 0 ? Array.from({ length: count }, () => '') : [];
      }
    } else if (Array.isArray(row.created_objects)) {
      createdObjects = row.created_objects;
    }

    const subjectIdColumn = info.subjectColumn ?? 'subject_id';

    return {
      id: row.id,
      project_id: row.project_id,
      source_type: row.source_type,
      source_id: row.source_id ?? undefined,
      source_metadata: row.source_metadata || {},
      extraction_config: row.extraction_config || {},
      status: row.status,
      total_items: totalItems,
      processed_items: processedItems,
      successful_items: successfulItems,
      failed_items: failedItems,
      discovered_types: discoveredTypes,
      created_objects: createdObjects,
      error_message: row.error_message ?? undefined,
      error_details:
        (info.errorDetailsColumn
          ? row[info.errorDetailsColumn]
          : row.error_details) || undefined,
      debug_info:
        (info.debugInfoColumn ? row[info.debugInfoColumn] : row.debug_info) ||
        undefined,
      started_at: row.started_at ?? undefined,
      completed_at: row.completed_at ?? undefined,
      created_at: row.created_at,
      subject_id: row[subjectIdColumn] ?? undefined,
      updated_at: row.updated_at,
    };
  }

  /**
     * List available Gemini models from Google API
    /**
     * Lists available Vertex AI models.
     * Note: This is a simplified version as Vertex AI model listing requires more complex setup.
     * For production, use the Vertex AI Model Garden API.
     */
  async listAvailableGeminiModels(): Promise<any> {
    const projectId = this.config.vertexAiProjectId;

    if (!projectId) {
      throw new BadRequestException(
        'Vertex AI project not configured (GCP_PROJECT_ID missing)'
      );
    }

    try {
      // Return hardcoded list of common Vertex AI models
      // For a complete list, use the Vertex AI Model Garden API with proper authentication
      const models = [
        {
          name: 'models/gemini-1.5-pro-latest',
          displayName: 'Gemini 1.5 Pro',
          description: 'Most capable model for complex reasoning tasks',
          supportedGenerationMethods: ['generateContent'],
          inputTokenLimit: 1000000,
          outputTokenLimit: 8192,
        },
        {
          name: 'models/gemini-1.5-flash-latest',
          displayName: 'Gemini 1.5 Flash',
          description: 'Fast and versatile performance across diverse tasks',
          supportedGenerationMethods: ['generateContent'],
          inputTokenLimit: 1000000,
          outputTokenLimit: 8192,
        },
        {
          name: 'models/gemini-1.5-flash-8b',
          displayName: 'Gemini 1.5 Flash-8B',
          description: 'Fastest model for high-frequency tasks',
          supportedGenerationMethods: ['generateContent'],
          inputTokenLimit: 1000000,
          outputTokenLimit: 8192,
        },
      ];

      this.logger.log(`Returning ${models.length} Vertex AI models`);

      const modelNames = models.map((m: any) => m.name.replace('models/', ''));

      return {
        current_model: this.config.vertexAiModel || 'gemini-1.5-flash-latest',
        available_models: models,
        model_names: modelNames,
        total_count: models.length,
        queried_at: new Date().toISOString(),
        note: 'Using Vertex AI. For complete model list, use Vertex AI Model Garden API.',
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to list Gemini models:', errorMessage);
      throw new BadRequestException(`Failed to fetch models: ${errorMessage}`);
    }
  }

  /**
   * Get current retry count for a job
   * MIGRATED: Session 20 - TypeORM Repository method
   */
  async getRetryCount(jobId: string): Promise<number> {
    try {
      const job = await this.extractionJobRepository.findOne({
        where: { id: jobId },
        select: ['retryCount'],
      });

      return job?.retryCount || 0;
    } catch (error) {
      this.logger.warn(`Failed to get retry count for job ${jobId}`, error);
      return 0;
    }
  }
}
