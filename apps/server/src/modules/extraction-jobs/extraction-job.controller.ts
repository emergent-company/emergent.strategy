import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ExtractionJobService } from './extraction-job.service';
import { ExtractionLoggerService } from './extraction-logger.service';
import {
  CreateExtractionJobDto,
  UpdateExtractionJobDto,
  ExtractionJobDto,
  ListExtractionJobsDto,
  ExtractionJobListDto,
} from './dto/extraction-job.dto';
import { Request } from 'express';
import { isUUID } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

/**
 * Extraction Job Controller
 *
 * REST API for extraction job management
 * Phase 1: Basic CRUD operations for job tracking
 */
@ApiTags('Extraction Jobs')
@Controller('admin/extraction-jobs')
@ApiBearerAuth()
@UseGuards(AuthGuard, ScopesGuard)
export class ExtractionJobController {
  constructor(
    private readonly jobService: ExtractionJobService,
    private readonly loggerService: ExtractionLoggerService
  ) {}

  private getProjectId(req: Request, routeProjectId?: string): string {
    const header = req.headers['x-project-id'];
    const headerProjectId = Array.isArray(header) ? header[0] : header;
    const resolved = routeProjectId ?? headerProjectId;

    if (!resolved) {
      throw new BadRequestException(
        'x-project-id header required for extraction job operations'
      );
    }

    if (
      routeProjectId &&
      headerProjectId &&
      routeProjectId !== headerProjectId
    ) {
      throw new BadRequestException(
        'Project ID mismatch between route parameter and x-project-id header'
      );
    }

    if (!isUUID(resolved)) {
      throw new ForbiddenException('Project access denied');
    }

    return resolved;
  }

