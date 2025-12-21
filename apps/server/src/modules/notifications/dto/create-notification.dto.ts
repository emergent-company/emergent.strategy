import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsEnum,
  IsOptional,
  IsObject,
  IsDateString,
  IsBoolean,
  IsArray,
} from 'class-validator';

export enum NotificationCategory {
  // Integration events
  IMPORT_COMPLETED = 'import.completed',
  IMPORT_FAILED = 'import.failed',
  IMPORT_REQUIRES_REVIEW = 'import.requires_review',
  SYNC_CONFLICT = 'import.conflict',

  // Extraction events
  EXTRACTION_COMPLETED = 'extraction.completed',
  EXTRACTION_FAILED = 'extraction.failed',
  EXTRACTION_LOW_CONFIDENCE = 'extraction.low_confidence',
  ENTITY_REQUIRES_REVIEW = 'entity.requires_review',

  // Graph events
  OBJECT_CREATED = 'graph.object_created',
  OBJECT_UPDATED = 'graph.object_updated',
  OBJECT_DELETED = 'graph.object_deleted',
  RELATIONSHIP_CREATED = 'graph.relationship_created',

  // Collaboration
  MENTION = 'collaboration.mention',
  COMMENT = 'collaboration.comment',
  ASSIGNED = 'collaboration.assigned',
  REVIEW_REQUEST = 'collaboration.review_request',

  // System
  SYSTEM_ERROR = 'system.error',
  SYSTEM_WARNING = 'system.warning',
  RATE_LIMIT_HIT = 'system.rate_limit',
  MAINTENANCE_SCHEDULED = 'system.maintenance',

  // Release notifications
  RELEASE_DEPLOYED = 'release.deployed',
  RELEASE_FEATURES = 'release.features',
}

export enum NotificationImportance {
  IMPORTANT = 'important',
  OTHER = 'other',
}

export enum NotificationSourceType {
  INTEGRATION = 'integration',
  EXTRACTION_JOB = 'extraction_job',
  GRAPH_OBJECT = 'graph_object',
  USER = 'user',
  RELEASE = 'release',
}

export enum NotificationSeverity {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

export class CreateNotificationDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  project_id?: string;

  @ApiProperty()
  @IsUUID()
  subject_id!: string;

  @ApiProperty({ enum: NotificationCategory })
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @ApiProperty({
    enum: NotificationImportance,
    default: NotificationImportance.OTHER,
  })
  @IsEnum(NotificationImportance)
  importance!: NotificationImportance;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  message!: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  details?: Record<string, any>;

  @ApiPropertyOptional({ enum: NotificationSourceType })
  @IsEnum(NotificationSourceType)
  @IsOptional()
  source_type?: NotificationSourceType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  source_id?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  action_url?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  action_label?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  group_key?: string;

  // New fields from migration 0005
  @ApiPropertyOptional({
    description:
      'Notification type (e.g., extraction_complete, extraction_failed)',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    enum: NotificationSeverity,
    default: NotificationSeverity.INFO,
    description: 'Notification severity level',
  })
  @IsEnum(NotificationSeverity)
  @IsOptional()
  severity?: NotificationSeverity;

  @ApiPropertyOptional({
    description: 'Related resource type (e.g., extraction_job, document)',
  })
  @IsString()
  @IsOptional()
  related_resource_type?: string;

  @ApiPropertyOptional({ description: 'Related resource ID (UUID)' })
  @IsUUID()
  @IsOptional()
  related_resource_id?: string;

  @ApiPropertyOptional({
    description: 'Whether notification has been read',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  read?: boolean;

  @ApiPropertyOptional({
    description: 'Whether notification has been dismissed',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  dismissed?: boolean;

  @ApiPropertyOptional({
    description: 'Array of action buttons',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        url: { type: 'string' },
        style: {
          type: 'string',
          enum: ['primary', 'secondary', 'warning', 'danger'],
        },
      },
    },
  })
  @IsArray()
  @IsOptional()
  actions?: Array<{
    label: string;
    url: string;
    style?: 'primary' | 'secondary' | 'warning' | 'danger';
  }>;

  @ApiPropertyOptional({ description: 'Expiration timestamp (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  expires_at?: string;
}

export class SnoozeNotificationDto {
  @ApiProperty({
    description: 'ISO 8601 datetime string for snooze until time',
  })
  @IsDateString()
  until!: string;
}
