import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TaskStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum TaskSourceType {
  AGENT = 'agent',
  USER = 'user',
  SYSTEM = 'system',
}

export class CreateTaskDto {
  @ApiProperty({ description: 'Project ID' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ description: 'Task title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Task description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Task type (e.g., merge_suggestion)' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ description: 'Source type (agent, user, system)' })
  @IsOptional()
  @IsEnum(TaskSourceType)
  sourceType?: TaskSourceType;

  @ApiPropertyOptional({ description: 'Source ID (e.g., agent run ID)' })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Task-specific metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class ResolveTaskDto {
  @ApiProperty({
    description: 'Resolution status',
    enum: ['accepted', 'rejected'],
  })
  @IsEnum(TaskStatus)
  status: 'accepted' | 'rejected';

  @ApiPropertyOptional({ description: 'Optional notes about the resolution' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class TaskQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: 'Filter by type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Page size' })
  @IsOptional()
  limit?: number;
}
