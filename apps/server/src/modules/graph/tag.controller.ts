import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  NotFoundException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import {
  RequireProjectId,
  ProjectContext,
} from '../../common/decorators/project-context.decorator';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagService } from './tag.service';

@ApiTags('Tags')
@Controller('tags')
@UseGuards(AuthGuard, ScopesGuard)
export class TagController {
  constructor(private readonly svc: TagService) {}

  @Post()
  @Scopes('graph:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description: 'Create tag',
    schema: {
      example: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'stable',
        product_version_id: '22222222-2222-4222-8222-222222222222',
        description: 'Stable release',
        created_at: '2025-09-30T00:00:00Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Tag name exists or product version not found',
    schema: {
      example: {
        error: { code: 'tag_name_exists', message: 'Tag name already exists' },
      },
    },
  })
  async create(
    @Body() body: CreateTagDto,
    @RequireProjectId() ctx: ProjectContext
  ) {
    return this.svc.create(ctx.projectId, body);
  }

  @Get()
  @Scopes('graph:read')
  @ApiOkResponse({
    description: 'List tags for a project',
    schema: {
      example: {
        items: [
          {
            id: '...',
            name: 'stable',
            product_version_id: '...',
            description: null,
            created_at: '2025-09-30T00:00:00Z',
          },
        ],
        next_cursor: '2025-09-30T00:00:00Z',
      },
    },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (1-100, default 20)',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Pagination cursor (created_at timestamp)',
  })
  async list(
    @Query('limit') limitStr: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @RequireProjectId() ctx: ProjectContext
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    return this.svc.list(ctx.projectId, { limit, cursor });
  }

  @Get(':id')
  @Scopes('graph:read')
  @ApiOkResponse({ description: 'Get tag by ID' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async get(@Param('id') id: string, @RequireProjectId() ctx: ProjectContext) {
    const tag = await this.svc.get(ctx.projectId, id);
    if (!tag)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'tag not found' },
      });
    return tag;
  }

  @Get('by-name/:name')
  @Scopes('graph:read')
  @ApiOkResponse({ description: 'Get tag by name' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async getByName(
    @Param('name') name: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    const tag = await this.svc.getByName(ctx.projectId, name);
    if (!tag)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'tag not found' },
      });
    return tag;
  }

  @Put(':id')
  @Scopes('graph:write')
  @ApiOkResponse({ description: 'Update tag' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateTagDto,
    @RequireProjectId() ctx: ProjectContext
  ) {
    return this.svc.update(ctx.projectId, id, body);
  }

  @Delete(':id')
  @Scopes('graph:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Tag deleted' })
  @ApiNotFoundResponse({ description: 'Tag not found' })
  async delete(
    @Param('id') id: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    await this.svc.delete(ctx.projectId, id);
  }
}
