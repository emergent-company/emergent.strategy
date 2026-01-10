import {
  IsString,
  IsBoolean,
  IsOptional,
  IsObject,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsUUID,
  IsDateString,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

/**
 * Sync mode for data source integrations
 */
export enum SyncModeEnum {
  MANUAL = 'manual',
  RECURRING = 'recurring',
}

/**
 * Status for data source integrations
 */
export enum IntegrationStatusEnum {
  ACTIVE = 'active',
  ERROR = 'error',
  DISABLED = 'disabled',
}

/**
 * DTO for creating a new data source integration
 */
export class CreateDataSourceIntegrationDto {
  @ApiProperty({
    description: 'Provider type (e.g., imap, gmail_api)',
    example: 'imap',
  })
  @IsString()
  providerType!: string;

  @ApiProperty({
    description: 'Source type this integration produces (e.g., email)',
    example: 'email',
  })
  @IsString()
  sourceType!: string;

  @ApiProperty({
    description: 'User-defined display name',
    example: 'Work Gmail',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional description',
    example: 'My work email account',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Provider-specific configuration (will be encrypted)',
    example: {
      host: 'imap.gmail.com',
      port: 993,
      username: 'user@gmail.com',
      password: 'app-password',
    },
  })
  @IsObject()
  config!: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Sync mode',
    enum: SyncModeEnum,
    default: SyncModeEnum.MANUAL,
  })
  @IsEnum(SyncModeEnum)
  @IsOptional()
  syncMode?: SyncModeEnum;

  @ApiPropertyOptional({
    description: 'Sync interval in minutes (for recurring sync)',
    example: 60,
  })
  @IsInt()
  @Min(15)
  @Max(1440)
  @IsOptional()
  syncIntervalMinutes?: number;
}

/**
 * DTO for updating a data source integration
 */
export class UpdateDataSourceIntegrationDto {
  @ApiPropertyOptional({
    description: 'User-defined display name',
    example: 'Work Gmail',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Optional description',
    example: 'My work email account',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Provider-specific configuration (will be encrypted). Partial update supported.',
    example: {
      password: 'new-app-password',
    },
  })
  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Sync mode',
    enum: SyncModeEnum,
  })
  @IsEnum(SyncModeEnum)
  @IsOptional()
  syncMode?: SyncModeEnum;

  @ApiPropertyOptional({
    description: 'Sync interval in minutes (for recurring sync)',
    example: 60,
  })
  @IsInt()
  @Min(15)
  @Max(1440)
  @IsOptional()
  syncIntervalMinutes?: number;

  @ApiPropertyOptional({
    description: 'Integration status',
    enum: IntegrationStatusEnum,
  })
  @IsEnum(IntegrationStatusEnum)
  @IsOptional()
  status?: IntegrationStatusEnum;
}

/**
 * DTO for listing data source integrations
 */
export class ListDataSourceIntegrationsDto {
  @ApiPropertyOptional({
    description: 'Filter by provider type',
    example: 'imap',
  })
  @IsString()
  @IsOptional()
  providerType?: string;

