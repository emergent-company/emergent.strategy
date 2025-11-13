import {
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResourceQueryDto {
  @ApiPropertyOptional({
    description:
      'Type of resource to query (optional, inferred from endpoint path)',
    enum: ['extraction_job', 'chat_session', 'frontend_session'],
    example: 'extraction_job',
  })
  @IsOptional()
  @IsEnum(['extraction_job', 'chat_session', 'frontend_session'])
  type?: string;

  @ApiPropertyOptional({
    description: 'Number of items to return',
    minimum: 1,
    maximum: 100,
    default: 50,
    example: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Number of items to skip',
    minimum: 0,
    default: 0,
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Filter by status',
    example: 'completed',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by date from (ISO 8601)',
    example: '2025-10-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({
    description: 'Filter by date to (ISO 8601)',
    example: '2025-10-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  date_to?: string;
}

export class LogQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by log level',
    enum: ['debug', 'info', 'warn', 'error', 'fatal'],
    example: 'info',
  })
  @IsOptional()
  @IsEnum(['debug', 'info', 'warn', 'error', 'fatal'])
  level?: string;

  @ApiPropertyOptional({
    description: 'Number of log entries to return',
    minimum: 1,
    maximum: 500,
    default: 100,
    example: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Number of log entries to skip',
    minimum: 0,
    default: 0,
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
