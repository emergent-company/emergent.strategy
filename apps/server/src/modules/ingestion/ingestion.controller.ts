import {
  Controller,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
// Local minimal file type to avoid reliance on Express.Multer global type which may not be picked up by TS in strict build.
interface UploadedMulterFile {
  originalname?: string;
  mimetype?: string;
  buffer: Buffer;
}
import {
  ApiBody,
  ApiOkResponse,
  ApiTags,
  ApiProperty,
  ApiBadRequestResponse,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import {
  IsString,
  IsUrl,
  IsOptional,
  IsDefined,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  IngestionService,
  IngestResult,
  BatchUploadResult,
} from './ingestion.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import {
  ChunkingOptionsDto,
  ChunkingStrategyDto,
  CHUNKING_STRATEGIES,
} from './dto/chunking-options.dto';

export class IngestionUploadDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description:
      'Original filename (optional, will fallback to uploaded file name)',
    required: false,
    example: 'spec.md',
  })
  filename?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional MIME type',
    required: false,
    example: 'text/markdown',
  })
  mimeType?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional organisation UUID to associate the document with',
    required: false,
    example: '11111111-2222-3333-4444-555555555555',
  })
  orgId?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Project UUID that this document belongs to (required)',
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  })
  projectId!: string;

  @IsOptional()
  @IsString()
  @IsIn(CHUNKING_STRATEGIES)
  @ApiProperty({
    description:
      'Chunking strategy for splitting text into chunks. Options: character (default), sentence, paragraph',
    required: false,
    enum: CHUNKING_STRATEGIES,
    default: 'character',
    example: 'sentence',
  })
  chunkingStrategy?: ChunkingStrategyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChunkingOptionsDto)
  @ApiProperty({
    description: 'Configuration options for the chunking strategy',
    required: false,
    type: ChunkingOptionsDto,
  })
  chunkingOptions?: ChunkingOptionsDto;
}

export class IngestionUrlDto {
  @IsDefined()
  @IsUrl({ require_protocol: true })
  @ApiProperty({
    description: 'Remote URL to ingest',
    example: 'https://example.com/spec.md',
  })
  url!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional organisation UUID to associate the document with',
    required: false,
    example: '11111111-2222-3333-4444-555555555555',
  })
  orgId?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Project UUID that this document belongs to (required)',
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  })
  projectId!: string;

  @IsOptional()
  @IsString()
  @IsIn(CHUNKING_STRATEGIES)
  @ApiProperty({
    description:
      'Chunking strategy for splitting text into chunks. Options: character (default), sentence, paragraph',
    required: false,
    enum: CHUNKING_STRATEGIES,
    default: 'character',
    example: 'sentence',
  })
  chunkingStrategy?: ChunkingStrategyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChunkingOptionsDto)
  @ApiProperty({
    description: 'Configuration options for the chunking strategy',
    required: false,
    type: ChunkingOptionsDto,
  })
  chunkingOptions?: ChunkingOptionsDto;
}

/**
 * DTO for batch file upload
 * Accepts multiple files with shared project context
 */
export class IngestionBatchUploadDto {
  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Optional organisation UUID to associate documents with',
    required: false,
    example: '11111111-2222-3333-4444-555555555555',
  })
  orgId?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Project UUID that all documents belong to (required)',
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  })
  projectId!: string;

  @IsOptional()
  @IsString()
  @IsIn(CHUNKING_STRATEGIES)
  @ApiProperty({
    description:
      'Chunking strategy for splitting text into chunks. Options: character (default), sentence, paragraph',
    required: false,
    enum: CHUNKING_STRATEGIES,
    default: 'character',
    example: 'sentence',
  })
  chunkingStrategy?: ChunkingStrategyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChunkingOptionsDto)
  @ApiProperty({
    description: 'Configuration options for the chunking strategy',
    required: false,
    type: ChunkingOptionsDto,
  })
  chunkingOptions?: ChunkingOptionsDto;
}

