import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ExtractionJobService } from './extraction-job.service';
import {
    CreateExtractionJobDto,
    UpdateExtractionJobDto,
    ExtractionJobDto,
    ListExtractionJobsDto,
    ExtractionJobListDto,
} from './dto/extraction-job.dto';

/**
 * Extraction Job Controller
 * 
 * REST API for extraction job management
 * Phase 1: Basic CRUD operations for job tracking
 */
@ApiTags('Extraction Jobs')
@Controller('admin/extraction-jobs')
@ApiBearerAuth()
export class ExtractionJobController {
    constructor(private readonly jobService: ExtractionJobService) { }

    /**
     * Create a new extraction job
     */
    @Post()
    @ApiOperation({
        summary: 'Create extraction job',
        description: 'Creates a new extraction job with pending status. Phase 2 will enqueue to worker queue.'
    })
    @ApiResponse({ status: 201, description: 'Job created successfully', type: ExtractionJobDto })
    @ApiResponse({ status: 400, description: 'Invalid request data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async createJob(@Body() dto: CreateExtractionJobDto): Promise<ExtractionJobDto> {
        return this.jobService.createJob(dto);
    }

    /**
     * List extraction jobs for a project
     */
    @Get('projects/:projectId')
    @ApiOperation({
        summary: 'List extraction jobs',
        description: 'List extraction jobs for a project with optional filters and pagination'
    })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({ status: 200, description: 'Jobs retrieved successfully', type: ExtractionJobListDto })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async listJobs(
        @Param('projectId') projectId: string,
        @Query('org_id') orgId: string,
        @Query() query: ListExtractionJobsDto
    ): Promise<ExtractionJobListDto> {
        return this.jobService.listJobs(projectId, orgId, query);
    }

    /**
     * Get extraction job by ID
     */
    @Get(':jobId')
    @ApiOperation({
        summary: 'Get extraction job',
        description: 'Get detailed information about a specific extraction job'
    })
    @ApiParam({ name: 'jobId', description: 'Job ID' })
    @ApiResponse({ status: 200, description: 'Job retrieved successfully', type: ExtractionJobDto })
    @ApiResponse({ status: 404, description: 'Job not found' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getJob(
        @Param('jobId') jobId: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<ExtractionJobDto> {
        return this.jobService.getJobById(jobId, projectId, orgId);
    }

    /**
     * Update extraction job
     */
    @Patch(':jobId')
    @ApiOperation({
        summary: 'Update extraction job',
        description: 'Update job status, progress, results, or errors'
    })
    @ApiParam({ name: 'jobId', description: 'Job ID' })
    @ApiResponse({ status: 200, description: 'Job updated successfully', type: ExtractionJobDto })
    @ApiResponse({ status: 404, description: 'Job not found' })
    @ApiResponse({ status: 400, description: 'Invalid update data' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async updateJob(
        @Param('jobId') jobId: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string,
        @Body() dto: UpdateExtractionJobDto
    ): Promise<ExtractionJobDto> {
        return this.jobService.updateJob(jobId, projectId, orgId, dto);
    }

    /**
     * Cancel extraction job
     */
    @Post(':jobId/cancel')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Cancel extraction job',
        description: 'Cancel a pending or running extraction job'
    })
    @ApiParam({ name: 'jobId', description: 'Job ID' })
    @ApiResponse({ status: 200, description: 'Job cancelled successfully', type: ExtractionJobDto })
    @ApiResponse({ status: 404, description: 'Job not found' })
    @ApiResponse({ status: 400, description: 'Job cannot be cancelled (already completed/failed)' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async cancelJob(
        @Param('jobId') jobId: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<ExtractionJobDto> {
        return this.jobService.cancelJob(jobId, projectId, orgId);
    }

    /**
     * Delete extraction job
     */
    @Delete(':jobId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete extraction job',
        description: 'Delete a completed, failed, or cancelled extraction job'
    })
    @ApiParam({ name: 'jobId', description: 'Job ID' })
    @ApiResponse({ status: 204, description: 'Job deleted successfully' })
    @ApiResponse({ status: 404, description: 'Job not found' })
    @ApiResponse({ status: 400, description: 'Cannot delete running/pending job' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async deleteJob(
        @Param('jobId') jobId: string,
        @Query('project_id') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<void> {
        return this.jobService.deleteJob(jobId, projectId, orgId);
    }

    /**
     * Get job statistics for a project
     */
    @Get('projects/:projectId/statistics')
    @ApiOperation({
        summary: 'Get job statistics',
        description: 'Get aggregated statistics for extraction jobs in a project'
    })
    @ApiParam({ name: 'projectId', description: 'Project ID' })
    @ApiResponse({
        status: 200,
        description: 'Statistics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                total: { type: 'number', example: 150 },
                by_status: {
                    type: 'object',
                    example: { pending: 5, running: 2, completed: 120, failed: 20, cancelled: 3 }
                },
                by_source_type: {
                    type: 'object',
                    example: { document: 100, api: 30, manual: 20 }
                },
                avg_duration_ms: { type: 'number', nullable: true, example: 45000 },
                total_objects_created: { type: 'number', example: 5230 },
                total_types_discovered: { type: 'number', example: 15 },
            }
        }
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async getStatistics(
        @Param('projectId') projectId: string,
        @Query('org_id') orgId: string
    ): Promise<any> {
        return this.jobService.getJobStatistics(projectId, orgId);
    }
}
