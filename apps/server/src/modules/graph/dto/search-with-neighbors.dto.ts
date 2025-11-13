import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  Min,
  Max,
} from 'class-validator';

export class SearchObjectsWithNeighborsDto {
  @ApiProperty({
    description: 'Natural language query text to search for',
    example: 'authentication and authorization patterns',
  })
  @IsString()
  query!: string;

  @ApiProperty({
    description: 'Maximum number of primary search results',
    default: 10,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: 'Whether to include neighbors for each result',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includeNeighbors?: boolean;

  @ApiProperty({
    description: 'Maximum number of neighbors per result',
    default: 5,
    minimum: 1,
    maximum: 20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxNeighbors?: number;

  @ApiProperty({
    description:
      'Maximum vector distance for similarity (0.0-2.0, lower = more similar)',
    default: 0.5,
    minimum: 0,
    maximum: 2,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  maxDistance?: number;

  @ApiProperty({
    description: 'Filter by project ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty({
    description: 'Filter by organization ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiProperty({
    description: 'Filter by branch ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiProperty({
    description: 'Filter by object types',
    type: [String],
    required: false,
    example: ['Decision', 'Pattern', 'Document'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];

  @ApiProperty({
    description: 'Filter by labels',
    type: [String],
    required: false,
    example: ['accepted', 'high-priority'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];
}