@ApiTags('Ingestion')
@Controller('ingest')
@UseGuards(AuthGuard, ScopesGuard)
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}
  @Post('upload')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      transformOptions: { enableImplicitConversion: true },
      validateCustomDecorators: true,
    })
  )
  @ApiBody({ type: IngestionUploadDto })
  @ApiOkResponse({
    description: 'Upload a file for ingestion',
    schema: {
      example: {
        documentId: '11111111-2222-3333-4444-555555555555',
        chunks: 12,
        alreadyExists: false,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid upload payload',
    schema: {
      example: {
        error: {
          code: 'validation-failed',
          message: 'Validation failed',
          details: { filename: ['must be a string'] },
        },
      },
    },
  })
  @ApiStandardErrors()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })
  )
  // Ingestion requires explicit ingest:write scope
  @Scopes('ingest:write')
  // NOTE: Using Express.Multer.File can error if global augmentation not picked; rely on MulterFile alias.
  upload(
    @Body() dto: IngestionUploadDto,
    @UploadedFile() file?: UploadedMulterFile
  ): Promise<IngestResult> {
    if (!file)
      throw new BadRequestException({
        error: { code: 'file-required', message: 'File is required' },
      });
    // Basic binary / unsupported type detection BEFORE attempting to interpret as UTF-8 to avoid downstream PG errors (e.g. 0x00 in text columns)
    const declaredMime =
      dto.mimeType || file.mimetype || 'application/octet-stream';
    const isLikelyTextMime =
      declaredMime.startsWith('text/') ||
      ['application/json'].includes(declaredMime);
    // Heuristic: reject if buffer contains a null byte or if mime not recognised as textual
    if (!isLikelyTextMime || file.buffer.includes(0x00)) {
      throw new UnsupportedMediaTypeException({
        error: {
          code: 'unsupported-type',
          message:
            'Binary or unsupported file type. Please upload a text-based document.',
        },
      });
    }
    const text = file.buffer.toString('utf-8');
    if (!text.trim()) {
      throw new BadRequestException({
        error: { code: 'empty', message: 'File content is empty' },
      });
    }
    const effectiveFilename =
      dto.filename && dto.filename.trim()
        ? dto.filename
        : file.originalname || 'upload';
    return this.ingestion.ingestText({
      text,
      filename: effectiveFilename,
      mimeType: dto.mimeType || file.mimetype,
      orgId: dto.orgId,
      projectId: dto.projectId,
      chunkingConfig: dto.chunkingStrategy
        ? {
            strategy: dto.chunkingStrategy,
            options: dto.chunkingOptions
              ? {
                  maxChunkSize: dto.chunkingOptions.maxChunkSize,
                  minChunkSize: dto.chunkingOptions.minChunkSize,
                }
              : undefined,
          }
        : undefined,
    });
  }

  @Post('url')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      transformOptions: { enableImplicitConversion: true },
      validateCustomDecorators: true,
    })
  )
  @ApiBody({ type: IngestionUrlDto })
  @ApiOkResponse({
    description: 'Ingest a remote URL',
    schema: {
      example: {
        documentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        chunks: 8,
        alreadyExists: false,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid URL payload',
    schema: {
      example: {
        error: {
          code: 'validation-failed',
          message: 'Validation failed',
          details: { url: ['must be an URL address'] },
        },
      },
    },
  })
  @ApiStandardErrors()
  // URL ingestion also requires ingest:write
  @Scopes('ingest:write')
  ingestUrl(@Body() dto: IngestionUrlDto): Promise<IngestResult> {
    return this.ingestion.ingestUrl(
      dto.url,
      dto.orgId,
      dto.projectId,
      dto.chunkingStrategy
        ? {
            strategy: dto.chunkingStrategy,
            options: dto.chunkingOptions
              ? {
                  maxChunkSize: dto.chunkingOptions.maxChunkSize,
                  minChunkSize: dto.chunkingOptions.minChunkSize,
                }
              : undefined,
          }
        : undefined
    );
  }

  /**
   * Upload multiple files in a single batch request.
   * Max 100 files per batch, each max 10MB.
   * Files are processed with concurrency=3 by default.
   */
  @Post('upload-batch')
  @ApiOperation({
    summary: 'Batch upload multiple documents',
    description: `Upload multiple files in a single batch request for efficient document ingestion.
    
**Limits:**
- Maximum 100 files per batch
- Maximum 10MB per file
- Only text-based files are accepted (txt, md, html, json)

**Processing:**
- Files are processed concurrently (3 at a time)
- Each file is checked for duplicates independently
- Binary files are rejected with an error

**Response:**
- Returns a summary with counts and individual results for each file
- Files can have status: 'success', 'duplicate', or 'failed'
- Failed files include an error message explaining the failure`,
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      transformOptions: { enableImplicitConversion: true },
      validateCustomDecorators: true,
    })
  )
  @ApiBody({
    description: 'Upload multiple files for batch ingestion (max 100 files)',
    schema: {
      type: 'object',
      required: ['files', 'projectId'],
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description: 'Array of files to upload (max 100 files, 10MB each)',
        },
        projectId: {
          type: 'string',
          format: 'uuid',
          description: 'Project UUID that all documents belong to (required)',
          example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        },
        orgId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional organisation UUID to associate documents with',
          example: '11111111-2222-3333-4444-555555555555',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Batch upload completed with summary and individual results',
    schema: {
      example: {
        summary: {
          total: 5,
          successful: 3,
          duplicates: 1,
          failed: 1,
        },
        results: [
          {
            filename: 'doc1.md',
            status: 'success',
            documentId: '11111111-2222-3333-4444-555555555555',
            chunks: 12,
          },
          {
            filename: 'doc2.txt',
            status: 'duplicate',
            documentId: '22222222-3333-4444-5555-666666666666',
          },
          {
            filename: 'doc3.bin',
            status: 'failed',
            error: 'Binary or unsupported file type',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid batch upload payload',
    schema: {
      example: {
        error: {
          code: 'batch-limit-exceeded',
          message: 'Maximum 100 files allowed per batch',
        },
      },
    },
  })
  @ApiStandardErrors()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 100, { limits: { fileSize: 10 * 1024 * 1024 } })
  )
  @Scopes('ingest:write')
  async uploadBatch(
    @Body() dto: IngestionBatchUploadDto,
    @UploadedFiles() files?: UploadedMulterFile[]
  ): Promise<BatchUploadResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'files-required',
          message: 'At least one file is required',
        },
      });
    }

    if (files.length > 100) {
      throw new BadRequestException({
        error: {
          code: 'batch-limit-exceeded',
          message: 'Maximum 100 files allowed per batch',
        },
      });
    }

    // Pre-process files: validate and convert to text
    const processedFiles: Array<{
      text: string;
      filename: string;
      mimeType?: string;
    }> = [];

    const earlyFailures: Array<{
      filename: string;
      status: 'failed';
      error: string;
    }> = [];

    for (const file of files) {
      const filename = file.originalname || 'upload';
      const declaredMime = file.mimetype || 'application/octet-stream';
      const isLikelyTextMime =
        declaredMime.startsWith('text/') ||
        ['application/json'].includes(declaredMime);

      // Check for binary content
      if (!isLikelyTextMime || file.buffer.includes(0x00)) {
        earlyFailures.push({
          filename,
          status: 'failed',
          error:
            'Binary or unsupported file type. Please upload a text-based document.',
        });
        continue;
      }

      const text = file.buffer.toString('utf-8');
      if (!text.trim()) {
        earlyFailures.push({
          filename,
          status: 'failed',
          error: 'File content is empty',
        });
        continue;
      }

      processedFiles.push({
        text,
        filename,
        mimeType: declaredMime,
      });
    }

    // If all files failed early validation, return immediately
    if (processedFiles.length === 0) {
      return {
        summary: {
          total: files.length,
          successful: 0,
          duplicates: 0,
          failed: earlyFailures.length,
        },
        results: earlyFailures,
      };
    }

    // Process valid files through ingestion service
    const batchResult = await this.ingestion.ingestBatch({
      files: processedFiles,
      orgId: dto.orgId,
      projectId: dto.projectId,
      chunkingConfig: dto.chunkingStrategy
        ? {
            strategy: dto.chunkingStrategy,
            options: dto.chunkingOptions
              ? {
                  maxChunkSize: dto.chunkingOptions.maxChunkSize,
                  minChunkSize: dto.chunkingOptions.minChunkSize,
                }
              : undefined,
          }
        : undefined,
    });

    // Merge early failures with batch results
    if (earlyFailures.length > 0) {
      batchResult.summary.total += earlyFailures.length;
      batchResult.summary.failed += earlyFailures.length;
      batchResult.results.push(...earlyFailures);
    }

    return batchResult;
  }
}
