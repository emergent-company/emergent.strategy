import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  DiscoveryJobService,
  DiscoveryJobConfig,
} from './discovery-job.service';
import { Scopes } from '../auth/scopes.decorator';
import {
  RequireProjectId,
  ProjectContext,
} from '../../common/decorators/project-context.decorator';

@Controller('discovery-jobs')
export class DiscoveryJobController {
  private readonly logger = new Logger(DiscoveryJobController.name);

  constructor(private readonly discoveryService: DiscoveryJobService) {}

  /**
   * Start a new discovery job
   * POST /discovery-jobs/projects/:projectId/start
   *
   * Headers: X-Org-ID, X-Project-ID (from req.headers)
   *
   * Body: {
   *   document_ids: string[],
   *   batch_size: number,
   *   min_confidence: number,
   *   include_relationships: boolean,
   *   max_iterations: number
   * }
   */
  @Post('projects/:projectId/start')
  @Scopes('discovery:write')
  async startDiscovery(
    @RequireProjectId({ requireOrg: true }) ctx: ProjectContext,
    @Param('projectId') projectId: string,
    @Body() config: DiscoveryJobConfig
  ) {
    if (!config.document_ids || config.document_ids.length === 0) {
      throw new BadRequestException(
        'document_ids array is required and cannot be empty'
      );
    }

    this.logger.log(
      `[START DISCOVERY] Project ${projectId}, docs: ${config.document_ids.length}`
    );

    const result = await this.discoveryService.startDiscovery(
      projectId,
      ctx.orgId!,
      config
    );

    return result;
  }

  /**
   * Get discovery job status
   * GET /discovery-jobs/:jobId
   */
  @Get(':jobId')
  @Scopes('discovery:read')
  async getJobStatus(@Param('jobId') jobId: string) {
    return this.discoveryService.getJobStatus(jobId);
  }

  /**
   * List discovery jobs for a project
   * GET /discovery-jobs/projects/:projectId
   */
  @Get('projects/:projectId')
  @Scopes('discovery:read')
  async listJobs(@Param('projectId') projectId: string) {
    return this.discoveryService.listJobsForProject(projectId);
  }

  /**
   * Cancel a discovery job
   * DELETE /discovery-jobs/:jobId
   */
  @Delete(':jobId')
  @Scopes('discovery:write')
  async cancelJob(@Param('jobId') jobId: string) {
    await this.discoveryService.cancelJob(jobId);
    return { message: 'Discovery job cancelled' };
  }

  /**
   * Finalize discovery and create template pack
   * POST /discovery-jobs/:jobId/finalize
   *
   * Headers: X-Org-ID, X-Project-ID
   *
   * Body: {
   *   packName: string,
   *   mode: 'create' | 'extend',
   *   existingPackId?: string,
   *   includedTypes: Array<{ type_name, description, properties, required_properties, example_instances, frequency }>,
   *   includedRelationships: Array<{ source_type, target_type, relation_type, description, cardinality }>
   * }
   */
  @Post(':jobId/finalize')
  @Scopes('discovery:write')
  async finalizeDiscovery(
    @RequireProjectId({ requireOrg: true }) ctx: ProjectContext,
    @Param('jobId') jobId: string,
    @Body()
    body: {
      packName: string;
      mode: 'create' | 'extend';
      existingPackId?: string;
      includedTypes: Array<{
        type_name: string;
        description: string;
        properties: Record<string, any>;
        required_properties: string[];
        example_instances: any[];
        frequency: number;
      }>;
      includedRelationships: Array<{
        source_type: string;
        target_type: string;
        relation_type: string;
        description: string;
        cardinality: string;
      }>;
    }
  ) {
    this.logger.log(
      `[FINALIZE DISCOVERY] Job ${jobId}, mode: ${body.mode}, pack: ${body.packName}`
    );

    const result = await this.discoveryService.finalizeDiscoveryAndCreatePack(
      jobId,
      ctx.projectId,
      ctx.orgId!,
      body.packName,
      body.mode,
      body.existingPackId,
      body.includedTypes,
      body.includedRelationships
    );

    return result;
  }
}
