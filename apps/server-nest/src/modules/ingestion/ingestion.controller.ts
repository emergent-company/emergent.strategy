import { Controller, Post, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags, ApiProperty, ApiBadRequestResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { IsString, IsUrl, IsOptional, IsDefined, IsNotEmpty } from 'class-validator';

export class IngestionUploadDto {
    @IsDefined()
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Original filename', example: 'spec.md' })
    filename!: string;

    @IsString()
    @IsOptional()
    @ApiProperty({ description: 'Optional MIME type', required: false, example: 'text/markdown' })
    mimeType?: string;
}

export class IngestionUrlDto {
    @IsDefined()
    @IsUrl({ require_protocol: true })
    @ApiProperty({ description: 'Remote URL to ingest', example: 'https://example.com/spec.md' })
    url!: string;
}

@ApiTags('Ingestion')
@Controller('ingest')
export class IngestionController {
    @Post('upload')
    @UsePipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
        transformOptions: { enableImplicitConversion: true },
        validateCustomDecorators: true,
    }))
    @ApiBody({ type: IngestionUploadDto })
    @ApiOkResponse({ description: 'Upload a file for ingestion', schema: { example: { id: 'job_1', status: 'queued', filename: 'spec.md' } } })
    @ApiBadRequestResponse({ description: 'Invalid upload payload', schema: { example: { error: { code: 'validation-failed', message: 'Validation failed', details: { filename: ['must be a string'] } } } } })
    @ApiStandardErrors()
    upload(@Body() dto: IngestionUploadDto) {
        return { id: 'job_1', status: 'queued', filename: dto.filename };
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
    @ApiOkResponse({ description: 'Ingest a remote URL', schema: { example: { id: 'job_2', status: 'queued', url: 'https://example.com/spec.md' } } })
    @ApiBadRequestResponse({ description: 'Invalid URL payload', schema: { example: { error: { code: 'validation-failed', message: 'Validation failed', details: { url: ['must be an URL address'] } } } } })
    @ApiStandardErrors()
    ingestUrl(@Body() dto: IngestionUrlDto) {
        return { id: 'job_2', status: 'queued', url: dto.url };
    }
}