  @ApiPropertyOptional({
    description: 'Filter by source type',
    example: 'email',
  })
  @IsString()
  @IsOptional()
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: IntegrationStatusEnum,
  })
  @IsEnum(IntegrationStatusEnum)
  @IsOptional()
  status?: IntegrationStatusEnum;

  @ApiPropertyOptional({
    description: 'Include sync configurations in response',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeConfigurations?: boolean;
}

/**
 * Response DTO for data source integration
 */
export class DataSourceIntegrationDto {
  @ApiProperty({ description: 'Integration ID' })
  id!: string;

  @ApiProperty({ description: 'Project ID' })
  projectId!: string;

  @ApiProperty({ description: 'Provider type' })
  providerType!: string;

  @ApiProperty({ description: 'Source type' })
  sourceType!: string;

  @ApiProperty({ description: 'Display name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string | null;

  @ApiProperty({ description: 'Sync mode', enum: SyncModeEnum })
  syncMode!: string;

  @ApiPropertyOptional({ description: 'Sync interval in minutes' })
  syncIntervalMinutes?: number | null;

  @ApiPropertyOptional({ description: 'Last synced timestamp' })
  lastSyncedAt?: Date | null;

  @ApiPropertyOptional({ description: 'Next sync timestamp' })
  nextSyncAt?: Date | null;

  @ApiProperty({ description: 'Status', enum: IntegrationStatusEnum })
  status!: string;

  @ApiPropertyOptional({ description: 'Error message if status is error' })
  errorMessage?: string | null;

  @ApiPropertyOptional({ description: 'Last error timestamp' })
  lastErrorAt?: Date | null;

  @ApiProperty({ description: 'Error count' })
  errorCount!: number;

  @ApiProperty({ description: 'Metadata' })
  metadata!: Record<string, any>;

  @ApiPropertyOptional({ description: 'Created by user ID' })
  createdBy?: string | null;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt!: Date;

  /**
   * Whether configuration has been set
   * (We don't expose the actual config for security)
   */
  @ApiProperty({ description: 'Whether configuration has been set' })
  hasConfig!: boolean;

  /**
   * Sync configurations (only included when includeConfigurations=true)
   * Note: Type is SyncConfigurationDto[] but declared as any[] to avoid circular reference
   */
  @ApiPropertyOptional({
    description: 'Sync configurations (only when includeConfigurations=true)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        isDefault: { type: 'boolean' },
        options: { type: 'object' },
        schedule: { type: 'object' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
    },
  })
  @IsArray()
  @IsOptional()
  configurations?: any[];
}

/**
 * DTO for browse request
 */
export class BrowseRequestDto {
  @ApiPropertyOptional({
    description: 'Folder/path to browse',
    example: 'INBOX',
  })
  @IsString()
  @IsOptional()
  folder?: string;

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  offset?: number;

  @ApiPropertyOptional({
    description: 'Limit for pagination',
    example: 100,
  })
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter criteria (provider-specific)',
    example: { from: 'alice@example.com', subject: 'Report' },
  })
  @IsObject()
  @IsOptional()
  filters?: Record<string, any>;
}

/**
 * DTO for import request
 */
export class ImportRequestDto {
  @ApiProperty({
    description: 'IDs of items to import',
    example: ['msg-123', 'msg-456'],
    isArray: true,
    type: String,
  })
  @IsString({ each: true })
  itemIds!: string[];

  @ApiPropertyOptional({
    description: 'Additional options for import',
    example: { includeAttachments: true },
  })
  @IsObject()
  @IsOptional()
  options?: Record<string, any>;
}

/**
 * Response DTO for import operation
 */
export class ImportResultDto {
  @ApiProperty({ description: 'Total items successfully imported' })
  totalImported!: number;

  @ApiProperty({ description: 'Total items that failed' })
  totalFailed!: number;

  @ApiProperty({ description: 'Total items skipped (duplicates)' })
  totalSkipped!: number;

  @ApiProperty({
    description: 'IDs of documents created',
    type: [String],
  })
  documentIds!: string[];

  @ApiProperty({
    description: 'Errors encountered',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        itemId: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
  errors!: Array<{ itemId: string; error: string }>;
}

/**
 * Response DTO for test connection
 */
export class TestConnectionResultDto {
  @ApiProperty({ description: 'Whether connection was successful' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'Additional info' })
  info?: Record<string, any>;
}

/**
 * Response DTO for provider metadata
 */
export class ProviderMetadataDto {
  @ApiProperty({ description: 'Provider type identifier' })
  providerType!: string;

  @ApiProperty({ description: 'Human-readable name' })
  displayName!: string;

  @ApiProperty({ description: 'Description' })
  description!: string;

  @ApiProperty({ description: 'Source type this provider produces' })
  sourceType!: string;

  @ApiProperty({ description: 'Icon identifier' })
  icon!: string;

  @ApiProperty({ description: 'JSON schema for configuration' })
  configSchema!: Record<string, any>;
}

/**
 * DTO for initiating OAuth flow
 */
export class OAuthStartRequestDto {
  @ApiPropertyOptional({
    description:
      'Existing integration ID to update (optional for new integrations)',
  })
  @IsUUID()
  @IsOptional()
  integrationId?: string;

  @ApiProperty({
    description: 'Provider type for the OAuth flow (e.g., gmail_oauth)',
    example: 'gmail_oauth',
  })
  @IsString()
  providerType!: string;

  @ApiPropertyOptional({
    description: 'URL to redirect to after OAuth completion',
    example: '/data-sources/integrations',
  })
  @IsString()
  @IsOptional()
  returnUrl?: string;

  @ApiPropertyOptional({
    description: 'Name for the new integration (required for new integrations)',
    example: 'My Gmail Account',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Description for the new integration',
    example: 'Personal email account',
  })
  @IsString()
  @IsOptional()
  description?: string;
}

/**
 * Response DTO for OAuth start
 */
export class OAuthStartResponseDto {
  @ApiProperty({ description: 'URL to redirect user to for OAuth' })
  authUrl!: string;

  @ApiProperty({ description: 'State parameter for verification' })
  state!: string;
}

/**
 * Query params for OAuth callback
 */
export class OAuthCallbackQueryDto {
  @ApiProperty({ description: 'Authorization code from OAuth provider' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'State parameter for verification' })
  @IsString()
  state!: string;

  @ApiPropertyOptional({ description: 'Error from OAuth provider' })
  @IsString()
  @IsOptional()
  error?: string;

  @ApiPropertyOptional({ description: 'Error description' })
  @IsString()
  @IsOptional()
  error_description?: string;
}

/**
 * Response DTO for OAuth callback success
 */
export class OAuthCallbackResponseDto {
  @ApiProperty({ description: 'Whether OAuth was successful' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Integration ID (new or updated)' })
  integrationId?: string;

  @ApiPropertyOptional({ description: 'URL to redirect to' })
  redirectUrl?: string;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'Connected email address' })
  email?: string;
}

/**
 * Response DTO for OAuth status check
 */
export class OAuthStatusDto {
  @ApiProperty({ description: 'OAuth provider (e.g., google)' })
  provider!: string;

  @ApiProperty({ description: 'Whether OAuth is configured on the server' })
  configured!: boolean;

  @ApiPropertyOptional({ description: 'Supported provider types' })
  supportedProviders?: string[];
}

/**
 * DTO for email filter options used in sync
 */
export class EmailFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by sender email address',
    example: 'alice@example.com',
  })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter by recipient email address',
    example: 'bob@example.com',
  })
  @IsString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Filter by subject (partial match)',
    example: 'Report',
  })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Filter by body text (partial match)',
    example: 'meeting notes',
  })
  @IsString()
  @IsOptional()
  text?: string;

  @ApiPropertyOptional({
    description: 'Filter emails after this date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsDateString()
  @IsOptional()
  since?: string;

  @ApiPropertyOptional({
    description: 'Filter emails before this date (ISO 8601)',
    example: '2024-12-31',
  })
  @IsDateString()
  @IsOptional()
  before?: string;

  @ApiPropertyOptional({
    description: 'Filter by read/unread status',
  })
  @IsBoolean()
  @IsOptional()
  seen?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by flagged/starred status',
  })
  @IsBoolean()
  @IsOptional()
  flagged?: boolean;

  @ApiPropertyOptional({
    description: 'Folders to include (defaults to INBOX)',
    example: ['INBOX', '[Gmail]/Sent Mail'],
  })
  @IsString({ each: true })
  @IsOptional()
  folders?: string[];
}

