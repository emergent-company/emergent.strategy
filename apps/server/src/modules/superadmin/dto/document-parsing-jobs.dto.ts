import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';

/**
 * Document parsing job status
 */
export type DocumentParsingJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retry_pending';

/**
 * Query parameters for listing document parsing jobs
 */
export class ListDocumentParsingJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'processing', 'completed', 'failed', 'retry_pending'],
  })
  @IsOptional()
  @IsString()
  status?: DocumentParsingJobStatus;

  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by jobs with errors' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasError?: boolean;
}

/**
 * Document parsing job DTO
 */
export class DocumentParsingJobDto {
  @ApiProperty({ description: 'Job ID' })
  id!: string;

  @ApiProperty({ description: 'Organization ID' })
  organizationId!: string;

  @ApiPropertyOptional({ description: 'Organization name' })
  organizationName?: string;

  @ApiProperty({ description: 'Project ID' })
  projectId!: string;

  @ApiPropertyOptional({ description: 'Project name' })
  projectName?: string;

  @ApiProperty({ description: 'Job status' })
  status!: DocumentParsingJobStatus;

  @ApiProperty({ description: 'Source type (upload or url)' })
  sourceType!: string;

  @ApiPropertyOptional({ description: 'Source filename' })
  sourceFilename?: string;

  @ApiPropertyOptional({ description: 'MIME type' })
  mimeType?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSizeBytes?: number;

  @ApiPropertyOptional({ description: 'Storage key in MinIO' })
  storageKey?: string;

  @ApiPropertyOptional({ description: 'Associated document ID' })
  documentId?: string;

  @ApiPropertyOptional({ description: 'Associated extraction job ID' })
  extractionJobId?: string;

  @ApiPropertyOptional({ description: 'Parsed content length (characters)' })
  parsedContentLength?: number;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  errorMessage?: string;

  @ApiProperty({ description: 'Retry count' })
  retryCount!: number;

  @ApiProperty({ description: 'Max retries' })
  maxRetries!: number;

  @ApiPropertyOptional({ description: 'Next retry timestamp' })
  nextRetryAt?: Date;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Started timestamp' })
  startedAt?: Date;

  @ApiPropertyOptional({ description: 'Completed timestamp' })
  completedAt?: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: 'Job metadata' })
  metadata?: Record<string, any>;
}

/**
 * Document parsing job statistics
 */
export class DocumentParsingJobStatsDto {
  @ApiProperty({ description: 'Total jobs' })
  total!: number;

  @ApiProperty({ description: 'Pending jobs' })
  pending!: number;

  @ApiProperty({ description: 'Processing jobs' })
  processing!: number;

  @ApiProperty({ description: 'Completed jobs' })
  completed!: number;

  @ApiProperty({ description: 'Failed jobs' })
  failed!: number;

  @ApiProperty({ description: 'Retry pending jobs' })
  retryPending!: number;

  @ApiProperty({ description: 'Jobs with errors' })
  withErrors!: number;

  @ApiProperty({ description: 'Total file size processed (bytes)' })
  totalFileSizeBytes!: number;
}

/**
 * Response DTO for listing document parsing jobs
 */
export class ListDocumentParsingJobsResponseDto {
  @ApiProperty({ description: 'List of jobs', type: [DocumentParsingJobDto] })
  jobs!: DocumentParsingJobDto[];

  @ApiProperty({
    description: 'Job statistics',
    type: DocumentParsingJobStatsDto,
  })
  stats!: DocumentParsingJobStatsDto;

  @ApiProperty({ description: 'Pagination metadata', type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

/**
 * Request DTO for deleting document parsing jobs
 */
export class DeleteDocumentParsingJobsDto {
  @ApiProperty({ description: 'Job IDs to delete' })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

/**
 * Response DTO for deleting document parsing jobs
 */
export class DeleteDocumentParsingJobsResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiProperty({ description: 'Number of jobs deleted' })
  deletedCount!: number;

  @ApiProperty({ description: 'Result message' })
  message!: string;
}

/**
 * Request DTO for retrying document parsing jobs
 */
export class RetryDocumentParsingJobsDto {
  @ApiProperty({ description: 'Job IDs to retry' })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

/**
 * Response DTO for retrying document parsing jobs
 */
export class RetryDocumentParsingJobsResponseDto {
  @ApiProperty({ description: 'Success status' })
  success!: boolean;

  @ApiProperty({ description: 'Number of jobs queued for retry' })
  retriedCount!: number;

  @ApiProperty({ description: 'Result message' })
  message!: string;
}
