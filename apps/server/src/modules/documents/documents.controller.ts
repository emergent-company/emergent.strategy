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
  Delete,
  UseGuards,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
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
import {
  RequireProjectId,
  ProjectContext,
} from '../../common/decorators/project-context.decorator';
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
import { StorageService } from '../storage/storage.service';
import { DocumentParsingJobService } from '../document-parsing/document-parsing-job.service';

import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsArray,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

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

class BulkChunkUnchunkedBody {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceTypes?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number;
}

@ApiTags('Documents')
@Controller('documents')
@UseGuards(AuthGuard, ScopesGuard)
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documents: DocumentsService,
    private readonly storageService: StorageService,
    @Inject(forwardRef(() => DocumentParsingJobService))
    private readonly parsingJobService: DocumentParsingJobService
  ) {}
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
  @ApiQuery({
    name: 'sourceType',
    required: false,
    description: 'Filter by source type (e.g., upload, email, url)',
    schema: { type: 'string' },
  })
  @ApiQuery({
    name: 'integrationId',
    required: false,
    description: 'Filter by data source integration ID',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'rootOnly',
    required: false,
    description: 'If true, only return root documents (no parent)',
    schema: { type: 'boolean', default: false },
  })
  @ApiQuery({
    name: 'parentDocumentId',
    required: false,
    description:
      'Filter by parent document ID (get children of a specific document)',
    schema: { type: 'string', format: 'uuid' },
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
    @Query('sourceType') sourceType?: string,
    @Query('integrationId') integrationId?: string,
    @Query('rootOnly') rootOnly?: string,
    @Query('parentDocumentId') parentDocumentId?: string,
    @RequireProjectId() ctx?: ProjectContext,
    @Res({ passthrough: true }) res?: Response
  ) {
    const n = limit
      ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500)
      : 100;
    const decoded = this.documents.decodeCursor(cursor);
    const { items, nextCursor, total } = await this.documents.list(n, decoded, {
      projectId: ctx!.projectId,
      sourceType,
      dataSourceIntegrationId: integrationId,
      rootOnly: rootOnly === 'true',
      parentDocumentId,
    });
    if (nextCursor) res?.setHeader('x-next-cursor', nextCursor);
    return { documents: items, total, next_cursor: nextCursor };
  }

  @Get('source-types')
  @UseInterceptors(CachingInterceptor)
  @ApiOkResponse({
    description: 'Get distinct source types with document counts',
    schema: {
      type: 'object',
      properties: {
        sourceTypes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sourceType: { type: 'string', example: 'email' },
              count: { type: 'number', example: 42 },
              dataSourceIntegrationId: {
                type: 'string',
                format: 'uuid',
                nullable: true,
              },
              integrationName: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async getSourceTypes(@RequireProjectId() ctx: ProjectContext) {
    const sourceTypes = await this.documents.getSourceTypesWithCounts(
      ctx.projectId
    );
    return { sourceTypes };
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
    @RequireProjectId() ctx: ProjectContext
  ) {
    const doc = await this.documents.get(id, {
      projectId: ctx.projectId,
    });
    if (!doc)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    // Authorization is now enforced by RLS policies via derived org ID
    return doc;
  }

  /**
   * Get just the content of a document.
   * Useful for lazy loading content in UIs without fetching full document metadata.
   */
  @Get(':id/content')
  @ApiOkResponse({
    description: 'Get document content',
    schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          nullable: true,
          description: 'The text content of the document',
        },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async getContent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    const result = await this.documents.getContent(id, {
      projectId: ctx.projectId,
    });
    if (!result)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    return result;
  }

  /**
   * Download the original file for a document.
   * Returns a redirect to a signed URL for the file in storage.
   */
  @Get(':id/download')
  @ApiOkResponse({
    description: 'Redirect to signed download URL for original file',
  })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async downloadFile(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Res() res: Response
  ) {
    // Get document with storage info
    const doc = await this.documents.getWithStorageInfo(id, {
      projectId: ctx.projectId,
    });

    if (!doc) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    }

    if (!doc.storageKey) {
      throw new NotFoundException({
        error: {
          code: 'not-found',
          message: 'No original file stored for this document',
        },
      });
    }

    // Generate signed URL for download
    const signedUrl = await this.storageService.getSignedDownloadUrl(
      doc.storageKey,
      {
        expiresIn: 3600, // 1 hour
        responseContentDisposition: doc.filename
          ? `attachment; filename="${doc.filename}"`
          : undefined,
      }
    );

    this.logger.debug(`Download redirect for document ${id} to ${signedUrl}`);

    // Redirect to signed URL
    return res.redirect(signedUrl);
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
  async create(
    @Body() body: CreateDocumentBody,
    @RequireProjectId() ctx: ProjectContext
  ) {
    const projectId = ctx.projectId;
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidV4Regex.test(projectId))
      throw new NotFoundException({
        error: { code: 'bad-request', message: 'Invalid projectId format' },
      });
    // Always validate project existence before attempting insert to avoid FK 500
    const projectOrg = await this.documents.getProjectOrg(projectId);
    if (!projectOrg)
      throw new NotFoundException({
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
    @RequireProjectId() ctx: ProjectContext
  ) {
    // Get document first for scope enforcement (RLS enforces project isolation)
    const doc = await this.documents.get(id, {
      projectId: ctx.projectId,
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
    @RequireProjectId() ctx: ProjectContext
  ) {
    // Filter to only documents accessible by this project (RLS enforces isolation)
    const accessibleIds: string[] = [];
    for (const id of body.ids) {
      const doc = await this.documents.get(id, {
        projectId: ctx.projectId,
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
    @RequireProjectId() ctx: ProjectContext
  ) {
    // Reuse get logic for scope enforcement
    const doc = await this.get(id, ctx);
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
  async bulkDelete(
    @Body() body: BulkDeleteRequestDto,
    @RequireProjectId() ctx: ProjectContext
  ) {
    // Filter to only documents accessible by this project (RLS enforces isolation)
    const accessibleIds: string[] = [];
    for (const id of body.ids) {
      const doc = await this.documents.get(id, {
        projectId: ctx.projectId,
      });
      if (doc) {
        accessibleIds.push(id);
      }
    }

    if (accessibleIds.length === 0) {
      throw new NotFoundException({
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
    @RequireProjectId() ctx: ProjectContext
  ) {
    // Get document first for scope enforcement
    const doc = await this.get(id, ctx);
    if (!doc)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });

    // Recreate chunks
    return await this.documents.recreateChunks(id);
  }

  @Post(':id/retry-conversion')
  @ApiOkResponse({
    description: 'Retry document conversion for a failed or pending document',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        jobId: { type: 'string', format: 'uuid' },
        message: { type: 'string', example: 'Conversion retry started' },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async retryConversion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    // Get document with storage info for scope enforcement
    const doc = await this.documents.getWithStorageInfo(id, {
      projectId: ctx.projectId,
    });

    if (!doc) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    }

    // Verify document has a conversion status that can be retried
    // Allow: failed, pending (for stuck documents without jobs)
    const retriableStatuses = ['failed', 'pending'];
    if (!retriableStatuses.includes(doc.conversionStatus || '')) {
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message: `Cannot retry conversion: document status is "${
            doc.conversionStatus
          }", expected one of: ${retriableStatuses.join(', ')}`,
        },
      });
    }

    // Verify document has a storage key (original file)
    if (!doc.storageKey) {
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message:
            'Cannot retry conversion: no original file stored for this document',
        },
      });
    }

    // Cancel any existing pending/processing jobs for this document
    await this.parsingJobService.cancelJobsForDocument(id);

    // Reset conversion status to pending
    await this.documents.resetConversionStatus(id);

    // Get organization ID from project
    const organizationId = await this.documents.getProjectOrg(ctx.projectId);
    if (!organizationId) {
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message: 'Cannot determine organization for project',
        },
      });
    }

    // Create new parsing job for this document
    const job = await this.parsingJobService.createJob({
      storageKey: doc.storageKey,
      sourceFilename: doc.filename || 'document',
      sourceType: 'upload', // Retry always treats as uploaded file
      mimeType: doc.mimeType || 'application/octet-stream',
      fileSizeBytes: doc.fileSizeBytes || 0,
      projectId: ctx.projectId,
      organizationId,
      documentId: id, // Link to existing document
      maxRetries: 0, // No automatic retries - user can manually retry via UI
    });

    this.logger.log(
      `Retry conversion started for document ${id}, job ${job.id}`
    );

    return {
      success: true,
      jobId: job.id,
      message: 'Conversion retry started',
    };
  }

  @Post(':id/cancel-conversion')
  @ApiOkResponse({
    description: 'Cancel document conversion for a pending/processing document',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        cancelledJobs: { type: 'number', example: 1 },
        message: { type: 'string', example: 'Conversion cancelled' },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async cancelConversion(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    // Get document for scope enforcement
    const doc = await this.documents.getWithStorageInfo(id, {
      projectId: ctx.projectId,
    });

    if (!doc) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Document not found' },
      });
    }

    // Verify document has a conversion status that can be cancelled
    const cancellableStatuses = ['pending', 'processing'];
    if (!cancellableStatuses.includes(doc.conversionStatus || '')) {
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message: `Cannot cancel conversion: document status is "${
            doc.conversionStatus
          }", expected one of: ${cancellableStatuses.join(', ')}`,
        },
      });
    }

    // Cancel any pending/processing jobs for this document
    const cancelledJobs = await this.parsingJobService.cancelJobsForDocument(
      id
    );

    // Update document status to failed (or not_required if no file)
    if (doc.storageKey) {
      await this.documents.markConversionFailed(id, 'Cancelled by user');
    } else {
      await this.documents.markConversionNotRequired(id);
    }

    this.logger.log(
      `Conversion cancelled for document ${id}, ${cancelledJobs} jobs cancelled`
    );

    return {
      success: true,
      cancelledJobs,
      message: 'Conversion cancelled',
    };
  }

  @Get('unchunked')
  @ApiOkResponse({
    description: 'List documents that have content but no chunks',
    schema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              filename: { type: 'string' },
              sourceType: { type: 'string' },
            },
          },
        },
        total: { type: 'number' },
      },
    },
  })
  @ApiQuery({
    name: 'sourceTypes',
    required: false,
    description: 'Filter by source types (comma-separated, e.g., email,drive)',
    schema: { type: 'string' },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of documents to return',
    schema: { type: 'number', minimum: 1, maximum: 500, default: 100 },
  })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async listUnchunkedDocuments(
    @RequireProjectId() ctx: ProjectContext,
    @Query('sourceTypes') sourceTypesStr?: string,
    @Query('limit') limitStr?: string
  ) {
    const sourceTypes = sourceTypesStr
      ? sourceTypesStr.split(',').map((s) => s.trim())
      : undefined;
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    const documents = await this.documents.findUnchunkedDocuments(
      ctx.projectId,
      { sourceTypes, limit }
    );

    return {
      documents,
      total: documents.length,
    };
  }

  @Post('bulk-chunk-unchunked')
  @ApiOkResponse({
    description: 'Create chunks for documents that have content but no chunks',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', description: 'Total documents processed' },
        successful: { type: 'number', description: 'Successfully chunked' },
        failed: { type: 'number', description: 'Failed to chunk' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              documentId: { type: 'string', format: 'uuid' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiBody({ type: BulkChunkUnchunkedBody })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async bulkChunkUnchunked(
    @RequireProjectId() ctx: ProjectContext,
    @Body() body: BulkChunkUnchunkedBody
  ) {
    // Find unchunked documents
    const documents = await this.documents.findUnchunkedDocuments(
      ctx.projectId,
      {
        sourceTypes: body.sourceTypes,
        limit: body.limit || 100,
      }
    );

    if (documents.length === 0) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        errors: [],
        message: 'No unchunked documents found',
      };
    }

    this.logger.log(
      `Starting bulk chunking of ${documents.length} unchunked documents for project ${ctx.projectId}`
    );

    // Process documents
    const result = await this.documents.bulkRecreateChunks(
      documents.map((d) => d.id)
    );

    return {
      ...result,
      message: `Processed ${result.total} documents: ${result.successful} successful, ${result.failed} failed`,
    };
  }
}
