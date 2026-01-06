import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocumentParsingJobStatus,
  DocumentParsingJobSourceType,
} from '../../../entities/document-parsing-job.entity';

/**
 * DTO for creating a document parsing job
 */
export class CreateDocumentParsingJobDto {
  @ApiProperty({ description: 'Organization ID' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ description: 'Project ID' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({
    description: 'Source type of the document',
    enum: ['upload', 'url'],
  })
  @IsEnum(['upload', 'url'])
  sourceType!: DocumentParsingJobSourceType;

  @ApiPropertyOptional({ description: 'Original filename' })
  @IsString()
  @IsOptional()
  sourceFilename?: string;

  @ApiPropertyOptional({ description: 'MIME type of the document' })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  fileSizeBytes?: number;

  @ApiPropertyOptional({
    description: 'Storage key for the uploaded file',
  })
  @IsString()
  @IsOptional()
  storageKey?: string;

  @ApiPropertyOptional({
    description: 'Document ID to update with parsed content',
  })
  @IsUUID()
  @IsOptional()
  documentId?: string;

  @ApiPropertyOptional({
    description: 'Extraction job ID to trigger after parsing',
  })
  @IsUUID()
  @IsOptional()
  extractionJobId?: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    type: 'object',
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO for updating a document parsing job status
 */
export class UpdateDocumentParsingJobStatusDto {
  @ApiProperty({
    description: 'New status',
    enum: ['pending', 'processing', 'completed', 'failed', 'retry_pending'],
  })
  @IsEnum(['pending', 'processing', 'completed', 'failed', 'retry_pending'])
  status!: DocumentParsingJobStatus;

  @ApiPropertyOptional({ description: 'Parsed content (on completion)' })
  @IsString()
  @IsOptional()
  parsedContent?: string;

  @ApiPropertyOptional({ description: 'Error message (on failure)' })
  @IsString()
  @IsOptional()
  errorMessage?: string;

  @ApiPropertyOptional({
    description: 'Updated metadata',
    type: 'object',
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO for document parsing job response
 */
export class DocumentParsingJobResponseDto {
  @ApiProperty({ description: 'Job ID' })
  id!: string;

  @ApiProperty({ description: 'Organization ID' })
  organizationId!: string;

  @ApiProperty({ description: 'Project ID' })
  projectId!: string;

  @ApiProperty({
    description: 'Job status',
    enum: ['pending', 'processing', 'completed', 'failed', 'retry_pending'],
  })
  status!: DocumentParsingJobStatus;

  @ApiProperty({
    description: 'Source type',
    enum: ['upload', 'url'],
  })
  sourceType!: DocumentParsingJobSourceType;

  @ApiPropertyOptional({ description: 'Original filename' })
  sourceFilename?: string | null;

  @ApiPropertyOptional({ description: 'MIME type' })
  mimeType?: string | null;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSizeBytes?: number | null;

  @ApiPropertyOptional({ description: 'Document ID' })
  documentId?: string | null;

  @ApiPropertyOptional({ description: 'Error message' })
  errorMessage?: string | null;

  @ApiPropertyOptional({ description: 'Retry count' })
  retryCount?: number;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Started timestamp' })
  startedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Completed timestamp' })
  completedAt?: Date | null;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt!: Date;
}

/**
 * DTO for listing document parsing jobs
 */
export class ListDocumentParsingJobsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'processing', 'completed', 'failed', 'retry_pending'],
  })
  @IsEnum(['pending', 'processing', 'completed', 'failed', 'retry_pending'])
  @IsOptional()
  status?: DocumentParsingJobStatus;

  @ApiPropertyOptional({
    description: 'Filter by project ID',
  })
  @IsUUID()
  @IsOptional()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Number of results to return',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Number of results to skip',
    default: 0,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  offset?: number;
}

/**
 * DTO for document upload response.
 * Uses document-first architecture where document is created immediately
 * and parsing happens asynchronously.
 */
export class DocumentUploadResponseDto {
  @ApiProperty({
    description: 'The created document',
    type: 'object',
  })
  document!: {
    id: string;
    name: string;
    mimeType?: string | null;
    fileSizeBytes?: number | null;
    conversionStatus: string;
    conversionError?: string | null;
    storageKey?: string | null;
    createdAt: string;
  };

  @ApiProperty({
    description:
      'Whether this was a duplicate file (same file already uploaded)',
  })
  isDuplicate!: boolean;

  @ApiPropertyOptional({
    description: 'ID of existing document if duplicate',
  })
  existingDocumentId?: string;

  @ApiPropertyOptional({
    description: 'The parsing job (if conversion is required)',
    type: DocumentParsingJobResponseDto,
  })
  parsingJob?: DocumentParsingJobResponseDto;
}
