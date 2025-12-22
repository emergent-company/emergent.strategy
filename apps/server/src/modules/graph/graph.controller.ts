import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Patch,
  Query,
  Delete,
  HttpCode,
  BadRequestException,
  Inject,
  ParseArrayPipe,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { Scopes } from '../auth/scopes.decorator';
import {
  OptionalProjectId,
  OptionalProjectContext,
} from '../../common/decorators/project-context.decorator';
import { GraphService } from './graph.service';
import { CreateGraphObjectDto } from './dto/create-graph-object.dto';
import { PatchGraphObjectDto } from './dto/patch-graph-object.dto';
import { BulkUpdateStatusDto } from './dto/bulk-update-status.dto';
import { CreateGraphRelationshipDto } from './dto/create-graph-relationship.dto';
import { PatchGraphRelationshipDto } from './dto/patch-graph-relationship.dto';
import { TraverseGraphDto } from './dto/traverse-graph.dto';
import { GraphExpandDto } from './dto/expand-graph.dto';
import {
  HistoryQueryDto,
  ObjectHistoryResponseDto,
  RelationshipHistoryResponseDto,
} from './dto/history.dto';
import { BranchMergeRequestDto, BranchMergeSummaryDto } from './dto/merge.dto';
import { GraphVectorSearchService } from './graph-vector-search.service';
import { VectorSearchDto } from './dto/vector-search.dto';
import { SimilarVectorSearchQueryDto } from './dto/similar-vector-search.dto';
import { EmbeddingPolicyService } from './embedding-policy.service';
import {
  CreateEmbeddingPolicyDto,
  UpdateEmbeddingPolicyDto,
  EmbeddingPolicyResponseDto,
} from './embedding-policy.dto';
import { SearchObjectsWithNeighborsDto } from './dto/search-with-neighbors.dto';

@ApiTags('Graph')
@Controller('graph')
export class GraphObjectsController {
  constructor(
    private readonly service: GraphService,
    private readonly embeddingPolicyService: EmbeddingPolicyService
  ) {}

  // NOTE: Using property injection for GraphVectorSearchService.
  // In the current test harness, constructor injection produced an undefined instance
  // (likely due to circular metadata or module ordering during dynamic test module compilation).
  // Property injection avoids that transient resolution issue while still allowing DI in runtime.
  @Inject(GraphVectorSearchService)
  private readonly vectorSearchService!: GraphVectorSearchService;
  // Internal once-only warning flags (avoid noisy logs for legacy param usage)
  private _warnedVectorLegacy = false;
  private _warnedSimilarLegacy = false;
  private readonly logger = new Logger(GraphObjectsController.name);

