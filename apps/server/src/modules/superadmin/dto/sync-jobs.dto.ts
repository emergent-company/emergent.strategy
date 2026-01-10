import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsInt, Min, IsUUID, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from './pagination.dto';

export type SyncJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export class ListSyncJobsQueryDto {
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
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['pending', 'running', 'completed', 'failed', 'cancelled'])
  status?: SyncJobStatus;

  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by jobs with errors only' })
  @IsOptional()
  @Type(() => Boolean)
  hasError?: boolean;
}

export class SyncJobDto {
  @ApiProperty({ description: 'Job ID' })
  id: string;

  @ApiProperty({ description: 'Integration ID' })
  integrationId: string;

  @ApiPropertyOptional({ description: 'Integration name' })
  integrationName?: string;

  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiPropertyOptional({ description: 'Project name' })
  projectName?: string;

  @ApiPropertyOptional({
    description: 'Provider type (gmail_oauth, imap, etc.)',
  })
  providerType?: string;

  @ApiProperty({
    description: 'Job status',
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
  })
  status: SyncJobStatus;

  @ApiProperty({ description: 'Total items to sync' })
  totalItems: number;

  @ApiProperty({ description: 'Items processed' })
  processedItems: number;

  @ApiProperty({ description: 'Items successfully imported' })
  successfulItems: number;

  @ApiProperty({ description: 'Items that failed to import' })
  failedItems: number;

  @ApiProperty({ description: 'Items skipped' })
  skippedItems: number;

  @ApiPropertyOptional({ description: 'Current phase of sync' })
  currentPhase?: string;

  @ApiPropertyOptional({ description: 'Human-readable status message' })
  statusMessage?: string;

  @ApiPropertyOptional({ description: 'Error message if any' })
  errorMessage?: string;

  @ApiProperty({
    description: 'Trigger type',
    enum: ['manual', 'scheduled'],
  })
  triggerType: 'manual' | 'scheduled';

  @ApiProperty({ description: 'When the job was created' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When processing started' })
  startedAt?: Date;

  @ApiPropertyOptional({ description: 'When processing completed' })
  completedAt?: Date;
}

export class SyncJobStatsDto {
  @ApiProperty({ description: 'Total jobs' })
  total: number;

  @ApiProperty({ description: 'Pending jobs' })
  pending: number;

  @ApiProperty({ description: 'Running jobs' })
  running: number;

  @ApiProperty({ description: 'Completed jobs' })
  completed: number;

  @ApiProperty({ description: 'Failed jobs' })
  failed: number;

  @ApiProperty({ description: 'Cancelled jobs' })
  cancelled: number;

  @ApiProperty({ description: 'Jobs with errors' })
  withErrors: number;

  @ApiProperty({ description: 'Total items imported across all jobs' })
  totalItemsImported: number;
}

export class ListSyncJobsResponseDto {
  @ApiProperty({
    description: 'List of sync jobs',
    type: [SyncJobDto],
  })
  jobs: SyncJobDto[];

  @ApiProperty({ description: 'Job statistics' })
  stats: SyncJobStatsDto;

  @ApiProperty({ description: 'Pagination metadata' })
  meta: PaginationMetaDto;
}

export class DeleteSyncJobsDto {
  @ApiProperty({
    description: 'Job IDs to delete',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class DeleteSyncJobsResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Number of jobs deleted' })
  deletedCount: number;

  @ApiProperty({ description: 'Message describing the result' })
  message: string;
}

export class CancelSyncJobsDto {
  @ApiProperty({
    description: 'Job IDs to cancel',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class CancelSyncJobsResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Number of jobs cancelled' })
  cancelledCount: number;

  @ApiProperty({ description: 'Message describing the result' })
  message: string;
}

export class SyncJobLogEntryDto {
  @ApiProperty({ description: 'Timestamp of the log entry' })
  timestamp: string;

  @ApiProperty({
    description: 'Log level',
    enum: ['debug', 'info', 'warn', 'error'],
  })
  level: 'debug' | 'info' | 'warn' | 'error';

  @ApiProperty({ description: 'Log message' })
  message: string;

  @ApiPropertyOptional({ description: 'Additional details' })
  details?: Record<string, any>;
}

export class SyncJobLogsResponseDto {
  @ApiProperty({ description: 'Job ID' })
  id: string;

  @ApiProperty({ description: 'Job status' })
  status: SyncJobStatus;

  @ApiProperty({
    description: 'Log entries',
    type: [SyncJobLogEntryDto],
  })
  logs: SyncJobLogEntryDto[];

  @ApiPropertyOptional({ description: 'Error message if any' })
  errorMessage?: string;

  @ApiProperty({ description: 'When the job was created' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When processing started' })
  startedAt?: Date;

  @ApiPropertyOptional({ description: 'When processing completed' })
  completedAt?: Date;
}
