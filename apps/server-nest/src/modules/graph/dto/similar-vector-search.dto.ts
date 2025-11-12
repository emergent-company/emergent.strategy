import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ArrayNotEmpty,
  ArrayUnique,
  Min,
  Max,
} from 'class-validator';

// Mirrors filter capabilities of VectorSearchDto, excluding the raw vector.
export class SimilarVectorSearchQueryDto {
  @ApiPropertyOptional({
    description: 'Limit number of neighbors (1-100); default 10',
  })
  @IsOptional()
  @IsPositive()
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Maximum cosine distance (lower is more similar). 0 ≤ d ≤ 2. Rows with distance > threshold filtered out.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  minScore?: number;

  @ApiPropertyOptional({
    description:
      'Alias for minScore (preferred name). 0 ≤ d ≤ 2. If both provided, maxDistance wins.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  maxDistance?: number;

  @ApiPropertyOptional({ description: 'Filter by object type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by org id (UUID)' })
  @IsOptional()
  @IsUUID()
  orgId?: string;

  @ApiPropertyOptional({ description: 'Filter by project id (UUID)' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Filter by branch id (UUID)' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by key prefix (ILIKE)' })
  @IsOptional()
  @IsString()
  keyPrefix?: string;

  @ApiPropertyOptional({
    description: 'Require all labels to be present on object',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  labelsAll?: string[];

  @ApiPropertyOptional({ description: 'Require any of the labels to overlap' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  labelsAny?: string[];
}
