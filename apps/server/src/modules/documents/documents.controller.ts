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
import {
  DeletionImpactDto,
  BulkDeletionImpactDto,
} from './dto/deletion-impact.dto';
import { BulkDeleteRequestDto } from './dto/bulk-delete-request.dto';
import {
  DeletionSummaryDto,
  BulkDeletionSummaryDto,
} from './dto/deletion-summary.dto';

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
    const projectId =
      (req?.headers['x-project-id'] as string | undefined) || undefined;
    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id required' },
      });
    }
    const { items, nextCursor, total } = await this.documents.list(n, decoded, {
      projectId,
    });
    if (nextCursor) res?.setHeader('x-next-cursor', nextCursor);
    return { documents: items, total, next_cursor: nextCursor };
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
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || undefined;
    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id required' },
      });
    }
    const doc = await this.documents.get(id, {
      projectId,
    });
    if (!doc)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    // Authorization is now enforced by RLS policies via derived org ID
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
    // No longer need to validate orgId match - derived automatically
    return this.documents.create({
      filename: body.filename,
      projectId,
      content: body.content,
    });
  }

  @Get(':id/deletion-impact')
  @ApiOkResponse({
    description: 'Get deletion impact analysis for a document',
    type: DeletionImpactDto,
  })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiStandardErrors()
  @Scopes('documents:delete')
  async getDeletionImpact(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any
  ) {
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || undefined;
    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id required' },
      });
    }

    // Get document first for scope enforcement (RLS enforces project isolation)
    const doc = await this.documents.get(id, {
      projectId,
    });
    if (!doc)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });

    // Get impact analysis
    const impact = await this.documents.getDeletionImpact(id);
    if (!impact)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });

    return impact;
  }

  @Post('deletion-impact')
  @ApiBody({ type: BulkDeleteRequestDto })
  @ApiOkResponse({
    description: 'Get bulk deletion impact analysis',
    type: BulkDeletionImpactDto,
  })
  @ApiStandardErrors()
  @Scopes('documents:delete')
  async getBulkDeletionImpact(
    @Body() body: BulkDeleteRequestDto,
    @Req() req: any
  ) {
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || undefined;
    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id required' },
      });
    }

    // Filter to only documents accessible by this project (RLS enforces isolation)
    const accessibleIds: string[] = [];
    for (const id of body.ids) {
      const doc = await this.documents.get(id, {
        projectId,
      });
      if (doc) {
        accessibleIds.push(id);
      }
    }

    return await this.documents.getBulkDeletionImpact(accessibleIds);
  }

  @Delete(':id')
  // Deleting documents requires documents:delete (new taxonomy)
  @ApiOkResponse({
    description: 'Delete a document with cascade',
    type: DeletionSummaryDto,
  })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiStandardErrors()
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

    // Use cascade deletion
    const result = await this.documents.deleteWithCascade(id);
    return result;
  }

  @Delete()
  @ApiBody({ type: BulkDeleteRequestDto })
  @ApiOkResponse({
    description: 'Bulk delete documents with cascade',
    type: BulkDeletionSummaryDto,
  })
  @ApiStandardErrors()
  @Scopes('documents:delete')
  async bulkDelete(@Body() body: BulkDeleteRequestDto, @Req() req: any) {
    const projectId =
      (req.headers['x-project-id'] as string | undefined) || undefined;
    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id required' },
      });
    }

    // Filter to only documents accessible by this project (RLS enforces isolation)
    const accessibleIds: string[] = [];
    for (const id of body.ids) {
      const doc = await this.documents.get(id, {
        projectId,
      });
      if (doc) {
        accessibleIds.push(id);
      }
    }

    if (accessibleIds.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message: 'No accessible documents found',
        },
      });
    }

    return await this.documents.bulkDeleteWithCascade(accessibleIds);
  }

  @Post(':id/recreate-chunks')
  @ApiOkResponse({
    description: 'Recreate chunks for a document using project chunking config',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'success' },
        summary: {
          type: 'object',
          properties: {
            oldChunks: { type: 'number', example: 5 },
            newChunks: { type: 'number', example: 7 },
            strategy: { type: 'string', example: 'sentence' },
            config: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async recreateChunks(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any
  ) {
    // Get document first for scope enforcement
    const doc = await this.get(id, req);
    if (!doc)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });

    // Recreate chunks
    return await this.documents.recreateChunks(id);
  }
}