/**
 * DTO for sync options
 */
export class SyncOptionsDto {
  @ApiPropertyOptional({
    description: 'Maximum number of emails to sync (default: 100)',
    example: 100,
    minimum: 1,
    maximum: 1000,
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter criteria for emails',
    type: EmailFilterDto,
  })
  @ValidateNested()
  @Type(() => EmailFilterDto)
  @IsOptional()
  filters?: EmailFilterDto;

  @ApiPropertyOptional({
    description:
      'Whether to sync only new emails since last sync (default: true)',
  })
  @IsBoolean()
  @IsOptional()
  incrementalOnly?: boolean;

  @ApiPropertyOptional({
    description:
      'Selected folders for Google Drive sync (overrides saved config)',
    example: [{ id: 'folder123', name: 'My Documents' }],
  })
  @IsOptional()
  selectedFolders?: Array<{ id: string; name: string }>;

  @ApiPropertyOptional({
    description:
      'Folders to exclude from sync (subfolders of selected folders)',
    example: [{ id: 'folder456', name: 'Archived' }],
  })
  @IsOptional()
  excludedFolders?: Array<{ id: string; name: string }>;
}

/**
 * DTO for updating folder configuration (for recurring syncs)
 */
export class UpdateFolderConfigDto {
  @ApiProperty({
    description: 'Folders to sync recursively',
    example: [{ id: 'folder123', name: 'Documents' }],
  })
  @IsArray()
  selectedFolders!: Array<{ id: string; name: string }>;

