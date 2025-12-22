import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { MonitoringService } from './monitoring.service';
import {
  RequireProjectId,
  ProjectContext,
} from '../../common/decorators/project-context.decorator';
import {
  ResourceListResponseDto,
  ResourceDetailResponseDto,
  LogEntryDto,
  LLMCallDto,
} from './dto/resource-detail.dto';
import { ResourceQueryDto, LogQueryDto } from './dto/resource-query.dto';

/**
 * Monitoring Controller
 *
 * Provides read-only access to system monitoring data including:
 * - Extraction job tracking and metrics
 * - System process logs
 * - LLM API call logs with cost analysis
 *
 * Authorization:
 * - Uses existing AuthGuard and ScopesGuard (no new role required)
 * - Requires 'extraction:read' scope for extraction job endpoints
 * - Future endpoints will use appropriate existing scopes
 *
 * Context:
 * - Reads X-Project-ID header for tenant isolation
 * - All queries respect RLS policies on kb.system_process_logs and kb.llm_call_logs
 *
 * Example requests:
 * GET /monitoring/extraction-jobs?status=completed&limit=20
 * GET /monitoring/extraction-jobs/abc-123
 * GET /monitoring/extraction-jobs/abc-123/logs?level=error
 * GET /monitoring/extraction-jobs/abc-123/llm-calls
 */
@ApiTags('monitoring')
@Controller('monitoring')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  /**
   * List extraction jobs with optional filtering
   *
   * Headers:
   * - X-Project-ID: UUID (required)
   *
   * Query parameters:
   * - status: Filter by job status (optional)
   * - date_from: Filter by start date (ISO 8601, optional)
   * - date_to: Filter by end date (ISO 8601, optional)
   * - limit: Number of results (1-100, default 50)
   * - offset: Pagination offset (default 0)
   *
   * Returns:
   * - items: Array of extraction job summaries with aggregated costs
   * - total: Total count of matching jobs
   * - limit/offset: Echo of pagination parameters
   */
  @Get('extraction-jobs')
  @Scopes('extraction:read')
  @ApiOperation({ summary: 'List extraction jobs with metrics' })
  @ApiResponse({ status: 200, type: ResourceListResponseDto })
  async listExtractionJobs(
    @RequireProjectId() ctx: ProjectContext,
    @Query() query: ResourceQueryDto
  ): Promise<ResourceListResponseDto> {
    return this.monitoringService.getExtractionJobs(ctx.projectId, query);
  }

  /**
   * Get detailed information for a specific extraction job
   *
   * Headers:
   * - X-Project-ID: UUID (required)
   *
   * Path parameters:
   * - id: Extraction job UUID
   *
   * Returns:
   * - resource: Full job details with progress and cost
   * - recentLogs: Last 100 process log entries
   * - llmCalls: All LLM API calls made during extraction
   * - metrics: Aggregated statistics (total cost, avg duration, call counts)
   */
  @Get('extraction-jobs/:id')
  @Scopes('extraction:read')
  @ApiOperation({
    summary: 'Get extraction job details with logs and LLM calls',
  })
  @ApiResponse({ status: 200, type: ResourceDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getExtractionJobDetail(
    @RequireProjectId() ctx: ProjectContext,
    @Param('id') jobId: string
  ): Promise<ResourceDetailResponseDto> {
    try {
      return await this.monitoringService.getExtractionJobDetail(
        ctx.projectId,
        jobId
      );
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  /**
   * Get system process logs for a specific extraction job
   *
   * Path parameters:
   * - id: Extraction job UUID
   *
   * Query parameters:
   * - level: Filter by log level (debug/info/warn/error/fatal, optional)
   * - limit: Number of results (1-500, default 100)
   * - offset: Pagination offset (default 0)
   *
   * Returns: Array of log entries with metadata
   */
  @Get('extraction-jobs/:id/logs')
  @Scopes('extraction:read')
  @ApiOperation({ summary: 'Get process logs for extraction job' })
  @ApiResponse({ status: 200, type: [LogEntryDto] })
  async getExtractionJobLogs(
    @Param('id') jobId: string,
    @Query() query: LogQueryDto
  ): Promise<LogEntryDto[]> {
    return this.monitoringService.getLogsForResource(
      jobId,
      'extraction_job',
      query
    );
  }

  /**
   * Get LLM API calls for a specific extraction job
   *
   * Path parameters:
   * - id: Extraction job UUID
   *
   * Query parameters:
   * - limit: Number of results (1-500, default 50)
   * - offset: Pagination offset (default 0)
   *
   * Returns: Array of LLM call records with:
   * - Request/response payloads
   * - Token usage (input/output/total)
   * - Cost in USD
   * - Duration and status
   */
  @Get('extraction-jobs/:id/llm-calls')
  @Scopes('extraction:read')
  @ApiOperation({ summary: 'Get LLM calls for extraction job' })
  @ApiResponse({ status: 200, type: [LLMCallDto] })
  async getExtractionJobLLMCalls(
    @Param('id') jobId: string,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0
  ): Promise<LLMCallDto[]> {
    return this.monitoringService.getLLMCallsForResource(
      jobId,
      'extraction_job',
      limit,
      offset
    );
  }
}
