import {
  IsArray,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for triggering embedding generation for multiple objects
 */
export class TriggerEmbeddingsBatchDto {
  @ApiProperty({
    description: 'Array of object IDs to generate embeddings for',
    type: [String],
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
    ],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  objectIds!: string[];

  @ApiPropertyOptional({
    description: 'Priority for embedding jobs (higher = processed first)',
    type: Number,
    example: 10,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;
}

/**
 * DTO for triggering embedding regeneration for all objects in a project
 */
export class TriggerEmbeddingsProjectDto {
  @ApiProperty({
    description: 'Project ID to regenerate embeddings for',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4')
  projectId!: string;

  @ApiPropertyOptional({
    description:
      'Object type filter (if specified, only regenerate embeddings for this type)',
    type: String,
    example: 'Person',
  })
  @IsOptional()
  @IsString()
  objectType?: string;

  @ApiPropertyOptional({
    description: 'Priority for embedding jobs (higher = processed first)',
    type: Number,
    example: 10,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional({
    description: 'Force regeneration even if embedding already exists',
    type: Boolean,
    example: false,
    default: false,
  })
  @IsOptional()
  force?: boolean;
}

/**
 * Response DTO for embedding job operations
 */
export class EmbeddingJobResponseDto {
  @ApiProperty({
    description: 'Number of jobs enqueued',
    type: Number,
    example: 10,
  })
  enqueued!: number;

  @ApiProperty({
    description: 'Number of jobs that were already pending/processing',
    type: Number,
    example: 2,
  })
  skipped!: number;

  @ApiProperty({
    description: 'Array of job IDs that were created or found',
    type: [String],
    example: ['job-1', 'job-2'],
  })
  jobIds!: string[];
}
