import { Controller, Post, Body, UsePipes, ValidationPipe, UploadedFile, UseInterceptors, BadRequestException, UnsupportedMediaTypeException, UseGuards } from '@nestjs/common';
import type { Express } from 'express';
// Local minimal file type to avoid reliance on Express.Multer global type which may not be picked up by TS in strict build.
interface UploadedMulterFile {
    originalname?: string;
    mimetype?: string;
    buffer: Buffer;
}
import { ApiBody, ApiOkResponse, ApiTags, ApiProperty, ApiBadRequestResponse, ApiConsumes } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { IsString, IsUrl, IsOptional, IsDefined, IsNotEmpty } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestionService, IngestResult } from './ingestion.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';

export class IngestionUploadDto {
    @IsString()
    @IsOptional()
    @ApiProperty({ description: 'Original filename (optional, will fallback to uploaded file name)', required: false, example: 'spec.md' })
    filename?: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ description: 'Optional MIME type', required: false, example: 'text/markdown' })
    mimeType?: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ description: 'Optional organisation UUID to associate the document with', required: false, example: '11111111-2222-3333-4444-555555555555' })
    orgId?: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Project UUID that this document belongs to (required)', example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    projectId!: string;
}

export class IngestionUrlDto {
    @IsDefined()
    @IsUrl({ require_protocol: true })
    @ApiProperty({ description: 'Remote URL to ingest', example: 'https://example.com/spec.md' })
    url!: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ description: 'Optional organisation UUID to associate the document with', required: false, example: '11111111-2222-3333-4444-555555555555' })
    orgId?: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Project UUID that this document belongs to (required)', example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
    projectId!: string;
}

@ApiTags('Ingestion')
@Controller('ingest')
@UseGuards(AuthGuard, ScopesGuard)
export class IngestionController {
    constructor(private readonly ingestion: IngestionService) { }
    @Post('upload')
    @UsePipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
        transformOptions: { enableImplicitConversion: true },
        validateCustomDecorators: true,
    }))
    @ApiBody({ type: IngestionUploadDto })
    @ApiOkResponse({ description: 'Upload a file for ingestion', schema: { example: { documentId: '11111111-2222-3333-4444-555555555555', chunks: 12, alreadyExists: false } } })
    @ApiBadRequestResponse({ description: 'Invalid upload payload', schema: { example: { error: { code: 'validation-failed', message: 'Validation failed', details: { filename: ['must be a string'] } } } } })
    @ApiStandardErrors()
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
    // Ingestion requires explicit ingest:write scope
    @Scopes('ingest:write')
    // NOTE: Using Express.Multer.File can error if global augmentation not picked; rely on MulterFile alias.
    upload(@Body() dto: IngestionUploadDto, @UploadedFile() file?: UploadedMulterFile): Promise<IngestResult> {
        if (!file) throw new BadRequestException({ error: { code: 'file-required', message: 'file is required' } });
        // Basic binary / unsupported type detection BEFORE attempting to interpret as UTF-8 to avoid downstream PG errors (e.g. 0x00 in text columns)
        const declaredMime = dto.mimeType || file.mimetype || 'application/octet-stream';
        const isLikelyTextMime = declaredMime.startsWith('text/') || ['application/json'].includes(declaredMime);
        // Heuristic: reject if buffer contains a null byte or if mime not recognised as textual
        if (!isLikelyTextMime || file.buffer.includes(0x00)) {
            throw new UnsupportedMediaTypeException({ error: { code: 'unsupported-type', message: 'Binary or unsupported file type' } });
        }
        const text = file.buffer.toString('utf-8');
        if (!text.trim()) {
            throw new BadRequestException({ error: { code: 'empty', message: 'Text content empty' } });
        }
        const effectiveFilename = dto.filename && dto.filename.trim() ? dto.filename : (file.originalname || 'upload');
        return this.ingestion.ingestText({ text, filename: effectiveFilename, mimeType: dto.mimeType || file.mimetype, orgId: dto.orgId, projectId: dto.projectId });
    }

    @Post('url')
    @UsePipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
        transformOptions: { enableImplicitConversion: true },
        validateCustomDecorators: true,
    }))
    @ApiBody({ type: IngestionUrlDto })
    @ApiOkResponse({ description: 'Ingest a remote URL', schema: { example: { documentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', chunks: 8, alreadyExists: false } } })
    @ApiBadRequestResponse({ description: 'Invalid URL payload', schema: { example: { error: { code: 'validation-failed', message: 'Validation failed', details: { url: ['must be an URL address'] } } } } })
    @ApiStandardErrors()
    // URL ingestion also requires ingest:write
    @Scopes('ingest:write')
    ingestUrl(@Body() dto: IngestionUrlDto): Promise<IngestResult> {
        return this.ingestion.ingestUrl(dto.url, dto.orgId, dto.projectId);
    }
}
