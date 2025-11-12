import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  ArrayNotEmpty,
} from 'class-validator';

/**
 * DTO for creating a new embedding policy
 */
export class CreateEmbeddingPolicyDto {
  @ApiProperty({
    description: 'Project ID this policy applies to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  projectId!: string;

  @ApiProperty({
    description:
      'Object type to apply policy to (e.g., "Document", "Requirement", "TestCase")',
    example: 'Document',
  })
  @IsString()
  objectType!: string;

  @ApiPropertyOptional({
    description: 'Whether embedding is enabled for this object type',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Maximum property size in bytes. Objects with properties larger than this will not be embedded.',
    example: 10000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPropertySize?: number;

  @ApiPropertyOptional({
    description:
      'Labels that must be present on the object for it to be embedded',
    example: ['public', 'approved'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredLabels?: string[];

  @ApiPropertyOptional({
    description: 'Labels that prevent embedding if present on the object',
    example: ['sensitive', 'draft'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedLabels?: string[];

  @ApiPropertyOptional({
    description:
      'JSON Pointer paths to relevant properties. If specified, only these paths will be embedded (field masking).',
    example: ['/properties/title', '/properties/description'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relevantPaths?: string[];

  @ApiPropertyOptional({
    description:
      'Status values that prevent embedding if present on the object',
    example: ['draft', 'archived'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedStatuses?: string[];
}

/**
 * DTO for updating an existing embedding policy
 */
export class UpdateEmbeddingPolicyDto {
  @ApiPropertyOptional({
    description: 'Whether embedding is enabled for this object type',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Maximum property size in bytes. Objects with properties larger than this will not be embedded.',
    example: 20000,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPropertySize?: number;

  @ApiPropertyOptional({
    description:
      'Labels that must be present on the object for it to be embedded',
    example: ['verified'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredLabels?: string[];

  @ApiPropertyOptional({
    description: 'Labels that prevent embedding if present on the object',
    example: ['archived'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedLabels?: string[];

  @ApiPropertyOptional({
    description: 'JSON Pointer paths to relevant properties',
    example: ['/properties/summary'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relevantPaths?: string[];

  @ApiPropertyOptional({
    description: 'Status values that prevent embedding',
    example: ['draft'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedStatuses?: string[];
}

/**
 * Response DTO for embedding policy
 */
export class EmbeddingPolicyResponseDto {
  @ApiProperty({
    description: 'Policy ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id!: string;

  @ApiProperty({
    description: 'Project ID',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  projectId!: string;

  @ApiProperty({
    description: 'Object type',
    example: 'Document',
  })
  objectType!: string;

  @ApiProperty({
    description: 'Whether embedding is enabled',
    example: true,
  })
  enabled!: boolean;

  @ApiProperty({
    description: 'Maximum property size in bytes',
    example: 10000,
    nullable: true,
  })
  maxPropertySize!: number | null;

  @ApiProperty({
    description: 'Required labels',
    type: [String],
    example: ['public'],
  })
  requiredLabels!: string[];

  @ApiProperty({
    description: 'Excluded labels',
    type: [String],
    example: ['sensitive'],
  })
  excludedLabels!: string[];

  @ApiProperty({
    description: 'Relevant property paths (JSON Pointers)',
    type: [String],
    example: ['/properties/title'],
  })
  relevantPaths!: string[];

  @ApiProperty({
    description: 'Excluded status values',
    type: [String],
    example: ['draft'],
  })
  excludedStatuses!: string[];

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-10-01T12:00:00Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-10-01T12:30:00Z',
  })
  updatedAt!: Date;
}
