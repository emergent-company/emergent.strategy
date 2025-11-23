import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Scopes } from '../auth/scopes.decorator';
import { EmbeddingJobsService } from './embedding-jobs.service';
import { GraphService } from './graph.service';
import {
  TriggerEmbeddingsBatchDto,
  TriggerEmbeddingsProjectDto,
  EmbeddingJobResponseDto,
} from './dto/trigger-embeddings.dto';

@ApiTags('Graph')
@Controller('graph/embeddings')
export class GraphEmbeddingsController {
  private readonly logger = new Logger(GraphEmbeddingsController.name);

  constructor(
    private readonly embeddingJobsService: EmbeddingJobsService,
    private readonly graphService: GraphService
  ) {}

  @Get('object/:id/status')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Get embedding job status for an object',
    description:
      'Returns the active embedding job status (pending or processing) for the specified object. Returns 404 if no active job exists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active embedding job found',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        object_id: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['pending', 'processing'] },
        attempt_count: { type: 'number' },
        priority: { type: 'number' },
        scheduled_at: { type: 'string', format: 'date-time' },
        started_at: { type: 'string', format: 'date-time', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No active job found for this object',
  })
  async getEmbeddingJobStatus(@Param('id') objectId: string) {
    const job = await this.embeddingJobsService.getJobStatusForObject(objectId);

    if (!job) {
      throw new NotFoundException(
        `No active embedding job found for object ${objectId}`
      );
    }

    return job;
  }

  @Post('object/:id')
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Trigger embedding generation for a single object',
    description:
      'Enqueues an embedding job for the specified graph object. The job will be processed asynchronously by the embedding worker. Idempotent: if a job is already pending/processing for this object, returns the existing job.',
  })
  @ApiResponse({ status: 201, description: 'Embedding job created or found' })
  @ApiResponse({ status: 404, description: 'Object not found' })
  async triggerEmbeddingForObject(
    @Param('id') objectId: string,
    @Query('priority') priorityStr?: string
  ): Promise<EmbeddingJobResponseDto> {
    // Verify object exists
    const object = await this.graphService.getObject(objectId);
    if (!object) {
      throw new NotFoundException(`Object with id ${objectId} not found`);
    }

    const priority = priorityStr ? parseInt(priorityStr, 10) : 0;

    const job = await this.embeddingJobsService.enqueue(objectId, {
      priority,
    });

    return {
      enqueued: job ? 1 : 0,
      skipped: job ? 0 : 1,
      jobIds: job ? [job.id] : [],
    };
  }

  @Post('batch')
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Trigger embedding generation for multiple objects',
    description:
      'Enqueues embedding jobs for the specified graph objects. Jobs will be processed asynchronously by the embedding worker. Idempotent: if a job is already pending/processing for an object, that job is skipped.',
  })
  @ApiResponse({
    status: 201,
    description: 'Embedding jobs created',
    type: EmbeddingJobResponseDto,
  })
  async triggerEmbeddingsBatch(
    @Body() dto: TriggerEmbeddingsBatchDto
  ): Promise<EmbeddingJobResponseDto> {
    const jobIds: string[] = [];
    let enqueued = 0;
    let skipped = 0;

    for (const objectId of dto.objectIds) {
      const job = await this.embeddingJobsService.enqueue(objectId, {
        priority: dto.priority ?? 0,
      });

      if (job) {
        // Check if this is a new job (status=pending, attempt_count=0)
        // or an existing job (already enqueued)
        const isNewJob = job.status === 'pending' && job.attempt_count === 0;
        if (isNewJob) {
          enqueued++;
        } else {
          skipped++;
        }
        jobIds.push(job.id);
      }
    }

    this.logger.log(
      `Batch embedding request: ${enqueued} new jobs, ${skipped} already queued`
    );

    return {
      enqueued,
      skipped,
      jobIds,
    };
  }

  @Post('regenerate-project')
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Trigger embedding regeneration for all objects in a project',
    description:
      'Enqueues embedding jobs for all graph objects in the specified project. Optionally filter by object type. Use force=true to regenerate embeddings even if they already exist. Jobs will be processed asynchronously by the embedding worker.',
  })
  @ApiResponse({
    status: 201,
    description: 'Embedding jobs created',
    type: EmbeddingJobResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid project ID' })
  async triggerEmbeddingsProject(
    @Body() dto: TriggerEmbeddingsProjectDto
  ): Promise<EmbeddingJobResponseDto> {
    this.logger.log(
      `Regenerating embeddings for project ${dto.projectId}${
        dto.objectType ? ` (type: ${dto.objectType})` : ''
      }${dto.force ? ' (force=true)' : ''}`
    );

    // Use searchObjects to list all objects in the project
    const searchResult = await this.graphService.searchObjects({
      project_id: dto.projectId,
      type: dto.objectType,
      limit: 10000, // Large limit to get all objects
    });

    // Filter by embedding status if not forcing
    const filteredObjects = dto.force
      ? searchResult.items
      : searchResult.items.filter((obj: any) => !obj.embedding);

    this.logger.log(`Found ${filteredObjects.length} objects to process`);

    const jobIds: string[] = [];
    let enqueued = 0;
    let skipped = 0;

    for (const object of filteredObjects) {
      const job = await this.embeddingJobsService.enqueue(object.id, {
        priority: dto.priority ?? 0,
      });

      if (job) {
        const isNewJob = job.status === 'pending' && job.attempt_count === 0;
        if (isNewJob) {
          enqueued++;
        } else {
          skipped++;
        }
        jobIds.push(job.id);
      }
    }

    return {
      enqueued,
      skipped,
      jobIds,
    };
  }
}
