import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GraphChannel, GraphIntent } from './graph-search.enums';

export class GraphSearchFiltersDto {
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectTypes?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeObjectTypes?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelsAny?: string[];

  @ApiProperty({ required: false, example: '2025-09-01T00:00:00Z' })
  @IsOptional()
  @IsString()
  updatedAfter?: string;

  @ApiProperty({ required: false, example: '2025-09-20T00:00:00Z' })
  @IsOptional()
  @IsString()
  updatedBefore?: string;
}

export class GraphSearchNeighborDto {
  @ApiProperty({ required: false, minimum: 0, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  perPrimaryLimit?: number;

  @ApiProperty({ required: false, minimum: 0, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  globalLimit?: number;

  @ApiProperty({ required: false, minimum: 0, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  maxDepth?: number; // spec sets max depth constant; validator enforces upper bound

  @ApiProperty({
    required: false,
    type: [String],
    example: ['decides', 'attended_by'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  edgeTypes?: string[];
}

export class GraphSearchDocumentFusionDto {
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false, default: 8, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;

  @ApiProperty({
    required: false,
    enum: ['blend', 'rrf', 'sequential'],
    default: 'blend',
  })
  @IsOptional()
  @IsIn(['blend', 'rrf', 'sequential'])
  mode?: 'blend' | 'rrf' | 'sequential';

  @ApiProperty({ required: false, default: 0.35, minimum: 0, maximum: 1 })
  @IsOptional()
  weight?: number; // numeric range enforced manually in service for precision
}

export class GraphSearchPaginationDto {
  @ApiProperty({ required: false, example: null })
  @IsOptional()
  @IsString()
  cursor?: string | null;

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number; // server will clamp to FINAL_LIMIT_MAX

  @ApiProperty({
    required: false,
    enum: ['forward', 'backward'],
    default: 'forward',
    description:
      'Pagination direction relative to cursor (forward = items after cursor, backward = items before cursor). Only meaningful when cursor is supplied.',
  })
  @IsOptional()
  @IsIn(['forward', 'backward'])
  direction?: 'forward' | 'backward';
}

export class GraphSearchRequestDto {
  @ApiProperty({ description: 'Search query', maxLength: 800 })
  @IsString()
  @MaxLength(800)
  query!: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 100, default: 40 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    required: false,
    enum: GraphIntent,
    example: GraphIntent.EXPLAIN,
  })
  @IsOptional()
  @IsIn(Object.values(GraphIntent))
  intentOverride?: GraphIntent;

  @ApiProperty({ required: false, enum: GraphChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(GraphChannel), { each: true })
  channels?: GraphChannel[];

  @ApiProperty({ required: false, default: null })
  @IsOptional()
  rerank?: boolean | null;

  @ApiProperty({ required: false, minimum: 800, maximum: 6000, default: 3500 })
  @IsOptional()
  @IsInt()
  @Min(800)
  @Max(6000)
  maxTokenBudget?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeCitations?: boolean;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  includePathSummaries?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeDebug?: boolean;

  @ApiProperty({ required: false, type: GraphSearchFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GraphSearchFiltersDto)
  filters?: GraphSearchFiltersDto;

  @ApiProperty({ required: false, type: GraphSearchNeighborDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GraphSearchNeighborDto)
  neighbor?: GraphSearchNeighborDto;

  @ApiProperty({ required: false, type: GraphSearchDocumentFusionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GraphSearchDocumentFusionDto)
  documentFusion?: GraphSearchDocumentFusionDto;

  @ApiProperty({ required: false, type: GraphSearchPaginationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GraphSearchPaginationDto)
  pagination?: GraphSearchPaginationDto;

  @ApiProperty({
    required: false,
    description: 'Experimental feature flags container',
  })
  @IsOptional()
  @IsObject()
  experimental?: Record<string, unknown>;
}
