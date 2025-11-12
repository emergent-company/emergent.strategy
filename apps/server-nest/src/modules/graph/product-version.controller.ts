import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
  HttpStatus,
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
import { CreateProductVersionDto } from './dto/create-product-version.dto';
import { ProductVersionService } from './product-version.service';
import type { Response } from 'express';

@ApiTags('Product Versions')
@Controller('product-versions')
@UseGuards(AuthGuard, ScopesGuard)
export class ProductVersionController {
  constructor(private readonly svc: ProductVersionService) {}

  @Post()
  @Scopes('graph:write')
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
    @Req() req: any,
    @Res() res: Response
  ) {
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!projectId)
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id header required' },
      });
    const created = await this.svc.create(projectId, body);
    return res.status(HttpStatus.CREATED).json(created);
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
    @Req() req: any,
    @Res() res: Response
  ) {
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!projectId)
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id header required' },
      });
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const result = await this.svc.list(projectId, { limit, cursor });
    return res.json(result);
  }

  @Get(':id')
  @Scopes('graph:read')
  @ApiOkResponse({ description: 'Get product version snapshot' })
  async get(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!projectId)
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id header required' },
      });
    const pv = await this.svc.get(projectId, id);
    if (!pv)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'snapshot not found' },
      });
    return res.json(pv);
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
    @Req() req: any,
    @Res() res: Response
  ) {
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || null;
    if (!projectId)
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id header required' },
      });
    const diff = await this.svc.diffReleases(projectId, id, otherId);
    return res.json(diff);
  }
}
