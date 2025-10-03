import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
    CreateExtractionJobDto,
    UpdateExtractionJobDto,
    ExtractionJobDto,
    ListExtractionJobsDto,
    ExtractionJobListDto,
    ExtractionJobStatus,
} from './dto/extraction-job.dto';

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

    constructor(private readonly db: DatabaseService) {}

    /**
     * Create a new extraction job
     * 
     * Phase 1: Creates job record with 'pending' status
     * Phase 2: Will enqueue job to Bull queue for processing
     */
    async createJob(dto: CreateExtractionJobDto): Promise<ExtractionJobDto> {
        this.logger.log(`Creating extraction job for project ${dto.project_id}, source: ${dto.source_type}`);

        const result = await this.db.query<ExtractionJobDto>(
            `INSERT INTO kb.object_extraction_jobs (
                org_id,
                project_id,
                source_type,
                source_id,
                source_metadata,
                extraction_config,
                created_by,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                dto.org_id,
                dto.project_id,
                dto.source_type,
                dto.source_id || null,
                JSON.stringify(dto.source_metadata || {}),
                JSON.stringify(dto.extraction_config),
                dto.created_by || null,
                ExtractionJobStatus.PENDING,
            ]
        );

        if (!result.rowCount) {
            throw new BadRequestException('Failed to create extraction job');
        }

        const job = this.mapRowToDto(result.rows[0]);
        this.logger.log(`Created extraction job ${job.id} with status ${job.status}`);

        // Phase 2: Enqueue job to Bull queue here
        // await this.queueService.enqueueExtractionJob(job.id);

        return job;
    }

    /**
     * Get extraction job by ID
     */
    async getJobById(jobId: string, projectId: string, orgId: string): Promise<ExtractionJobDto> {
        const result = await this.db.query<ExtractionJobDto>(
            `SELECT * FROM kb.object_extraction_jobs 
             WHERE id = $1 AND project_id = $2 AND org_id = $3`,
            [jobId, projectId, orgId]
        );

        if (!result.rowCount) {
            throw new NotFoundException(`Extraction job ${jobId} not found`);
        }

        return this.mapRowToDto(result.rows[0]);
    }

    /**
     * List extraction jobs with filters and pagination
     */
    async listJobs(
        projectId: string,
        orgId: string,
        query: ListExtractionJobsDto
    ): Promise<ExtractionJobListDto> {
        const { status, source_type, source_id, page = 1, limit = 20 } = query;
        const offset = (page - 1) * limit;

        // Build WHERE clause dynamically
        const conditions: string[] = ['project_id = $1', 'org_id = $2'];
        const params: any[] = [projectId, orgId];
        let paramIndex = 3;

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

        const jobs = dataResult.rows.map((row) => this.mapRowToDto(row));
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
        orgId: string,
        dto: UpdateExtractionJobDto
    ): Promise<ExtractionJobDto> {
        // Build UPDATE statement dynamically based on provided fields
        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (dto.status !== undefined) {
            updates.push(`status = $${paramIndex++}`);
            params.push(dto.status);
        }

        if (dto.total_items !== undefined) {
            updates.push(`total_items = $${paramIndex++}`);
            params.push(dto.total_items);
        }

        if (dto.processed_items !== undefined) {
            updates.push(`processed_items = $${paramIndex++}`);
            params.push(dto.processed_items);
        }

        if (dto.successful_items !== undefined) {
            updates.push(`successful_items = $${paramIndex++}`);
            params.push(dto.successful_items);
        }

        if (dto.failed_items !== undefined) {
            updates.push(`failed_items = $${paramIndex++}`);
            params.push(dto.failed_items);
        }

        if (dto.discovered_types !== undefined) {
            updates.push(`discovered_types = $${paramIndex++}`);
            params.push(dto.discovered_types);
        }

        if (dto.created_objects !== undefined) {
            updates.push(`created_objects = $${paramIndex++}`);
            params.push(dto.created_objects);
        }

        if (dto.error_message !== undefined) {
            updates.push(`error_message = $${paramIndex++}`);
            params.push(dto.error_message);
        }

        if (dto.error_details !== undefined) {
            updates.push(`error_details = $${paramIndex++}`);
            params.push(JSON.stringify(dto.error_details));
        }

        if (updates.length === 0) {
            throw new BadRequestException('No fields to update');
        }

        // Add WHERE clause parameters
        params.push(jobId, projectId, orgId);
        const whereParams = `$${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}`;

        const result = await this.db.query<ExtractionJobDto>(
            `UPDATE kb.object_extraction_jobs 
             SET ${updates.join(', ')}
             WHERE id = ${whereParams.split(',')[0]} 
               AND project_id = ${whereParams.split(',')[1]} 
               AND org_id = ${whereParams.split(',')[2]}
             RETURNING *`,
            params
        );

        if (!result.rowCount) {
            throw new NotFoundException(`Extraction job ${jobId} not found`);
        }

        const job = this.mapRowToDto(result.rows[0]);
        this.logger.log(`Updated extraction job ${jobId}, status: ${job.status}`);

        return job;
    }

    /**
     * Cancel an extraction job
     * 
     * Phase 1: Updates status to 'cancelled'
     * Phase 2: Will also remove job from Bull queue if still pending
     */
    async cancelJob(jobId: string, projectId: string, orgId: string): Promise<ExtractionJobDto> {
        const job = await this.getJobById(jobId, projectId, orgId);

        // Can only cancel pending or running jobs
        if (job.status === ExtractionJobStatus.COMPLETED || 
            job.status === ExtractionJobStatus.FAILED ||
            job.status === ExtractionJobStatus.CANCELLED) {
            throw new BadRequestException(`Cannot cancel job with status: ${job.status}`);
        }

        this.logger.log(`Cancelling extraction job ${jobId}`);

        // Phase 2: Remove from Bull queue here
        // await this.queueService.removeJob(jobId);

        return this.updateJob(jobId, projectId, orgId, {
            status: ExtractionJobStatus.CANCELLED,
        });
    }

    /**
     * Delete an extraction job
     * 
     * Note: Should only delete completed/failed/cancelled jobs
     */
    async deleteJob(jobId: string, projectId: string, orgId: string): Promise<void> {
        const job = await this.getJobById(jobId, projectId, orgId);

        // Prevent deletion of running jobs
        if (job.status === ExtractionJobStatus.RUNNING || job.status === ExtractionJobStatus.PENDING) {
            throw new BadRequestException(`Cannot delete job with status: ${job.status}. Cancel it first.`);
        }

        const result = await this.db.query(
            `DELETE FROM kb.object_extraction_jobs 
             WHERE id = $1 AND project_id = $2 AND org_id = $3`,
            [jobId, projectId, orgId]
        );

        if (!result.rowCount) {
            throw new NotFoundException(`Extraction job ${jobId} not found`);
        }

        this.logger.log(`Deleted extraction job ${jobId}`);
    }

    /**
     * Get job statistics for a project
     */
    async getJobStatistics(projectId: string, orgId: string): Promise<{
        total: number;
        by_status: Record<ExtractionJobStatus, number>;
        by_source_type: Record<string, number>;
        avg_duration_ms: number | null;
        total_objects_created: number;
        total_types_discovered: number;
    }> {
        const result = await this.db.query<{
            status: ExtractionJobStatus;
            source_type: string;
            count: string;
            avg_duration_ms: string | null;
            total_objects: string;
            unique_types: string;
        }>(
            `SELECT 
                status,
                source_type,
                COUNT(*) as count,
                AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::INTEGER as avg_duration_ms,
                SUM(COALESCE(array_length(created_objects, 1), 0)) as total_objects,
                0 as unique_types
             FROM kb.object_extraction_jobs
             WHERE project_id = $1 AND org_id = $2
             GROUP BY status, source_type`,
            [projectId, orgId]
        );        // Aggregate statistics
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
            by_source_type[row.source_type] = (by_source_type[row.source_type] || 0) + count;

            if (row.avg_duration_ms) {
                total_duration += parseFloat(row.avg_duration_ms) * count;
                completed_jobs += count;
            }

            total_objects_created += parseInt(row.total_objects || '0', 10);
        }

        // Get unique discovered types separately
        const typesResult = await this.db.query<{ type_name: string }>(
            `SELECT DISTINCT unnest(discovered_types) as type_name
             FROM kb.object_extraction_jobs
             WHERE project_id = $1 AND org_id = $2 AND array_length(discovered_types, 1) > 0`,
            [projectId, orgId]
        );

        return {
            total,
            by_status: by_status as Record<ExtractionJobStatus, number>,
            by_source_type,
            avg_duration_ms: completed_jobs > 0 ? Math.round(total_duration / completed_jobs) : null,
            total_objects_created,
            total_types_discovered: typesResult.rowCount || 0,
        };
    }

    /**
     * Map database row to DTO
     */
    private mapRowToDto(row: any): ExtractionJobDto {
        return {
            id: row.id,
            org_id: row.org_id,
            project_id: row.project_id,
            source_type: row.source_type,
            source_id: row.source_id,
            source_metadata: row.source_metadata || {},
            extraction_config: row.extraction_config || {},
            status: row.status,
            total_items: row.total_items || 0,
            processed_items: row.processed_items || 0,
            successful_items: row.successful_items || 0,
            failed_items: row.failed_items || 0,
            discovered_types: row.discovered_types || [],
            created_objects: row.created_objects || [],
            error_message: row.error_message,
            error_details: row.error_details,
            started_at: row.started_at,
            completed_at: row.completed_at,
            created_at: row.created_at,
            created_by: row.created_by,
            updated_at: row.updated_at,
        };
    }
}