  @ApiPropertyOptional({
    description: 'Folders to exclude (subfolders of selected)',
    example: [{ id: 'folder456', name: 'Archive' }],
  })
  @IsArray()
  @IsOptional()
  excludedFolders?: Array<{ id: string; name: string }>;
}

/**
 * DTO for folder file count request
 */
export class FolderCountRequestDto {
  @ApiProperty({
    description: 'Folder ID to count files in',
    example: 'folder123',
  })
  @IsString()
  folderId!: string;
}

/**
 * DTO for folder file count response
 */
export class FolderCountResponseDto {
  @ApiProperty({ description: 'Folder ID' })
  folderId!: string;

  @ApiProperty({ description: 'Estimated file count' })
  estimatedCount!: number;

  @ApiProperty({ description: 'Whether the count is exact or estimated' })
  isExact!: boolean;
}

/**
 * Folder statistics DTO
 */
export class FolderStatsDto {
  @ApiProperty({ description: 'Folder path' })
  path!: string;

  @ApiProperty({ description: 'Folder display name' })
  name!: string;

  @ApiProperty({ description: 'Total messages in folder' })
  totalMessages!: number;

  @ApiProperty({ description: 'Unread messages in folder' })
  unreadMessages!: number;
}

/**
 * Response DTO for sync preview
 */
export class SyncPreviewDto {
  @ApiProperty({
    description: 'Folder statistics',
    type: [FolderStatsDto],
  })
  folders!: FolderStatsDto[];

  @ApiProperty({ description: 'Total emails across all folders' })
  totalEmails!: number;

  @ApiProperty({ description: 'Total unread emails' })
  totalUnread!: number;

  @ApiProperty({ description: 'Emails matching current filters' })
  matchingEmails!: number;

  @ApiProperty({ description: 'Emails already imported' })
  importedEmails!: number;

  @ApiProperty({ description: 'New emails available to sync' })
  newEmails!: number;

  @ApiPropertyOptional({ description: 'Last sync timestamp' })
  lastSyncedAt?: Date;

  @ApiPropertyOptional({ description: 'Filters applied for preview' })
  appliedFilters?: EmailFilterDto;
}

// =============================================================================
// Sync Configuration DTOs (V2)
// =============================================================================

/**
 * Schedule configuration for automated sync runs
 */
export class SyncScheduleDto {
  @ApiProperty({
    description: 'Whether scheduled sync is enabled',
    example: true,
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description: 'Sync interval in minutes (15 min to 24 hours)',
    example: 60,
    minimum: 15,
    maximum: 1440,
  })
  @IsInt()
  @Min(15)
  @Max(1440)
  intervalMinutes!: number;

  @ApiPropertyOptional({
    description: 'Last scheduled run timestamp (ISO 8601)',
  })
  @IsDateString()
  @IsOptional()
  lastRunAt?: string;

