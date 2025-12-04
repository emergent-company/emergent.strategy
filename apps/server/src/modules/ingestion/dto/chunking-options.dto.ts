import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Available chunking strategies.
 */
export const CHUNKING_STRATEGIES = [
  'character',
  'sentence',
  'paragraph',
] as const;
export type ChunkingStrategyDto = (typeof CHUNKING_STRATEGIES)[number];

/**
 * DTO for chunking options.
 */
export class ChunkingOptionsDto {
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  @ApiProperty({
    description: 'Maximum characters per chunk (default: 1200)',
    required: false,
    minimum: 100,
    maximum: 10000,
    default: 1200,
    example: 1200,
  })
  maxChunkSize?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(1000)
  @ApiProperty({
    description:
      'Minimum characters per chunk to prevent tiny chunks (default: 100)',
    required: false,
    minimum: 10,
    maximum: 1000,
    default: 100,
    example: 100,
  })
  minChunkSize?: number;
}

/**
 * Mixin class that adds chunking configuration to ingestion DTOs.
 */
export class ChunkingConfigMixin {
  @IsOptional()
  @IsString()
  @IsIn(CHUNKING_STRATEGIES)
  @ApiProperty({
    description: 'Chunking strategy to use for splitting text into chunks',
    required: false,
    enum: CHUNKING_STRATEGIES,
    default: 'character',
    example: 'sentence',
  })
  chunkingStrategy?: ChunkingStrategyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChunkingOptionsDto)
  @ApiProperty({
    description: 'Configuration options for the chunking strategy',
    required: false,
    type: ChunkingOptionsDto,
  })
  chunkingOptions?: ChunkingOptionsDto;
}
