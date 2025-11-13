import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
  NotFoundException,
  Res,
  Post,
  Body,
  Req,
  BadRequestException,
  Delete,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiOkResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { DocumentDto } from './dto/document.dto';
import { DocumentsService } from './documents.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { ApiBody } from '@nestjs/swagger';

import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

class CreateDocumentBody {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  filename?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string; // optional; fallback to any existing project

  @IsOptional()
  @IsString()
  content?: string;
}

@ApiTags('Documents')
@Controller('documents')
@UseGuards(AuthGuard, ScopesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get()
  @UseInterceptors(CachingInterceptor)
  @ApiOkResponse({
    description: 'List ingested documents',
    type: DocumentDto,
    isArray: true,
    headers: {
      'x-next-cursor': {
        description: 'Base64 cursor for next page',
        schema: { type: 'string' },
      },
    },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'number', minimum: 1, maximum: 500, default: 100 },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid filter' } },
    },
  })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Req() req?: any,
    @Res({ passthrough: true }) res?: Response
  ) {
    const n = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)
      : 100;
    const decoded = this.documents.decodeCursor(cursor);
    const orgId = (req?.headers['x-org-id'] as string | undefined) || undefined;
    const projectId =
      (req?.headers['x-project-id'] as string | undefined) || undefined;
    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id required' },
      });
    }
    const { items, nextCursor } = await this.documents.list(n, decoded, {
      orgId,
      projectId,
    });
    if (nextCursor) res?.setHeader('x-next-cursor', nextCursor);
    return items;
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get a document', type: DocumentDto })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid id' } },
    },
  })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any
  ) {
    const requestedProject =
      (req.headers['x-project-id'] as string | undefined) || undefined;
    const requestedOrg =
      (req.headers['x-org-id'] as string | undefined) || undefined;
    const doc = await this.documents.get(id);
    if (!doc)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    // Enforce scoping only if headers provided
    if (requestedProject && doc.projectId && doc.projectId !== requestedProject)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    if (requestedOrg && doc.orgId && doc.orgId !== requestedOrg)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    return doc;
  }

  @Post()
  @ApiBody({
    schema: {
      properties: {
        filename: { type: 'string' },
        projectId: { type: 'string', format: 'uuid' },
        content: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'Created document', type: DocumentDto })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async create(@Body() body: CreateDocumentBody, @Req() req: any) {
    const orgId = (req.headers['x-org-id'] as string | undefined) || undefined;
    const headerProjectId =
      (req.headers['x-project-id'] as string | undefined) || undefined;
    // New strict rule: require header project id; ignore body.projectId fallback
    if (!headerProjectId)
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id header required' },
      });
    const projectId = headerProjectId;
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4Regex.test(projectId))
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'Invalid projectId format' },
      });
    // Always validate project existence before attempting insert to avoid FK 500
    const projectOrg = await this.documents.getProjectOrg(projectId);
    if (!projectOrg)
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'Unknown projectId' },
      });
    if (orgId && projectOrg !== orgId)
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message: 'projectId does not belong to org',
        },
      });
    return this.documents.create({
      filename: body.filename,
      projectId,
      content: body.content,
      orgId,
    });
  }

  @Delete(':id')
  // Deleting documents requires documents:delete (new taxonomy)
  @Scopes('documents:delete')
  async delete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any
  ) {
    // Reuse get logic for scope enforcement
    const doc = await this.get(id, req);
    if (!doc)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    const deleted = await this.documents.delete(id);
    if (!deleted)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    return { status: 'deleted' }; // Framework will serialize; caller can treat 200/204 based on route config
  }
}
