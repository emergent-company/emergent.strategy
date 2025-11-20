import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsEnum,
  Min,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Result type to include in unified search
 */
export enum UnifiedSearchResultType {
  /** Include graph objects in results */
  GRAPH = 'graph',
  /** Include document chunks (text) in results */
  TEXT = 'text',
  /** Include both graph and text results */
  BOTH = 'both',
}

/**
 * Fusion strategy for combining graph and text results
 */
export enum UnifiedSearchFusionStrategy {
  /** Weighted combination of scores */
  WEIGHTED = 'weighted',
  /** Reciprocal Rank Fusion */
  RRF = 'rrf',
  /** Interleave results alternating between types */
  INTERLEAVE = 'interleave',
  /** Show graph results first, then text */
  GRAPH_FIRST = 'graph_first',
  /** Show text results first, then graph */
  TEXT_FIRST = 'text_first',
}

/**
 * Weights for combining graph and text scores
 */
export class UnifiedSearchWeightsDto {
  @ApiProperty({
    description: 'Weight for graph search results (0-1)',
    minimum: 0,
    maximum: 1,
    default: 0.5,
    required: false,
    example: 0.6,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  graphWeight?: number = 0.5;

  @ApiProperty({
    description: 'Weight for text search results (0-1)',
    minimum: 0,
    maximum: 1,
    default: 0.5,
    required: false,
    example: 0.4,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  textWeight?: number = 0.5;
}

/**
 * Options for expanding relationships in graph results
 */
export class UnifiedSearchRelationshipOptionsDto {
  @ApiProperty({
    description: 'Whether to include relationships for graph results',
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;

  @ApiProperty({
    description: 'Maximum depth for relationship traversal',
    minimum: 0,
    maximum: 3,
    default: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  maxDepth?: number = 1;

  @ApiProperty({
    description: 'Maximum number of neighbors per graph result',
    minimum: 0,
    maximum: 20,
    default: 5,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  maxNeighbors?: number = 5;

  @ApiProperty({
    description: 'Direction for relationship expansion',
    enum: ['in', 'out', 'both'],
    default: 'both',
    required: false,
  })
  @IsOptional()
  @IsEnum(['in', 'out', 'both'])
  direction?: 'in' | 'out' | 'both' = 'both';
}

/**
 * Request DTO for unified search combining graph objects and document chunks
 */
export class UnifiedSearchRequestDto {
  @ApiProperty({
    description: 'Natural language search query',
    maxLength: 800,
    example: 'hybrid search architecture decisions',
  })
  @IsString()
  @MaxLength(800)
  query!: string;

  @ApiProperty({
    description: 'Maximum total number of results to return',
    minimum: 1,
    maximum: 100,
    default: 20,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Types of results to include',
    enum: UnifiedSearchResultType,
    default: UnifiedSearchResultType.BOTH,
    required: false,
  })
  @IsOptional()
  @IsEnum(UnifiedSearchResultType)
  resultTypes?: UnifiedSearchResultType = UnifiedSearchResultType.BOTH;

  @ApiProperty({
    description: 'Strategy for combining/fusing graph and text results',
    enum: UnifiedSearchFusionStrategy,
    default: UnifiedSearchFusionStrategy.WEIGHTED,
    required: false,
  })
  @IsOptional()
  @IsEnum(UnifiedSearchFusionStrategy)
  fusionStrategy?: UnifiedSearchFusionStrategy =
    UnifiedSearchFusionStrategy.WEIGHTED;

  @ApiProperty({
    description: 'Weights for combining graph and text scores',
    type: UnifiedSearchWeightsDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UnifiedSearchWeightsDto)
  weights?: UnifiedSearchWeightsDto;

  @ApiProperty({
    description: 'Options for expanding relationships in graph results',
    type: UnifiedSearchRelationshipOptionsDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UnifiedSearchRelationshipOptionsDto)
  relationshipOptions?: UnifiedSearchRelationshipOptionsDto;

  @ApiProperty({
    description: 'Whether to include debug metadata in response',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includeDebug?: boolean = false;

  @ApiProperty({
    description:
      'Maximum token budget for field truncation (applies to graph results)',
    minimum: 800,
    maximum: 6000,
    default: 3500,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(800)
  @Max(6000)
  maxTokenBudget?: number = 3500;
}
