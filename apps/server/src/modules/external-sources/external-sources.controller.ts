import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { ExternalSourcesService } from './external-sources.service';
import {
  ImportExternalSourceDto,
  TriggerSyncDto,
  UpdateExternalSourceDto,
  ImportResultDto,
  SyncResultDto,
  ExternalSourceResponseDto,
  ExternalSourceListDto,
} from './dto';

/**
 * Controller for managing external sources (Google Drive, URLs, etc.)
 *
 * All endpoints require x-project-id header for project scoping.
 */
@ApiTags('External Sources')
@Controller('external-sources')
@UseGuards(AuthGuard, ScopesGuard)
export class ExternalSourcesController {
  constructor(
    private readonly externalSourcesService: ExternalSourcesService
  ) {}

  /**
   * Import a document from an external URL
   *
   * Detects the provider type automatically (Google Drive, generic URL, etc.)
   * and fetches the content to create a document.
   */
  @Post('import')
  @ApiBody({ type: ImportExternalSourceDto })
  @ApiCreatedResponse({
    description: 'Import result',
    type: ImportResultDto,
  })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async importFromUrl(
    @Body() dto: ImportExternalSourceDto,
    @Req() req: any
  ): Promise<ImportResultDto> {
    const projectId = this.getProjectId(req);
    const result = await this.externalSourcesService.importFromUrl(
      dto,
      projectId
    );

    // Throw appropriate exceptions for error results
    if (!result.success && result.status === 'error') {
      throw new BadRequestException({
        error: {
          code: 'import-failed',
          message: result.error || 'Failed to import from URL',
        },
      });
    }

    return result;
  }

  /**
   * List external sources for the current project
   */
  @Get()
  @ApiOkResponse({
    description: 'List of external sources',
    type: ExternalSourceListDto,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of results (default: 50, max: 100)',
    schema: { type: 'number', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Pagination cursor from previous response',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
    enum: ['active', 'error', 'disabled'],
  })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: 'active' | 'error' | 'disabled',
    @Req() req?: any
  ): Promise<ExternalSourceListDto> {
    const projectId = this.getProjectId(req);
    const parsedLimit = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100)
      : 50;

    return this.externalSourcesService.list(projectId, {
      limit: parsedLimit,
      cursor,
      status,
    });
  }

  /**
   * Get a specific external source by ID
   */
  @Get(':id')
  @ApiOkResponse({
    description: 'External source details',
    type: ExternalSourceResponseDto,
  })
  @ApiParam({ name: 'id', description: 'External source UUID' })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async getById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any
  ): Promise<ExternalSourceResponseDto> {
    const projectId = this.getProjectId(req);

    const source = await this.externalSourcesService.getById(id);

    if (!source) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'External source not found' },
      });
    }

    // Verify project access
    if (source.projectId !== projectId) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'External source not found' },
      });
    }

    return source;
  }

  /**
   * Trigger a sync for an external source
   *
   * Checks for updates and fetches new content if the source has changed.
   */
  @Post(':id/sync')
  @ApiOkResponse({
    description: 'Sync result',
    type: SyncResultDto,
  })
  @ApiParam({ name: 'id', description: 'External source UUID' })
  @ApiBody({ type: TriggerSyncDto, required: false })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async triggerSync(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto?: TriggerSyncDto,
    @Req() req?: any
  ): Promise<SyncResultDto> {
    const projectId = this.getProjectId(req);

    // Verify ownership
    const source = await this.externalSourcesService.getById(id);
    if (!source || source.projectId !== projectId) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'External source not found' },
      });
    }

    return this.externalSourcesService.syncSource(id, {
      force: dto?.force ?? false,
    });
  }

  /**
   * Update an external source's settings
   */
  @Patch(':id')
  @ApiOkResponse({
    description: 'Updated external source',
    type: ExternalSourceResponseDto,
  })
  @ApiParam({ name: 'id', description: 'External source UUID' })
  @ApiBody({ type: UpdateExternalSourceDto })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateExternalSourceDto,
    @Req() req: any
  ): Promise<ExternalSourceResponseDto> {
    const projectId = this.getProjectId(req);

    // Verify ownership
    const source = await this.externalSourcesService.getById(id);
    if (!source || source.projectId !== projectId) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'External source not found' },
      });
    }

    return this.externalSourcesService.update(id, dto);
  }

  /**
   * Delete an external source
   *
   * Documents linked to this source will have their external_source_id set to null.
   */
  @Delete(':id')
  @ApiOkResponse({
    description: 'External source deleted',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'External source deleted' },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'External source UUID' })
  @ApiStandardErrors()
  @Scopes('documents:delete')
  async delete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any
  ): Promise<{ success: boolean; message: string }> {
    const projectId = this.getProjectId(req);

    // Verify ownership
    const source = await this.externalSourcesService.getById(id);
    if (!source || source.projectId !== projectId) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'External source not found' },
      });
    }

    await this.externalSourcesService.delete(id);

    return {
      success: true,
      message: 'External source deleted',
    };
  }

  /**
   * Extract project ID from request headers
   */
  private getProjectId(req: any): string {
    const projectId = req?.headers?.['x-project-id'] as string | undefined;
    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id header required' },
      });
    }

    // Validate UUID format
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4Regex.test(projectId)) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'Invalid projectId format' },
      });
    }

    return projectId;
  }
}
