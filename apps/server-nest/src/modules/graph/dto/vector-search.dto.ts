import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMinSize,
  IsNumber,
  Max,
  Min,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class VectorSearchDto {
  @ApiProperty({ description: 'Query vector numbers', type: [Number] })
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  vector!: number[];

  @ApiProperty({
    description: 'Max results (default 10, max 100)',
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description:
      'Optional max distance (cosine) filter (0 ≤ d ≤ 2; typical cosine range).',
    required: false,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  minScore?: number;

  @ApiProperty({
    description:
      'Alias for minScore (preferred). Same constraints (0 ≤ d ≤ 2). If both provided, maxDistance wins.',
    required: false,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  maxDistance?: number;

  @ApiProperty({
    description: 'Filter by object type (exact match)',
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({
    description: 'Filter by org id',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  orgId?: string;

  @ApiProperty({
    description: 'Filter by project id',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({
    description: 'Filter by branch id',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({
    description: 'Optional key prefix match (ILIKE prefix%)',
    required: false,
  })
  @IsOptional()
  @IsString()
  keyPrefix?: string;

  @ApiProperty({
    description:
      'Require all labels (array contains) – matches rows whose labels array contains every listed label',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelsAll?: string[];

  @ApiProperty({
    description:
      'Require any label (overlap) – matches rows whose labels array overlaps any listed label',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelsAny?: string[];
}
