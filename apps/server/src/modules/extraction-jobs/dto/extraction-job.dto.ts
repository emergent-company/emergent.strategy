import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsEnum,
  IsObject,
  IsOptional,
  IsInt,
  Min,
  IsArray,
} from 'class-validator';

/**
 * Extraction job status enum
 */
export enum ExtractionJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  REQUIRES_REVIEW = 'requires_review',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Extraction source type enum
 */
export enum ExtractionSourceType {
  DOCUMENT = 'document',
  API = 'api',
  MANUAL = 'manual',
  BULK_IMPORT = 'bulk_import',
}

/**
 * Create Extraction Job DTO
 */
export class CreateExtractionJobDto {
  @ApiProperty({
    description: 'Project ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  project_id?: string;

  @ApiProperty({
    description: 'Source type for extraction',
    enum: ExtractionSourceType,
    example: ExtractionSourceType.DOCUMENT,
  })
  @IsEnum(ExtractionSourceType)
  source_type!: ExtractionSourceType;

  @ApiPropertyOptional({
    description: 'Source object ID (e.g., document ID)',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  source_id?: string;

  @ApiPropertyOptional({
    description: 'Additional source metadata',
    example: { filename: 'requirements.pdf', filesize: 1024000 },
  })
  @IsOptional()
  @IsObject()
  source_metadata?: Record<string, any>;

  @ApiProperty({
    description: 'Extraction configuration',
    example: {
      target_types: ['Requirement', 'Feature'],
      auto_create_types: true,
      confidence_threshold: 0.7,
    },
  })
  @IsObject()
  extraction_config!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'User subject ID (canonical internal user ID)',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  @IsOptional()
  @IsUUID()
  subject_id?: string;
}

/**
 * Update Extraction Job DTO
 */
export class UpdateExtractionJobDto {
  @ApiPropertyOptional({
    description: 'Job status',
    enum: ExtractionJobStatus,
    example: ExtractionJobStatus.RUNNING,
  })
  @IsOptional()
  @IsEnum(ExtractionJobStatus)
  status?: ExtractionJobStatus;

  @ApiPropertyOptional({
    description: 'Total items to process',
    example: 100,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  total_items?: number;

  @ApiPropertyOptional({
    description: 'Number of processed items',
    example: 50,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  processed_items?: number;

  @ApiPropertyOptional({
    description: 'Number of successful items',
    example: 45,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  successful_items?: number;

  @ApiPropertyOptional({
    description: 'Number of failed items',
    example: 5,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  failed_items?: number;

  @ApiPropertyOptional({
    description: 'Discovered type names',
    example: ['Requirement', 'Feature'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  discovered_types?: string[];

  @ApiPropertyOptional({
    description: 'Created object IDs',
    example: ['550e8400-e29b-41d4-a716-446655440010'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  created_objects?: string[];

  @ApiPropertyOptional({
    description: 'Error message (if failed)',
    example: 'Failed to parse document',
  })
  @IsOptional()
  @IsString()
  error_message?: string;

  @ApiPropertyOptional({
    description: 'Detailed error information',
    example: { stack: '...', context: '...' },
  })
  @IsOptional()
  @IsObject()
  error_details?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Debug information (LLM requests/responses, intermediate results)',
    example: { llm_requests: [], llm_responses: [], processing_steps: [] },
  })
  @IsOptional()
  @IsObject()
  debug_info?: Record<string, any>;
}

/**
 * Extraction Job Response DTO
 */
export class ExtractionJobDto {
  @ApiProperty({ description: 'Job ID' })
  id!: string;

  @ApiProperty({ description: 'Project ID' })
  project_id!: string;

  @ApiProperty({ description: 'Source type', enum: ExtractionSourceType })
  source_type!: ExtractionSourceType;

  @ApiPropertyOptional({ description: 'Source ID' })
  source_id?: string;

  @ApiProperty({ description: 'Source metadata' })
  source_metadata!: Record<string, any>;

  @ApiProperty({ description: 'Extraction configuration' })
  extraction_config!: Record<string, any>;

  @ApiProperty({ description: 'Job status', enum: ExtractionJobStatus })
  status!: ExtractionJobStatus;

  @ApiProperty({ description: 'Total items to process' })
  total_items!: number;

  @ApiProperty({ description: 'Processed items count' })
  processed_items!: number;

  @ApiProperty({ description: 'Successful items count' })
  successful_items!: number;

  @ApiProperty({ description: 'Failed items count' })
  failed_items!: number;

  @ApiProperty({ description: 'Discovered type names' })
  discovered_types!: string[];

  @ApiProperty({ description: 'Created object IDs' })
  created_objects!: string[];

  @ApiPropertyOptional({ description: 'Error message' })
  error_message?: string;

  @ApiPropertyOptional({ description: 'Error details' })
  error_details?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Debug information (LLM requests/responses, intermediate results)',
    example: {
      llm_calls: [
        {
          type: 'Requirement',
          prompt: 'Extract requirements...',
          response: 'LLM response data',
          duration_ms: 1234,
        },
      ],
    },
  })
  debug_info?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Job start timestamp' })
  started_at?: Date;

  @ApiPropertyOptional({ description: 'Job completion timestamp' })
  completed_at?: Date;

  @ApiProperty({ description: 'Job creation timestamp' })
  created_at!: Date;

  @ApiPropertyOptional({
    description: 'User subject ID (canonical internal user ID)',
  })
  subject_id?: string;

  @ApiProperty({ description: 'Last update timestamp' })
  updated_at!: Date;
}

/**
 * Query parameters for listing extraction jobs
 */
export class ListExtractionJobsDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ExtractionJobStatus,
  })
  @IsOptional()
  @IsEnum(ExtractionJobStatus)
  status?: ExtractionJobStatus;

  @ApiPropertyOptional({
    description: 'Filter by source type',
    enum: ExtractionSourceType,
  })
  @IsOptional()
  @IsEnum(ExtractionSourceType)
  source_type?: ExtractionSourceType;

  @ApiPropertyOptional({ description: 'Filter by source ID' })
  @IsOptional()
  @IsUUID()
  source_id?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

/**
 * Paginated list response
 */
export class ExtractionJobListDto {
  @ApiProperty({
    description: 'List of extraction jobs',
    type: [ExtractionJobDto],
  })
  jobs!: ExtractionJobDto[];

  @ApiProperty({ description: 'Total count of jobs' })
  total!: number;

  @ApiProperty({ description: 'Current page number' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  limit!: number;

  @ApiProperty({ description: 'Total pages' })
  total_pages!: number;
}
