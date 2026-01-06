import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  Res,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

// Local minimal file type to avoid reliance on Express.Multer global type
// which may not be picked up by TS in strict build
interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}
import {
  ApiTags,
  ApiOkResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import {
  RequireProjectId,
  ProjectContext,
} from '../../common/decorators/project-context.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { DocumentParsingJobService } from './document-parsing-job.service';
import { StorageService } from '../storage/storage.service';
import { AppConfigService } from '../../common/config/config.service';
import { DocumentsService } from '../documents/documents.service';
import { HashService } from '../../common/utils/hash.service';
import {
  DocumentParsingJobResponseDto,
  ListDocumentParsingJobsQueryDto,
  DocumentUploadResponseDto,
} from './dto';
import { shouldUseKreuzberg } from './interfaces';

/**
 * Map entity to response DTO
 */
function toResponseDto(job: any): DocumentParsingJobResponseDto {
  return {
    id: job.id,
    organizationId: job.organizationId,
    projectId: job.projectId,
    status: job.status,
    sourceType: job.sourceType,
    sourceFilename: job.sourceFilename,
    mimeType: job.mimeType,
    fileSizeBytes: job.fileSizeBytes,
    documentId: job.documentId,
    errorMessage: job.errorMessage,
    retryCount: job.retryCount,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    updatedAt: job.updatedAt,
  };
}

@ApiTags('Document Parsing')
@Controller('document-parsing-jobs')
@UseGuards(AuthGuard, ScopesGuard)
export class DocumentParsingController {
  private readonly logger = new Logger(DocumentParsingController.name);

  constructor(
    private readonly parsingJobService: DocumentParsingJobService,
    private readonly storageService: StorageService,
    private readonly config: AppConfigService,
    private readonly documentsService: DocumentsService,
    private readonly hashService: HashService
  ) {}

  /**
   * Upload a document for parsing.
   * Uses document-first architecture:
   * 1. Document is created immediately and visible to user
   * 2. Parsing/conversion happens asynchronously
   * 3. User can see and retry failed conversions
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Document file to upload and parse',
        },
        autoExtract: {
          type: 'boolean',
          description: 'Automatically trigger object extraction after parsing',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Document uploaded (parsing job created if conversion needed)',
    type: DocumentUploadResponseDto,
  })
  @ApiStandardErrors()
  @Scopes('documents:write')
  async uploadDocument(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: 100 * 1024 * 1024, // 100MB max
          }),
        ],
        fileIsRequired: true,
      })
    )
    file: UploadedMulterFile,
    @Body('autoExtract') autoExtract: string,
    @RequireProjectId() ctx: ProjectContext
  ): Promise<DocumentUploadResponseDto> {
    // Check if document parsing is enabled
    if (!this.config.kreuzbergEnabled && !this.config.storageEnabled) {
      throw new BadRequestException({
        error: {
          code: 'service-unavailable',
          message: 'Document parsing service is not enabled',
        },
      });
    }

    const projectId = ctx.projectId;

    // Derive org ID from project (frontend no longer sends X-Org-ID header)
    const orgId = await this.parsingJobService.getProjectOrg(projectId);

    if (!orgId) {
      throw new BadRequestException({
        error: {
          code: 'bad-request',
          message: 'Unknown project ID or organization',
        },
      });
    }

    // Determine if file needs Kreuzberg processing (conversion)
    const mimeType = file.mimetype;
    const filename = file.originalname;
    const requiresConversion = shouldUseKreuzberg(mimeType, filename);

    // Calculate file hash for duplicate detection
    const fileHash = this.hashService.sha256Buffer(file.buffer);

    this.logger.log(
      `Upload: ${filename} (${mimeType}, ${file.size} bytes, conversion: ${requiresConversion})`
    );

    // Step 1: Upload file to storage
    let storageKey: string | null = null;
    if (this.config.storageEnabled) {
      const uploadResult = await this.storageService.uploadDocument(
        file.buffer,
        {
          orgId,
          projectId,
          filename,
          contentType: mimeType,
        }
      );
      storageKey = uploadResult.key;
      this.logger.debug(`File stored: ${storageKey}`);
    }

    if (!storageKey) {
      throw new BadRequestException({
        error: {
          code: 'storage-error',
          message: 'Failed to store file',
        },
      });
    }

    // Step 2: Create document FIRST (document-first architecture)
    const createResult = await this.documentsService.createFromUpload({
      projectId,
      storageKey,
      filename,
      mimeType,
      fileSizeBytes: file.size,
      fileHash,
      requiresConversion,
    });

    // If duplicate, return existing document info
    if (createResult.isDuplicate) {
      this.logger.log(
        `Duplicate file detected: ${createResult.existingDocumentId} (${filename})`
      );
      return {
        document: {
          id: createResult.document.id,
          name: createResult.document.name,
          mimeType: createResult.document.mimeType,
          fileSizeBytes: createResult.document.fileSizeBytes,
          conversionStatus: createResult.document.conversionStatus || 'unknown',
          conversionError: createResult.document.conversionError,
          storageKey: createResult.document.storageKey,
          createdAt: createResult.document.createdAt,
        },
        isDuplicate: true,
        existingDocumentId: createResult.existingDocumentId,
      };
    }

    // Step 3: Create parsing job if conversion is required
    let parsingJob: DocumentParsingJobResponseDto | undefined;
    if (requiresConversion) {
      const job = await this.parsingJobService.createJob({
        organizationId: orgId,
        projectId,
        sourceType: 'upload',
        sourceFilename: filename,
        mimeType,
        fileSizeBytes: file.size,
        storageKey,
        documentId: createResult.document.id, // Link to document
        maxRetries: 0, // No automatic retries - user can manually retry via UI
        metadata: {
          autoExtract: autoExtract === 'true',
          needsKreuzberg: true,
          uploadedAt: new Date().toISOString(),
        },
      });

      this.logger.log(
        `Created parsing job ${job.id} for document ${createResult.document.id}`
      );
      parsingJob = toResponseDto(job);
    } else {
      // For plain text files, read content directly and update document
      const content = file.buffer.toString('utf-8');
      const contentHash = this.hashService.sha256(content);

      await this.documentsService.updateConversionStatus(
        createResult.document.id,
        'completed',
        {
          content,
          contentHash,
          metadata: {
            parsedAt: new Date().toISOString(),
            sourceType: 'direct-read',
          },
        }
      );

      // Create chunks and queue embedding jobs (same as conversion flow)
      try {
        const chunkResult = await this.documentsService.recreateChunks(
          createResult.document.id
        );
        this.logger.log(
          `Plain text file - document ${createResult.document.id} ready ` +
            `(${content.length} chars, ${chunkResult.summary.newChunks} chunks created)`
        );
      } catch (chunkError) {
        this.logger.error(
          `Failed to create chunks for plain text document ${
            createResult.document.id
          }: ${(chunkError as Error).message}`
        );
        // Don't fail - document has content, just no chunks yet
      }
    }

    return {
      document: {
        id: createResult.document.id,
        name: createResult.document.name,
        mimeType: createResult.document.mimeType,
        fileSizeBytes: createResult.document.fileSizeBytes,
        conversionStatus: requiresConversion ? 'pending' : 'completed',
        conversionError: null,
        storageKey: createResult.document.storageKey,
        createdAt: createResult.document.createdAt,
      },
      isDuplicate: false,
      parsingJob,
    };
  }

  /**
   * Get a document parsing job by ID.
   */
  @Get(':id')
  @ApiOkResponse({
    description: 'Document parsing job details',
    type: DocumentParsingJobResponseDto,
  })
  @ApiParam({ name: 'id', description: 'Parsing job UUID' })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async getJob(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext
  ) {
    const job = await this.parsingJobService.findById(id);

    if (!job) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Parsing job not found' },
      });
    }

    // Verify project access
    if (job.projectId !== ctx.projectId) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Parsing job not found' },
      });
    }

    return toResponseDto(job);
  }

  /**
   * List document parsing jobs with optional filtering.
   */
  @Get()
  @ApiOkResponse({
    description: 'List of document parsing jobs',
    type: [DocumentParsingJobResponseDto],
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async listJobs(
    @Query() query: ListDocumentParsingJobsQueryDto,
    @RequireProjectId() ctx: ProjectContext
  ) {
    const projectId = ctx.projectId;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    let jobs;
    if (query.status) {
      jobs = await this.parsingJobService.findByStatus(query.status, limit);
      // Filter by project
      jobs = jobs.filter((j) => j.projectId === projectId);
    } else {
      jobs = await this.parsingJobService.findByProject(
        projectId,
        limit,
        offset
      );
    }

    return {
      jobs: jobs.map(toResponseDto),
      total: jobs.length,
      limit,
      offset,
    };
  }

  /**
   * Download the original file from a parsing job.
   */
  @Get(':id/download')
  @ApiOkResponse({
    description: 'Redirect to signed download URL',
  })
  @ApiParam({ name: 'id', description: 'Parsing job UUID' })
  @ApiStandardErrors()
  @Scopes('documents:read')
  async downloadFile(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @RequireProjectId() ctx: ProjectContext,
    @Res() res: Response
  ) {
    const job = await this.parsingJobService.findById(id);

    if (!job) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Parsing job not found' },
      });
    }

    // Verify project access
    if (job.projectId !== ctx.projectId) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Parsing job not found' },
      });
    }

    if (!job.storageKey) {
      throw new NotFoundException({
        error: { code: 'not-found', message: 'No file stored for this job' },
      });
    }

    // Generate signed URL for download
    const signedUrl = await this.storageService.getSignedDownloadUrl(
      job.storageKey,
      {
        expiresIn: 3600, // 1 hour
        responseContentDisposition: job.sourceFilename
          ? `attachment; filename="${job.sourceFilename}"`
          : undefined,
      }
    );

    // Redirect to signed URL
    return res.redirect(signedUrl);
  }
}
