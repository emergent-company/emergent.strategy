import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsDateString,
} from 'class-validator';

/**
 * Individual log entry from browser client
 */
export class ClientLogEntryDto {
  @ApiProperty({ description: 'ISO timestamp when log was created' })
  @IsDateString()
  timestamp: string;

  @ApiProperty({
    description: 'Log level',
    enum: ['error', 'warn', 'info', 'debug'],
  })
  @IsIn(['error', 'warn', 'info', 'debug'])
  level: 'error' | 'warn' | 'info' | 'debug';

  @ApiProperty({ description: 'Log message' })
  @IsString()
  message: string;

  @ApiProperty({ description: 'Stack trace if available', required: false })
  @IsOptional()
  @IsString()
  stack?: string;

  @ApiProperty({
    description: 'Browser URL where log was captured',
    required: false,
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiProperty({ description: 'User agent string', required: false })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiProperty({
    description: 'Additional metadata',
    required: false,
    type: 'object',
  })
  @IsOptional()
  extra?: Record<string, unknown>;
}

/**
 * Request body for batch client log submission
 */
export class ClientLogsRequestDto {
  @ApiProperty({
    description: 'Array of log entries from browser',
    type: [ClientLogEntryDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientLogEntryDto)
  logs: ClientLogEntryDto[];
}
