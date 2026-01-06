import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsInt, Min, IsUUID, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from './pagination.dto';

export type ExtractionJobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ExtractionJobType =
  | 'full_extraction'
  | 'incremental'
  | 'reprocessing'
  | 'chunk_extraction';

export class ListExtractionJobsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-indexed)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['queued', 'processing', 'completed', 'failed', 'cancelled'])
  status?: ExtractionJobStatus;

  @ApiPropertyOptional({
    description: 'Filter by job type',
    enum: [
      'full_extraction',
      'incremental',
      'reprocessing',
      'chunk_extraction',
    ],
  })
  @IsOptional()
  @IsIn(['full_extraction', 'incremental', 'reprocessing', 'chunk_extraction'])
  jobType?: ExtractionJobType;

  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by jobs with errors only' })
  @IsOptional()
  @Type(() => Boolean)
  hasError?: boolean;
}

export class ExtractionJobDto {
  @ApiProperty({ description: 'Job ID' })
  id: string;

  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiPropertyOptional({ description: 'Project name' })
  projectName?: string;

  @ApiPropertyOptional({ description: 'Document ID' })
  documentId?: string;

  @ApiPropertyOptional({ description: 'Document name' })
  documentName?: string;

  @ApiPropertyOptional({ description: 'Chunk ID' })
  chunkId?: string;

  @ApiProperty({ description: 'Job type' })
  jobType: string;

  @ApiProperty({
    description: 'Job status',
    enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
  })
  status: ExtractionJobStatus;

  @ApiProperty({ description: 'Objects created count' })
  objectsCreated: number;

  @ApiProperty({ description: 'Relationships created count' })
  relationshipsCreated: number;

  @ApiProperty({ description: 'Retry count' })
  retryCount: number;

  @ApiProperty({ description: 'Max retries allowed' })
  maxRetries: number;

  @ApiPropertyOptional({ description: 'Error message if any' })
  errorMessage?: string;

  @ApiPropertyOptional({ description: 'When processing started' })
  startedAt?: Date;

  @ApiPropertyOptional({ description: 'When processing completed' })
  completedAt?: Date;

  @ApiProperty({ description: 'When the job was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the job was last updated' })
  updatedAt: Date;

  @ApiProperty({ description: 'Total items to process' })
  totalItems: number;

  @ApiProperty({ description: 'Items processed so far' })
  processedItems: number;

  @ApiProperty({ description: 'Successfully processed items' })
  successfulItems: number;

  @ApiProperty({ description: 'Failed items' })
  failedItems: number;
}

export class ExtractionJobStatsDto {
  @ApiProperty({ description: 'Total jobs' })
  total: number;

  @ApiProperty({ description: 'Queued jobs' })
  queued: number;

  @ApiProperty({ description: 'Processing jobs' })
  processing: number;

  @ApiProperty({ description: 'Completed jobs' })
  completed: number;

  @ApiProperty({ description: 'Failed jobs' })
  failed: number;

  @ApiProperty({ description: 'Cancelled jobs' })
  cancelled: number;

  @ApiProperty({ description: 'Jobs with errors' })
  withErrors: number;

  @ApiProperty({ description: 'Total objects created' })
  totalObjectsCreated: number;

  @ApiProperty({ description: 'Total relationships created' })
  totalRelationshipsCreated: number;
}

export class ListExtractionJobsResponseDto {
  @ApiProperty({
    description: 'List of extraction jobs',
    type: [ExtractionJobDto],
  })
  jobs: ExtractionJobDto[];

  @ApiProperty({ description: 'Job statistics' })
  stats: ExtractionJobStatsDto;

  @ApiProperty({ description: 'Pagination metadata' })
  meta: PaginationMetaDto;
}

export class DeleteExtractionJobsDto {
  @ApiProperty({
    description: 'Job IDs to delete',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class DeleteExtractionJobsResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Number of jobs deleted' })
  deletedCount: number;

  @ApiProperty({ description: 'Message describing the result' })
  message: string;
}

export class CancelExtractionJobsDto {
  @ApiProperty({
    description: 'Job IDs to cancel',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class CancelExtractionJobsResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Number of jobs cancelled' })
  cancelledCount: number;

  @ApiProperty({ description: 'Message describing the result' })
  message: string;
}
