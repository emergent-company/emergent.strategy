import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  DiscoveryJobService,
  DiscoveryJobConfig,
} from './discovery-job.service';
import { Scopes } from '../auth/scopes.decorator';

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
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() config: DiscoveryJobConfig
  ) {
    const orgId = req.headers['x-org-id'] as string;
    const headerProjectId = req.headers['x-project-id'] as string;

    if (!orgId || !headerProjectId) {
      throw new BadRequestException(
        'Missing required headers: X-Org-ID, X-Project-ID'
      );
    }

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
      orgId,
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
    @Req() req: Request,
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
    const orgId = req.headers['x-org-id'] as string;
    const projectId = req.headers['x-project-id'] as string;

    if (!orgId || !projectId) {
      throw new BadRequestException(
        'Missing required headers: X-Org-ID, X-Project-ID'
      );
    }

    this.logger.log(
      `[FINALIZE DISCOVERY] Job ${jobId}, mode: ${body.mode}, pack: ${body.packName}`
    );

    const result = await this.discoveryService.finalizeDiscoveryAndCreatePack(
      jobId,
      projectId,
      orgId,
      body.packName,
      body.mode,
      body.existingPackId,
      body.includedTypes,
      body.includedRelationships
    );

    return result;
  }
}
