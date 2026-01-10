import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsIn, IsInt, Min, IsUUID, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from './pagination.dto';

export type EmbeddingJobType = 'graph' | 'chunk';
export type EmbeddingJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export class ListEmbeddingJobsQueryDto {
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
    description: 'Filter by job type',
    enum: ['graph', 'chunk'],
  })
  @IsOptional()
  @IsIn(['graph', 'chunk'])
  type?: EmbeddingJobType;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  @IsOptional()
  @IsIn(['pending', 'processing', 'completed', 'failed'])
  status?: EmbeddingJobStatus;

  @ApiPropertyOptional({ description: 'Filter by jobs with errors only' })
  @IsOptional()
  @Type(() => Boolean)
  hasError?: boolean;

  @ApiPropertyOptional({ description: 'Filter by project ID' })
  @IsOptional()
  @IsUUID('4')
  projectId?: string;
}

export class EmbeddingJobDto {
  @ApiProperty({ description: 'Job ID' })
  id: string;

  @ApiProperty({ description: 'Job type', enum: ['graph', 'chunk'] })
  type: EmbeddingJobType;

  @ApiProperty({ description: 'Object or Chunk ID being embedded' })
  targetId: string;

  @ApiPropertyOptional({ description: 'Project ID' })
  projectId?: string;

  @ApiPropertyOptional({ description: 'Project name' })
  projectName?: string;

  @ApiProperty({
    description: 'Job status',
    enum: ['pending', 'processing', 'completed', 'failed'],
  })
  status: EmbeddingJobStatus;

  @ApiProperty({ description: 'Number of processing attempts' })
  attemptCount: number;

  @ApiPropertyOptional({ description: 'Last error message if any' })
  lastError?: string;

  @ApiProperty({ description: 'Job priority' })
  priority: number;

  @ApiProperty({ description: 'When the job is scheduled to run' })
  scheduledAt: Date;

  @ApiPropertyOptional({ description: 'When processing started' })
  startedAt?: Date;

  @ApiPropertyOptional({ description: 'When processing completed' })
  completedAt?: Date;

  @ApiProperty({ description: 'When the job was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the job was last updated' })
  updatedAt: Date;
}

export class EmbeddingJobStatsDto {
  @ApiProperty({ description: 'Total graph jobs' })
  graphTotal: number;

  @ApiProperty({ description: 'Pending graph jobs' })
  graphPending: number;

  @ApiProperty({ description: 'Completed graph jobs' })
  graphCompleted: number;

  @ApiProperty({ description: 'Failed graph jobs' })
  graphFailed: number;

  @ApiProperty({ description: 'Graph jobs with errors' })
  graphWithErrors: number;

  @ApiProperty({ description: 'Total chunk jobs' })
  chunkTotal: number;

  @ApiProperty({ description: 'Pending chunk jobs' })
  chunkPending: number;

  @ApiProperty({ description: 'Completed chunk jobs' })
  chunkCompleted: number;

  @ApiProperty({ description: 'Failed chunk jobs' })
  chunkFailed: number;

  @ApiProperty({ description: 'Chunk jobs with errors' })
  chunkWithErrors: number;
}

export class ListEmbeddingJobsResponseDto {
  @ApiProperty({
    description: 'List of embedding jobs',
    type: [EmbeddingJobDto],
  })
  jobs: EmbeddingJobDto[];

  @ApiProperty({ description: 'Job statistics' })
  stats: EmbeddingJobStatsDto;

  @ApiProperty({ description: 'Pagination metadata' })
  meta: PaginationMetaDto;
}

export class DeleteEmbeddingJobsDto {
  @ApiProperty({
    description: 'Job IDs to delete',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({
    description: 'Job type for the IDs',
    enum: ['graph', 'chunk'],
  })
  @IsIn(['graph', 'chunk'])
  type: EmbeddingJobType;
}

export class DeleteEmbeddingJobsResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Number of jobs deleted' })
  deletedCount: number;

  @ApiProperty({ description: 'Message describing the result' })
  message: string;
}

export class CleanupOrphanJobsResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Number of orphan jobs deleted' })
  deletedCount: number;

  @ApiProperty({ description: 'Message describing the result' })
  message: string;
}
