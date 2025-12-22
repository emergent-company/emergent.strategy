import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  NotFoundException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import {
  RequireProjectId,
  ProjectContext,
} from '../../common/decorators/project-context.decorator';
import { CreateProductVersionDto } from './dto/create-product-version.dto';
import { ProductVersionService } from './product-version.service';

@ApiTags('Product Versions')
@Controller('product-versions')
@UseGuards(AuthGuard, ScopesGuard)
export class ProductVersionController {
  constructor(private readonly svc: ProductVersionService) {}

  @Post()
  @Scopes('graph:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOkResponse({
    description: 'Create product version snapshot',
    schema: {
      example: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'v1.0.0',
        member_count: 42,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Name exists',
    schema: {
      example: {
        error: {
          code: 'product_version_name_exists',
          message: 'Name already exists',
        },
      },
    },
  })
  async create(
    @Body() body: CreateProductVersionDto,
    @RequireProjectId() ctx: ProjectContext
  ) {
    return this.svc.create(ctx.projectId, body);
  }

  @Get()
  @Scopes('graph:read')
  @ApiOkResponse({
    description: 'List product version snapshots for a project',
    schema: {
      example: {
        items: [
          {
            id: '...',
            name: 'v1.0.0',
            description: null,
            created_at: '2025-01-01T00:00:00Z',
            member_count: 42,
            base_product_version_id: null,
          },
        ],
        next_cursor: '2025-01-01T00:00:00Z',
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
    description:
      'Pagination cursor (created_at timestamp of last item from previous page)',
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
  @ApiOkResponse({ description: 'Get product version snapshot' })
  async get(@Param('id') id: string, @RequireProjectId() ctx: ProjectContext) {
    const pv = await this.svc.get(ctx.projectId, id);
    if (!pv)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'snapshot not found' },
      });
    return pv;
  }

  @Get(':id/diff/:otherId')
  @Scopes('graph:read')
  @ApiOkResponse({
    description: 'Diff two product version snapshots',
    schema: {
      example: {
        items: [
          {
            canonical_id: '...',
            change_type: 'modified',
            version_a_object_id: '...',
            version_b_object_id: '...',
          },
        ],
        meta: { added: 5, removed: 2, modified: 10, unchanged: 100 },
      },
    },
  })
  async diff(
    @Param('id') id: string,
    @Param('otherId') otherId: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    return this.svc.diffReleases(ctx.projectId, id, otherId);
  }
}
