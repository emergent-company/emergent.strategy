import {
  IsString,
  IsUrl,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SyncPolicy } from '../../../entities';

/**
 * DTO for importing an external source
 */
export class ImportExternalSourceDto {
  @ApiProperty({
    description: 'URL of the external source to import',
    example: 'https://docs.google.com/document/d/1abc123xyz/edit',
  })
  @IsUrl()
  @IsString()
  url: string;

  @ApiPropertyOptional({
    description: 'Sync policy for the source',
    enum: ['manual', 'on_access', 'periodic', 'webhook'],
    default: 'manual',
  })
  @IsOptional()
  @IsEnum(['manual', 'on_access', 'periodic', 'webhook'])
  syncPolicy?: SyncPolicy;

  @ApiPropertyOptional({
    description: 'Sync interval in minutes (for periodic sync policy)',
    minimum: 5,
    maximum: 43200, // 30 days
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(43200)
  syncIntervalMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Process immediately (true) or queue for background processing (false)',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  immediate?: boolean;

  @ApiPropertyOptional({
    description: 'Custom metadata to attach to the external source',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * DTO for triggering a sync
 */
export class TriggerSyncDto {
  @ApiPropertyOptional({
    description: 'Force re-fetch even if no changes detected',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/**
 * DTO for updating an external source
 */
export class UpdateExternalSourceDto {
  @ApiPropertyOptional({
    description: 'Sync policy for the source',
    enum: ['manual', 'on_access', 'periodic', 'webhook'],
  })
  @IsOptional()
  @IsEnum(['manual', 'on_access', 'periodic', 'webhook'])
  syncPolicy?: SyncPolicy;

  @ApiPropertyOptional({
    description: 'Sync interval in minutes (for periodic sync policy)',
    minimum: 5,
    maximum: 43200,
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(43200)
  syncIntervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Display name for the source',
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Enable or disable the source',
    enum: ['active', 'disabled'],
  })
  @IsOptional()
  @IsEnum(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
