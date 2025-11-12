import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum SearchMode {
  HYBRID = 'hybrid',
  LEXICAL = 'lexical',
  VECTOR = 'vector',
}

export class SearchQueryDto {
  @ApiProperty({ description: 'Query string', example: 'vector index design' })
  @IsString()
  q!: string;

  @ApiProperty({
    description: 'Result limit (1..50)',
    minimum: 1,
    maximum: 50,
    default: 10,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;

  @ApiProperty({
    enum: SearchMode,
    default: SearchMode.HYBRID,
    required: false,
  })
  @IsOptional()
  @IsEnum(SearchMode)
  mode: SearchMode = SearchMode.HYBRID;

  @ApiProperty({
    description:
      'Lexical weight for hybrid search (0-1). Only used when mode=hybrid. Weights are normalized to sum to 1.',
    minimum: 0,
    maximum: 1,
    default: 0.5,
    required: false,
    example: 0.7,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  lexicalWeight?: number = 0.5;

  @ApiProperty({
    description:
      'Vector weight for hybrid search (0-1). Only used when mode=hybrid. Weights are normalized to sum to 1.',
    minimum: 0,
    maximum: 1,
    default: 0.5,
    required: false,
    example: 0.3,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vectorWeight?: number = 0.5;

  @ApiProperty({
    description:
      'Include path summaries showing how results relate to other objects in the knowledge graph',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includePaths?: boolean = false;
}