  @Post('objects')
  @Scopes('graph:write')
  @ApiOperation({ summary: 'Create a graph object (initial version)' })
  @ApiResponse({ status: 201, description: 'Created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(
    @Body() dto: CreateGraphObjectDto,
    @OptionalProjectId() ctx: OptionalProjectContext
  ) {
    return this.service.createObject(
      {
        ...dto,
        org_id: dto.organization_id ?? ctx?.orgId ?? undefined,
        project_id: dto.project_id ?? ctx?.projectId ?? undefined,
      },
      ctx
    );
  }

  @Get('objects/search')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Search graph objects (basic filters)',
    description:
      'Supports pagination via created_at cursor. Optional order param (asc|desc) controls chronological direction (default asc). Desc returns newest first; cursor always set to last item created_at in current page.',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description:
      'Chronological direction (asc=oldest→newest, desc=newest→oldest). Default asc.',
  })
  @ApiQuery({
    name: 'branch_id',
    required: false,
    type: String,
    description:
      'Filter objects by branch ID. Use "null" to search main branch (branch_id IS NULL). Omit to search all branches.',
  })
  @ApiQuery({
    name: 'related_to_id',
    required: false,
    type: String,
    description: 'Filter objects connected to this ID via any relationship.',
  })
  @ApiQuery({
    name: 'ids',
    required: false,
    type: String,
    description: 'Comma-separated list of object IDs to fetch.',
  })
  @ApiQuery({
    name: 'extraction_job_id',
    required: false,
    type: String,
    description: 'Filter objects by extraction job ID.',
  })
  searchObjects(
    @Query('type') type?: string,
    @Query('key') key?: string,
    @Query('label') label?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('order') order?: string,
    @Query('branch_id') branch_id?: string,
    @Query('related_to_id') related_to_id?: string,
    @Query(
      'ids',
      new ParseArrayPipe({ items: String, separator: ',', optional: true })
    )
    ids?: string[],
    @Query('extraction_job_id') extraction_job_id?: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const ord =
      order && (order.toLowerCase() === 'asc' || order.toLowerCase() === 'desc')
        ? (order.toLowerCase() as 'asc' | 'desc')
        : undefined;

    // Parse branch_id: handle 'null' string as actual null
    let parsedBranchId: string | null | undefined = undefined;
    if (branch_id !== undefined) {
      parsedBranchId =
        branch_id === 'null' || branch_id === '' ? null : branch_id;
    }

    // Build properties filter for extraction_job_id
    const properties: Record<string, any> | undefined = extraction_job_id
      ? { _extraction_job_id: extraction_job_id }
      : undefined;

    return this.service.searchObjects(
      {
        type,
        key,
        label,
        limit: parsedLimit,
        cursor,
        order: ord,
        branch_id: parsedBranchId,
        organization_id: ctx?.orgId,
        project_id: ctx?.projectId,
        related_to_id,
        ids,
        properties,
      },
      { orgId: ctx?.orgId, projectId: ctx?.projectId }
    );
  }

  @Get('objects/fts')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Full-text search graph objects',
    description:
      'Websearch syntax over inline-populated tsvector (type, key, properties JSON). Returns newest heads ranked by ts_rank. Supports optional type, label, branch_id filters. Limit max 100.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Search query (websearch syntax)',
  })
  ftsSearch(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('label') label?: string,
    @Query('branch_id') branch_id?: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.service.searchObjectsFts(
      {
        q,
        limit: parsedLimit,
        type,
        label,
        branch_id,
        organization_id: ctx?.orgId,
        project_id: ctx?.projectId,
      },
      { orgId: ctx?.orgId, projectId: ctx?.projectId }
    );
  }

  @Get('objects/tags')
  @Scopes('graph:read')
  @ApiOperation({ summary: 'Get all distinct tags from graph objects' })
  @ApiResponse({
    status: 200,
    description: 'List of distinct tags',
    type: [String],
  })
  @ApiOkResponse({
    description:
      'Returns all distinct tags used across graph objects in the project. Tags are stored in properties.tags as string arrays.',
    schema: {
      type: 'array',
      items: { type: 'string' },
      example: ['team-sync', 'weekly', 'engineering', 'roadmap'],
    },
  })
  async getTags(
    @OptionalProjectId() ctx?: OptionalProjectContext
  ): Promise<string[]> {
    return this.service.getAllTags(ctx);
  }

  @Get('objects/:id')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Get a graph object by ID',
    description:
      'Returns the object with the given ID. Use resolveHead=true to resolve to the HEAD version when the ID refers to an old version in the version chain.',
  })
  @ApiQuery({
    name: 'resolveHead',
    required: false,
    type: Boolean,
    description:
      'If true, resolves to the HEAD version (latest) when the ID refers to an older version. Useful when you have a stale ID but need the current version.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Not found' })
  get(
    @Param('id') id: string,
    @Query('resolveHead') resolveHead?: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    const shouldResolveHead =
      resolveHead === 'true' || resolveHead === '1' || resolveHead === 'yes';
    return this.service.getObject(id, ctx, {
      resolveHead: shouldResolveHead,
    });
  }

  @Patch('objects/:id')
  @Scopes('graph:write')
  @ApiOperation({ summary: 'Patch (create new version) of a graph object' })
  @ApiResponse({ status: 200, description: 'Version created' })
  @ApiResponse({ status: 400, description: 'No effective change' })
  @ApiResponse({ status: 404, description: 'Not found' })
  patch(
    @Param('id') id: string,
    @Body() dto: PatchGraphObjectDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.patchObject(id, dto, ctx);
  }

  @Post('objects/bulk-update-status')
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Update status for multiple objects',
    description:
      'Updates the status field for multiple objects in a single request. Creates a new version for each object. Returns summary of successes and failures.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk update completed',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'number',
          description: 'Number of successfully updated objects',
        },
        failed: { type: 'number', description: 'Number of failed updates' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @HttpCode(200)
  async bulkUpdateStatus(
    @Body() body: BulkUpdateStatusDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    this.logger.log(
      `[BULK-UPDATE] Starting bulk update for ${body.ids.length} objects to status="${body.status}"`
    );
    this.logger.log(`[BULK-UPDATE] Context: ${JSON.stringify(ctx)}`);

    const startTime = Date.now();

    // Process sequentially to avoid connection pool exhaustion
    // Each patchObject acquires an advisory lock and holds a transaction open,
    // so running them in parallel can exhaust the connection pool and cause deadlocks
    const results = [];
    for (let i = 0; i < body.ids.length; i++) {
      const id = body.ids[i];
      this.logger.log(
        `[BULK-UPDATE] Processing object ${i + 1}/${body.ids.length}: ${id}`
      );
      try {
        const result = await this.service.patchObject(
          id,
          { status: body.status },
          ctx
        );
        this.logger.log(`[BULK-UPDATE] ✅ Object ${id} updated successfully`);
        results.push({ status: 'fulfilled' as const, value: result });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[BULK-UPDATE] ❌ Object ${id} failed: ${errorMessage}`
        );
        results.push({ status: 'rejected' as const, reason: error });
      }
    }

    const elapsed = Date.now() - startTime;
    this.logger.log(`[BULK-UPDATE] Completed in ${elapsed}ms`);

    return {
      success: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
      results: results.map((r, i) => ({
        id: body.ids[i],
        success: r.status === 'fulfilled',
        error:
          r.status === 'rejected'
            ? r.reason instanceof Error
              ? r.reason.message
              : String(r.reason)
            : undefined,
      })),
    };
  }

  @Delete('objects/:id')
  @Scopes('graph:write')
  @ApiOperation({
    summary:
      'Soft delete (tombstone) an object (creates new version with deleted_at)',
  })
  deleteObject(
    @Param('id') id: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.deleteObject(id, ctx);
  }

  @Post('objects/:id/restore')
  @Scopes('graph:write')
  @ApiOperation({
    summary:
      'Restore a soft-deleted object (creates new version clearing deleted_at)',
  })
  @ApiResponse({ status: 201, description: 'Restored (new version created)' })
  restoreObject(
    @Param('id') id: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.restoreObject(id, ctx);
  }

  @Get('objects/:id/history')
  @Scopes('graph:read')
  @ApiOperation({ summary: 'List version history for a graph object' })
  @ApiOkResponse({ type: ObjectHistoryResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  history(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    const parsed = limit ? parseInt(limit, 10) : 20;
    return this.service.listHistory(id, parsed, cursor, ctx);
  }

  // ---------------- Relationships ----------------
  @Post('relationships')
  @Scopes('graph:write')
  @ApiOperation({
    summary:
      'Create a relationship (initial version) or new version if properties changed',
  })
  @ApiResponse({ status: 201 })
  async createRel(
    @Body() dto: CreateGraphRelationshipDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    // Derive org/project from src object (authoritative) to avoid requiring client-supplied IDs
    const src = await this.service.getObject(dto.src_id, ctx);
    const orgId =
      (src as any).organization_id || '00000000-0000-0000-0000-000000000000';
    const projectId =
      (src as any).project_id || '00000000-0000-0000-0000-000000000000';
    return this.service.createRelationship(dto, orgId, projectId);
  }

  @Get('relationships/:id')
  @Scopes('graph:read')
  @ApiOperation({ summary: 'Get relationship by id' })
  getRel(
    @Param('id') id: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.getRelationship(id, ctx);
  }

  @Get('relationships/search')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Search relationships (basic filters)',
    description:
      'Supports pagination via created_at cursor. Optional order param (asc|desc) for chronological direction (default asc).',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description:
      'Chronological direction (asc=oldest→newest, desc=newest→oldest). Default asc.',
  })
  searchRels(
    @Query('type') type?: string,
    @Query('src_id') src_id?: string,
    @Query('dst_id') dst_id?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('order') order?: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const ord =
      order && (order.toLowerCase() === 'asc' || order.toLowerCase() === 'desc')
        ? (order.toLowerCase() as 'asc' | 'desc')
        : undefined;
    return this.service.searchRelationships(
      { type, src_id, dst_id, limit: parsedLimit, cursor, order: ord },
      ctx
    );
  }

  @Patch('relationships/:id')
  @Scopes('graph:write')
  @ApiOperation({
    summary:
      'Patch (create new version) of a relationship (only head version allowed)',
  })
  patchRel(
    @Param('id') id: string,
    @Body() dto: PatchGraphRelationshipDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.patchRelationship(id, dto, ctx);
  }

  @Delete('relationships/:id')
  @Scopes('graph:write')
  @ApiOperation({ summary: 'Soft delete a relationship (tombstone version)' })
  deleteRel(
    @Param('id') id: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.deleteRelationship(id, ctx);
  }

  @Post('relationships/:id/restore')
  @Scopes('graph:write')
  @ApiOperation({ summary: 'Restore a soft-deleted relationship' })
  @ApiResponse({ status: 201, description: 'Restored (new version created)' })
  restoreRel(
    @Param('id') id: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.restoreRelationship(id, ctx);
  }

  @Get('relationships/:id/history')
  @Scopes('graph:read')
  @ApiOperation({ summary: 'List version history for a relationship' })
  @ApiOkResponse({ type: RelationshipHistoryResponseDto })
  historyRel(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    const parsed = limit ? parseInt(limit, 10) : 20;
    return this.service.listRelationshipHistory(id, parsed, cursor, ctx);
  }

  @Get('objects/:id/edges')
  @Scopes('graph:read')
  @ApiOperation({ summary: 'List relationships adjacent to an object' })
  edges(
    @Param('id') id: string,
    @Query('direction') direction?: string,
    @Query('limit') limit?: string,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    const dir: 'out' | 'in' | 'both' =
      direction === 'out' || direction === 'in' || direction === 'both'
        ? direction
        : 'both';
    return this.service.listEdges(
      id,
      dir,
      limit ? parseInt(limit, 10) : 50,
      ctx
    );
  }

  @Post('traverse')
  @Scopes('graph:read')
  @ApiOperation({
    summary:
      'Traverse the graph from one or more root object ids (bounded BFS)',
  })
  @HttpCode(200)
  traverse(
    @Body() dto: TraverseGraphDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.traverse(dto, ctx);
  }

  @Post('expand')
  @Scopes('graph:read')
  @ApiOperation({
    summary:
      'Expand graph (single-pass bounded traversal with projection & edge property option)',
  })
  @HttpCode(200)
  expand(
    @Body() dto: GraphExpandDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    if (process.env.GRAPH_EXPAND_DISABLED === '1') {
      return { error: 'expand_disabled' };
    }
    return this.service.expand(dto as any, ctx);
  }

  // ---------------- Vector Similarity ----------------
  @Post('objects/vector-search')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Vector similarity search',
    description:
      'Returns nearest neighbors (cosine distance) for provided query vector over embedding_v2. Threshold: use maxDistance (preferred) or legacy minScore (acts as maximum distance). When both are supplied, maxDistance takes precedence.',
  })
  @HttpCode(200)
  async vectorSearch(@Body() dto: VectorSearchDto) {
    const minScore = dto.maxDistance != null ? dto.maxDistance : dto.minScore;
    if (
      dto.maxDistance == null &&
      dto.minScore != null &&
      !this._warnedVectorLegacy
    ) {
      this._warnedVectorLegacy = true;
      this.logger.debug(
        '[vector-search] Using legacy param minScore (prefer maxDistance).'
      );
    }
    return this.vectorSearchService.searchByVector(dto.vector, {
      limit: dto.limit,
      minScore,
      type: dto.type,
      orgId: dto.orgId,
      projectId: dto.projectId,
      branchId: dto.branchId,
      keyPrefix: dto.keyPrefix,
      labelsAll: dto.labelsAll,
      labelsAny: dto.labelsAny,
    });
  }

  @Get('objects/:id/similar')
  @Scopes('graph:read')
  @ApiOperation({
    summary:
      'Find objects similar to given object id using stored embedding_v2',
    description:
      'Supports same filters as POST /graph/objects/vector-search (type, orgId, projectId, branchId, keyPrefix, labelsAll, labelsAny, maxDistance|minScore, limit). maxDistance preferred; if both provided, maxDistance overrides minScore.',
  })
  async similar(
    @Param('id') id: string,
    @Query() query: SimilarVectorSearchQueryDto,
    @Query(
      'labelsAll',
      new ParseArrayPipe({ items: String, separator: ',', optional: true })
    )
    labelsAll?: string[],
    @Query(
      'labelsAny',
      new ParseArrayPipe({ items: String, separator: ',', optional: true })
    )
    labelsAny?: string[]
  ) {
    const minScore =
      query.maxDistance != null ? query.maxDistance : query.minScore;
    if (
      query.maxDistance == null &&
      query.minScore != null &&
      !this._warnedSimilarLegacy
    ) {
      this._warnedSimilarLegacy = true;
      this.logger.debug(
        '[vector-similar] Using legacy param minScore (prefer maxDistance).'
      );
    }
    return this.vectorSearchService.searchSimilar(id, {
      limit: query.limit,
      minScore,
      type: query.type,
      orgId: query.orgId,
      projectId: query.projectId,
      branchId: query.branchId,
      keyPrefix: query.keyPrefix,
      labelsAll: labelsAll || query.labelsAll,
      labelsAny: labelsAny || query.labelsAny,
    });
  }

  @Post('search-with-neighbors')
  @Scopes('graph:read')
  @ApiOperation({
    summary: 'Search graph objects with optional neighbor expansion',
    description: `
Performs semantic search over graph objects and optionally retrieves their neighbors.

**Search Strategy:**
- Uses full-text search (FTS) to find primary results matching the query
- Optionally expands each result to include:
  1. Semantically similar objects (via vector embeddings)
  2. Directly connected objects (via relationships)

**Use Cases:**
- Chat context retrieval (similar to document citations)
- Discovery features ("related objects")
- Rich detail views with context

**Neighbor Sources:**
- **Semantic**: Objects with similar embedding vectors (via searchSimilar)
- **Relational**: Objects connected via graph relationships (depends_on, implements, etc.)

**Example:**
\`\`\`json
{
  "query": "authentication patterns",
  "limit": 5,
  "includeNeighbors": true,
  "maxNeighbors": 3,
  "maxDistance": 0.5
}
\`\`\`
        `,
  })
  @ApiResponse({
    status: 200,
    description: 'Search results with optional neighbors',
    schema: {
      type: 'object',
      properties: {
        primaryResults: {
          type: 'array',
          description: 'Objects matching the search query',
          items: { type: 'object' },
        },
        neighbors: {
          type: 'object',
          description: 'Map of object ID to array of neighbor objects',
          additionalProperties: {
            type: 'array',
            items: { type: 'object' },
          },
        },
      },
    },
  })
  @HttpCode(200)
  async searchWithNeighbors(
    @Body() dto: SearchObjectsWithNeighborsDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ) {
    return this.service.searchObjectsWithNeighbors(
      dto.query,
      {
        limit: dto.limit,
        includeNeighbors: dto.includeNeighbors,
        maxNeighbors: dto.maxNeighbors,
        maxDistance: dto.maxDistance,
        projectId: dto.projectId,
        orgId: dto.orgId,
        branchId: dto.branchId,
        types: dto.types,
        labels: dto.labels,
      },
      ctx
    );
  }

  // ---------------- Embedding Policies ----------------
  @Post('embedding-policies')
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Create an embedding policy for a project and object type',
  })
  @ApiResponse({
    status: 201,
    description: 'Policy created',
    type: EmbeddingPolicyResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or duplicate policy',
  })
  async createEmbeddingPolicy(
    @Body() dto: CreateEmbeddingPolicyDto
  ): Promise<EmbeddingPolicyResponseDto> {
    return this.embeddingPolicyService.create(dto.projectId, dto);
  }

  @Get('embedding-policies')
  @Scopes('graph:read')
  @ApiOperation({ summary: 'List all embedding policies for a project' })
  @ApiQuery({
    name: 'project_id',
    required: true,
    description: 'Filter policies by project ID',
  })
  @ApiQuery({
    name: 'object_type',
    required: false,
    description: 'Filter policies by object type',
  })
  @ApiOkResponse({
    description: 'List of policies',
    type: [EmbeddingPolicyResponseDto],
  })
  async listEmbeddingPolicies(
    @Query('project_id') projectId?: string,
    @Query('object_type') objectType?: string
  ): Promise<EmbeddingPolicyResponseDto[]> {
    if (!projectId) {
      throw new BadRequestException('project_id query parameter is required');
    }
    if (objectType) {
      const policy = await this.embeddingPolicyService.findByType(
        projectId,
        objectType
      );
      return policy ? [policy] : [];
    }
    return this.embeddingPolicyService.findByProject(projectId);
  }

  @Get('embedding-policies/:id')
  @Scopes('graph:read')
  @ApiOperation({ summary: 'Get a specific embedding policy by ID' })
  @ApiQuery({
    name: 'project_id',
    required: true,
    description: 'Project ID for authorization',
  })
  @ApiOkResponse({
    description: 'Policy details',
    type: EmbeddingPolicyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  async getEmbeddingPolicy(
    @Param('id') id: string,
    @Query('project_id') projectId?: string
  ): Promise<EmbeddingPolicyResponseDto> {
    if (!projectId) {
      throw new BadRequestException('project_id query parameter is required');
    }
    const policy = await this.embeddingPolicyService.findById(id, projectId);
    if (!policy) {
      throw new NotFoundException(`Embedding policy with id ${id} not found`);
    }
    return policy;
  }

  @Patch('embedding-policies/:id')
  @Scopes('graph:write')
  @ApiOperation({ summary: 'Update an embedding policy' })
  @ApiQuery({
    name: 'project_id',
    required: true,
    description: 'Project ID for authorization',
  })
  @ApiOkResponse({
    description: 'Policy updated',
    type: EmbeddingPolicyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async updateEmbeddingPolicy(
    @Param('id') id: string,
    @Query('project_id') projectId: string,
    @Body() dto: UpdateEmbeddingPolicyDto
  ): Promise<EmbeddingPolicyResponseDto> {
    if (!projectId) {
      throw new BadRequestException('project_id query parameter is required');
    }
    const updated = await this.embeddingPolicyService.update(
      id,
      projectId,
      dto
    );
    if (!updated) {
      throw new NotFoundException(`Embedding policy with id ${id} not found`);
    }
    return updated;
  }

  @Delete('embedding-policies/:id')
  @Scopes('graph:write')
  @ApiOperation({ summary: 'Delete an embedding policy' })
  @ApiQuery({
    name: 'project_id',
    required: true,
    description: 'Project ID for authorization',
  })
  @HttpCode(204)
  @ApiResponse({ status: 204, description: 'Policy deleted' })
  @ApiResponse({ status: 404, description: 'Policy not found' })
  async deleteEmbeddingPolicy(
    @Param('id') id: string,
    @Query('project_id') projectId?: string
  ): Promise<void> {
    if (!projectId) {
      throw new BadRequestException('project_id query parameter is required');
    }
    const deleted = await this.embeddingPolicyService.delete(id, projectId);
    if (!deleted) {
      throw new NotFoundException(`Embedding policy with id ${id} not found`);
    }
  }

  // ---------------- Branch Merge (Dry-Run + Execute) ----------------
  @Post('branches/:targetBranchId/merge')
  @Scopes('graph:write')
  @ApiOperation({
    summary: 'Branch merge (dry-run or execute)',
    description:
      'Enumerate divergent canonical graph objects between source and target branches. Default is dry-run (no mutations). If `execute=true` and there are no conflicts: Added objects are cloned into target; Fast-forward objects are patched by adding only new properties (superset heuristic). Conflicts block apply. Classification statuses: added, unchanged, fast_forward, conflict.',
  })
  @ApiOkResponse({
    description:
      'Merge summary including classification counts, per-object statuses, and optional applied/applied_objects when executed',
    type: BranchMergeSummaryDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing sourceBranchId or validation error',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  @ApiResponse({
    status: 200,
    description: 'Successful dry-run or applied merge summary',
  })
  @HttpCode(200)
  async mergeDryRun(
    @Param('targetBranchId') targetBranchId: string,
    @Body() dto: BranchMergeRequestDto,
    @OptionalProjectId() ctx?: OptionalProjectContext
  ): Promise<BranchMergeSummaryDto> {
    if (!dto.sourceBranchId) {
      throw new BadRequestException('source_branch_required');
    }
    return this.service.mergeBranchDryRun(targetBranchId, dto, ctx);
  }
}