  /**
   * Create a new extraction job
   */
  @Post()
  @ApiOperation({
    summary: 'Create extraction job',
    description:
      'Creates a new extraction job with queued status. Phase 2 will enqueue to worker queue.',
  })
  @ApiResponse({
    status: 201,
    description: 'Job created successfully',
    type: ExtractionJobDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async createJob(
    @Body() dto: CreateExtractionJobDto,
    @Req() req: Request
  ): Promise<ExtractionJobDto> {
    const projectId = this.getProjectId(req, dto.project_id);

    if (dto.project_id && dto.project_id !== projectId) {
      throw new BadRequestException(
        'Project ID mismatch between body and x-project-id header'
      );
    }

    return this.jobService.createJob({
      ...dto,
      project_id: projectId,
    });
  }

  /**
   * List extraction jobs for a project
   */
  @Get('projects/:projectId')
  @ApiOperation({
    summary: 'List extraction jobs',
    description:
      'List extraction jobs for a project with optional filters and pagination',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Jobs retrieved successfully',
    type: ExtractionJobListDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:read')
  async listJobs(
    @Param('projectId') projectId: string,
    @Query() query: ListExtractionJobsDto,
    @Req() req: Request
  ): Promise<ExtractionJobListDto> {
    const resolvedProjectId = this.getProjectId(req, projectId);

    return this.jobService.listJobs(resolvedProjectId, query);
  }

  /**
   * Get extraction job by ID
   */
  @Get(':jobId')
  @ApiOperation({
    summary: 'Get extraction job',
    description: 'Get detailed information about a specific extraction job',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Job retrieved successfully',
    type: ExtractionJobDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:read')
  async getJob(
    @Param('jobId') jobId: string,
    @Req() req: Request
  ): Promise<ExtractionJobDto> {
    const projectId = this.getProjectId(req);

    return this.jobService.getJobById(jobId, projectId);
  }

  /**
   * Update extraction job
   */
  @Patch(':jobId')
  @ApiOperation({
    summary: 'Update extraction job',
    description: 'Update job status, progress, results, or errors',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Job updated successfully',
    type: ExtractionJobDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async updateJob(
    @Param('jobId') jobId: string,
    @Body() dto: UpdateExtractionJobDto,
    @Req() req: Request
  ): Promise<ExtractionJobDto> {
    const projectId = this.getProjectId(req);

    return this.jobService.updateJob(jobId, projectId, dto);
  }

  /**
   * Retry a stuck or failed extraction job
   */
  @Post(':jobId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry a stuck or failed extraction job',
    description:
      'Resets a job stuck in running status or failed status back to queued for retry. ' +
      'Useful after server restarts that leave jobs orphaned.',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Job reset to queued for retry',
    type: ExtractionJobDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({
    status: 400,
    description:
      'Cannot retry job with current status (only running/failed jobs)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async retryJob(
    @Param('jobId') jobId: string,
    @Req() req: Request
  ): Promise<ExtractionJobDto> {
    const projectId = this.getProjectId(req);

    return this.jobService.retryJob(jobId, projectId);
  }

  /**
   * Cancel extraction job
   */
  @Post(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel extraction job',
    description: 'Cancel a queued or running extraction job',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({
    status: 200,
    description: 'Job cancelled successfully',
    type: ExtractionJobDto,
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({
    status: 400,
    description: 'Job cannot be cancelled (already completed/failed)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async cancelJob(
    @Param('jobId') jobId: string,
    @Req() req: Request
  ): Promise<ExtractionJobDto> {
    const projectId = this.getProjectId(req);

    return this.jobService.cancelJob(jobId, projectId);
  }

  /**
   * Delete extraction job
   */
  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete extraction job',
    description: 'Delete a completed, failed, or cancelled extraction job',
  })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 204, description: 'Job deleted successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete running/queued job',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async deleteJob(
    @Param('jobId') jobId: string,
    @Req() req: Request
  ): Promise<void> {
    const projectId = this.getProjectId(req);

    return this.jobService.deleteJob(jobId, projectId);
  }

  /**
   * Bulk cancel all jobs for a project
   */
  @Post('projects/:projectId/bulk-cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel all queued/running jobs',
    description:
      'Bulk cancel all queued and running extraction jobs for a project',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Jobs cancelled successfully',
    schema: {
      type: 'object',
      properties: {
        cancelled: { type: 'number', example: 5 },
        message: { type: 'string', example: 'Cancelled 5 jobs' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async bulkCancelJobs(
    @Param('projectId') projectId: string,
    @Req() req: Request
  ): Promise<{ cancelled: number; message: string }> {
    const resolvedProjectId = this.getProjectId(req, projectId);

    const cancelled = await this.jobService.bulkCancelJobs(resolvedProjectId);
    return {
      cancelled,
      message: `Cancelled ${cancelled} job${cancelled !== 1 ? 's' : ''}`,
    };
  }

  /**
   * Bulk delete all completed/failed/cancelled jobs for a project
   */
  @Delete('projects/:projectId/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete all completed/failed/cancelled jobs',
    description:
      'Bulk delete all extraction jobs that are completed, failed, or cancelled',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Jobs deleted successfully',
    schema: {
      type: 'object',
      properties: {
        deleted: { type: 'number', example: 10 },
        message: { type: 'string', example: 'Deleted 10 jobs' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async bulkDeleteJobs(
    @Param('projectId') projectId: string,
    @Req() req: Request
  ): Promise<{ deleted: number; message: string }> {
    const resolvedProjectId = this.getProjectId(req, projectId);

    const deleted = await this.jobService.bulkDeleteJobs(resolvedProjectId);
    return {
      deleted,
      message: `Deleted ${deleted} job${deleted !== 1 ? 's' : ''}`,
    };
  }

  /**
   * Bulk retry all failed jobs for a project
   */
  @Post('projects/:projectId/bulk-retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry all failed jobs',
    description: 'Bulk retry all extraction jobs with failed status',
  })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({
    status: 200,
    description: 'Jobs reset for retry successfully',
    schema: {
      type: 'object',
      properties: {
        retried: { type: 'number', example: 3 },
        message: { type: 'string', example: 'Retrying 3 jobs' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:write')
  async bulkRetryJobs(
    @Param('projectId') projectId: string,
    @Req() req: Request
  ): Promise<{ retried: number; message: string }> {
    const resolvedProjectId = this.getProjectId(req, projectId);

    const retried = await this.jobService.bulkRetryJobs(resolvedProjectId);
    return {
      retried,
      message: `Retrying ${retried} job${retried !== 1 ? 's' : ''}`,
    };
  }

  /**
   * Get job statistics for a project
   */
  @Get('projects/:projectId/statistics')
  @ApiOperation({
    summary: 'Get job statistics',
    description: 'Get aggregated statistics for extraction jobs in a project',
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
          example: {
            queued: 5,
            running: 2,
            completed: 120,
            failed: 20,
            cancelled: 3,
          },
        },
        by_source_type: {
          type: 'object',
          example: { document: 100, api: 30, manual: 20 },
        },
        avg_duration_ms: { type: 'number', nullable: true, example: 45000 },
        total_objects_created: { type: 'number', example: 5230 },
        total_types_discovered: { type: 'number', example: 15 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Scopes('extraction:read')
  async getStatistics(
    @Param('projectId') projectId: string,
    @Req() req: Request
  ): Promise<any> {
    const resolvedProjectId = this.getProjectId(req, projectId);

    return this.jobService.getJobStatistics(resolvedProjectId);
  }

  /**
   * List available Gemini models
   */
  @Get('_debug/available-models')
  @ApiOperation({
    summary: 'List available Gemini models',
    description:
      'Query Google Gemini API to list all available models with their capabilities',
  })
  @ApiResponse({
    status: 200,
    description: 'Models retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        current_model: { type: 'string', example: 'gemini-1.5-flash-latest' },
        available_models: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: 'models/gemini-2.0-flash-exp' },
              displayName: { type: 'string', example: 'Gemini 2.0 Flash' },
              description: { type: 'string' },
              supportedGenerationMethods: {
                type: 'array',
                items: { type: 'string' },
              },
              inputTokenLimit: { type: 'number' },
              outputTokenLimit: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Failed to fetch models from API' })
  @Scopes('extraction:read')
  async listAvailableModels(): Promise<any> {
    return this.jobService.listAvailableGeminiModels();
  }
  /**
   * Get extraction job logs
   */
  @Get(':jobId/logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get detailed extraction logs',
    description:
      'Retrieve step-by-step logs for an extraction job including LLM interactions, errors, and performance metrics',
  })
  @ApiParam({ name: 'jobId', description: 'Extraction job UUID' })
  @ApiResponse({
    status: 200,
    description: 'Logs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        logs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              logged_at: { type: 'string', format: 'date-time' },
              step_index: { type: 'number' },
              operation_type: {
                type: 'string',
                enum: [
                  'llm_call',
                  'chunk_processing',
                  'object_creation',
                  'relationship_creation',
                  'suggestion_creation',
                  'validation',
                  'error',
                ],
              },
              operation_name: { type: 'string', nullable: true },
              status: { type: 'string', enum: ['success', 'error', 'warning'] },
              input_data: { type: 'object', nullable: true },
              output_data: { type: 'object', nullable: true },
              error_message: { type: 'string', nullable: true },
              error_stack: { type: 'string', nullable: true },
              duration_ms: { type: 'number', nullable: true },
              tokens_used: { type: 'number', nullable: true },
              metadata: { type: 'object', nullable: true },
            },
          },
        },
        summary: {
          type: 'object',
          properties: {
            totalSteps: { type: 'number' },
            successSteps: { type: 'number' },
            errorSteps: { type: 'number' },
            warningSteps: { type: 'number' },
            totalDurationMs: { type: 'number' },
            totalTokensUsed: { type: 'number' },
            operationCounts: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid job ID format' })
  @ApiResponse({
    status: 403,
    description: 'Access denied to this extraction job',
  })
  @ApiResponse({ status: 404, description: 'Extraction job not found' })
  @Scopes('extraction:read')
  async getExtractionLogs(
    @Param('jobId') jobId: string,
    @Req() req: Request
  ): Promise<{ logs: any[]; summary: any; timeline?: any[] }> {
    if (!isUUID(jobId)) {
      throw new BadRequestException('Invalid job ID format');
    }

    const projectId = this.getProjectId(req);
    const job = await this.jobService.getJobById(jobId, projectId);

    const [logs, summary] = await Promise.all([
      this.loggerService.getJobLogs(jobId),
      this.loggerService.getJobSummary(jobId),
    ]);

    // Include timeline events from debug_info if available
    const timeline = job.debug_info?.timeline || [];

    return { logs, summary, timeline };
  }
}
