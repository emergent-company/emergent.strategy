import {
  Controller,
  Get,
  Delete,
  UseInterceptors,
  Query,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ChunkDto } from './dto/chunk.dto';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import {
  ChunksService,
  BulkDocumentChunksDeletionSummary,
  DocumentChunksDeletionResult,
} from './chunks.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { RequireProjectId, ProjectContext } from '../../common/decorators';

@ApiTags('Chunks')
@Controller('chunks')
@UseGuards(AuthGuard, ScopesGuard)
export class ChunksController {
  constructor(private readonly chunks: ChunksService) {}
  @Get()
  @UseInterceptors(CachingInterceptor)
  @ApiOkResponse({ description: 'List chunks', type: ChunkDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid filter' } },
    },
  })
  @ApiQuery({
    name: 'documentId',
    required: false,
    description: 'Filter by document UUID',
  })
  @ApiStandardErrors()
  // Chunk listing requires explicit chunks:read scope
  @Scopes('chunks:read')
  list(
    @Query('documentId', new ParseUUIDPipe({ version: '4', optional: true }))
    documentId?: string,
    @RequireProjectId() ctx?: ProjectContext
  ) {
    return this.chunks.list(documentId, ctx!.projectId);
  }

  @Delete(':id')
  @ApiOkResponse({
    description: 'Chunk deleted successfully',
    schema: {
      example: { success: true },
    },
  })
  @ApiNotFoundResponse({
    description: 'Chunk not found',
    schema: {
      example: { error: { code: 'not-found', message: 'Chunk not found' } },
    },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid chunk ID' } },
    },
  })
  @ApiParam({ name: 'id', description: 'Chunk UUID' })
  @ApiStandardErrors()
  @Scopes('chunks:write')
  async delete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    await this.chunks.delete(id, ctx.projectId);
    return { success: true };
  }

  @Delete()
  @ApiOkResponse({
    description: 'Bulk delete chunks',
    schema: {
      example: {
        totalDeleted: 3,
        totalFailed: 0,
        results: [
          { chunkId: 'uuid-1', success: true },
          { chunkId: 'uuid-2', success: true },
          { chunkId: 'uuid-3', success: true },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: {
        error: { code: 'bad-request', message: 'ids array is required' },
      },
    },
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of chunk UUIDs to delete',
        },
      },
      required: ['ids'],
    },
  })
  @ApiStandardErrors()
  @Scopes('chunks:write')
  async bulkDelete(
    @Body() body: { ids: string[] },
    @RequireProjectId() ctx: ProjectContext
  ) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'ids array is required' },
      });
    }
    return this.chunks.bulkDelete(body.ids, ctx.projectId);
  }

  @Delete('by-document/:documentId')
  @ApiOkResponse({
    description: 'Delete all chunks for a document',
    schema: {
      example: {
        documentId: 'uuid',
        documentTitle: 'document.pdf',
        chunksDeleted: 15,
        success: true,
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Document not found',
    schema: {
      example: { error: { code: 'not-found', message: 'Document not found' } },
    },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: {
        error: { code: 'bad-request', message: 'Invalid document ID' },
      },
    },
  })
  @ApiParam({ name: 'documentId', description: 'Document UUID' })
  @ApiStandardErrors()
  @Scopes('chunks:write')
  async deleteByDocument(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<DocumentChunksDeletionResult> {
    return this.chunks.deleteByDocument(documentId, ctx.projectId);
  }

  @Delete('by-documents')
  @ApiOkResponse({
    description: 'Delete all chunks for multiple documents',
    schema: {
      example: {
        totalDocuments: 2,
        totalChunksDeleted: 30,
        totalFailed: 0,
        results: [
          {
            documentId: 'uuid-1',
            documentTitle: 'doc1.pdf',
            chunksDeleted: 15,
            success: true,
          },
          {
            documentId: 'uuid-2',
            documentTitle: 'doc2.pdf',
            chunksDeleted: 15,
            success: true,
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: {
        error: {
          code: 'bad-request',
          message: 'documentIds array is required',
        },
      },
    },
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentIds: {
          type: 'array',
          items: { type: 'string', format: 'uuid' },
          description: 'Array of document UUIDs to delete chunks for',
        },
      },
      required: ['documentIds'],
    },
  })
  @ApiStandardErrors()
  @Scopes('chunks:write')
  async bulkDeleteByDocuments(
    @Body() body: { documentIds: string[] },
    @RequireProjectId() ctx: ProjectContext
  ): Promise<BulkDocumentChunksDeletionSummary> {
    if (
      !body.documentIds ||
      !Array.isArray(body.documentIds) ||
      body.documentIds.length === 0
    ) {
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message: 'documentIds array is required',
        },
      });
    }
    return this.chunks.bulkDeleteByDocuments(body.documentIds, ctx.projectId);
  }
}