  @ApiPropertyOptional({
    description: 'Next scheduled run timestamp (ISO 8601)',
  })
  @IsDateString()
  @IsOptional()
  nextRunAt?: string;
}

/**
 * Full sync configuration response DTO
 */
export class SyncConfigurationDto {
  @ApiProperty({
    description: 'Unique identifier for the configuration',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    description: 'Configuration name (unique within integration)',
    example: 'Quick Daily Check',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the configuration',
    example: 'Fast sync of recent emails from inbox only',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Whether this is the default configuration',
    example: true,
  })
  @IsBoolean()
  isDefault!: boolean;

  @ApiProperty({
    description: 'Sync options for this configuration',
    type: SyncOptionsDto,
  })
  @ValidateNested()
  @Type(() => SyncOptionsDto)
  options!: SyncOptionsDto;

  @ApiPropertyOptional({
    description: 'Schedule settings for automated runs',
    type: SyncScheduleDto,
  })
  @ValidateNested()
  @Type(() => SyncScheduleDto)
  @IsOptional()
  schedule?: SyncScheduleDto;

  @ApiPropertyOptional({
    description: 'User ID who created this configuration',
  })
  @IsUUID()
  @IsOptional()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'User ID who last updated this configuration',
  })
  @IsUUID()
  @IsOptional()
  updatedBy?: string;

  @ApiProperty({
    description: 'Creation timestamp (ISO 8601)',
  })
  @IsDateString()
  createdAt!: string;

  @ApiProperty({
    description: 'Last update timestamp (ISO 8601)',
  })
  @IsDateString()
  updatedAt!: string;
}

/**
 * DTO for creating a new sync configuration
 */
export class CreateSyncConfigurationDto {
  @ApiProperty({
    description: 'Configuration name (unique within integration)',
    example: 'Quick Daily Check',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @Transform(({ value }) => value?.trim())
  name!: string;

  @ApiPropertyOptional({
    description: 'Optional description of the configuration',
    example: 'Fast sync of recent emails from inbox only',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({
    description: 'Set as default configuration (defaults to true if first)',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiProperty({
    description: 'Sync options for this configuration',
    type: SyncOptionsDto,
  })
  @ValidateNested()
  @Type(() => SyncOptionsDto)
  options!: SyncOptionsDto;

  @ApiPropertyOptional({
    description: 'Schedule settings for automated runs',
    type: SyncScheduleDto,
  })
  @ValidateNested()
  @Type(() => SyncScheduleDto)
  @IsOptional()
  schedule?: SyncScheduleDto;
}

/**
 * DTO for updating a sync configuration (all fields optional)
 */
export class UpdateSyncConfigurationDto {
  @ApiPropertyOptional({
    description: 'Configuration name (unique within integration)',
    example: 'Quick Daily Check',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  name?: string;

  @ApiPropertyOptional({
    description: 'Optional description of the configuration',
    example: 'Fast sync of recent emails from inbox only',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({
    description: 'Set as default configuration',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({
    description: 'Sync options for this configuration',
    type: SyncOptionsDto,
  })
  @ValidateNested()
  @Type(() => SyncOptionsDto)
  @IsOptional()
  options?: SyncOptionsDto;

  @ApiPropertyOptional({
    description: 'Schedule settings for automated runs',
    type: SyncScheduleDto,
  })
  @ValidateNested()
  @Type(() => SyncScheduleDto)
  @IsOptional()
  schedule?: SyncScheduleDto;
}

/**
 * Response DTO for listing sync configurations
 */
export class SyncConfigurationListDto {
  @ApiProperty({
    description: 'List of sync configurations',
    type: [SyncConfigurationDto],
  })
  @ValidateNested({ each: true })
  @Type(() => SyncConfigurationDto)
  configurations!: SyncConfigurationDto[];

  @ApiProperty({
    description: 'Total number of configurations',
    example: 3,
  })
  @IsInt()
  total!: number;
}
