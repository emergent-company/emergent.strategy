import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Folder selection mode for Google Drive sync
 */
export enum FolderMode {
  /** Sync all files the user has access to */
  ALL = 'all',
  /** Sync specific selected folders */
  SPECIFIC = 'specific',
  /** Sync selected Shared Drives (Team Drives) */
  SHARED_DRIVES = 'shared_drives',
}

/**
 * Selected folder reference
 */
export class SelectedFolderDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  path?: string;
}

/**
 * Selected Shared Drive reference
 */
export class SelectedSharedDriveDto {
  @IsString()
  id: string;

  @IsString()
  name: string;
}

/**
 * File filter options for Google Drive sync
 */
export class DriveFileFiltersDto {
  /**
   * MIME types to include (e.g., ['application/pdf', 'text/*'])
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mimeTypes?: string[];

  /**
   * MIME types to exclude (e.g., ['video/*', 'audio/*'])
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  excludeMimeTypes?: string[];

  /**
   * Maximum file size in MB (default: 50)
   */
  @IsNumber()
  @IsOptional()
  maxFileSizeMB?: number;
}

/**
 * Google Drive OAuth Configuration DTO
 *
 * Stores OAuth tokens, folder selection, and sync preferences for Google Drive.
 * This data is encrypted before storage.
 */
export class GoogleDriveConfigDto {
  /**
   * Google account email address
   * @example 'user@gmail.com'
   */
  @IsString()
  email: string;

  /**
   * OAuth2 access token
   */
  @IsString()
  accessToken: string;

  /**
   * OAuth2 refresh token
   */
  @IsString()
  refreshToken: string;

  /**
   * Access token expiration timestamp (milliseconds since epoch)
   */
  @IsNumber()
  @IsOptional()
  expiresAt?: number;

  /**
   * OAuth2 scope granted
   */
  @IsString()
  @IsOptional()
  scope?: string;

  /**
   * Folder selection mode
   */
  @IsEnum(FolderMode)
  @IsOptional()
  folderMode?: FolderMode;

  /**
   * Selected folders (for 'specific' mode)
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedFolderDto)
  @IsOptional()
  selectedFolders?: SelectedFolderDto[];

  /**
   * Excluded folders (subfolders of selected folders to skip)
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedFolderDto)
  @IsOptional()
  excludedFolders?: SelectedFolderDto[];

  /**
   * Selected Shared Drives (for 'shared_drives' mode)
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedSharedDriveDto)
  @IsOptional()
  selectedSharedDrives?: SelectedSharedDriveDto[];

  /**
   * File filters
   */
  @ValidateNested()
  @Type(() => DriveFileFiltersDto)
  @IsOptional()
  fileFilters?: DriveFileFiltersDto;

  /**
   * Change token for incremental sync
   */
  @IsString()
  @IsOptional()
  changeToken?: string;

  /**
   * Last full sync timestamp
   */
  @IsNumber()
  @IsOptional()
  lastFullSyncAt?: number;
}

/**
 * JSON Schema for Google Drive configuration
 * Note: This schema is minimal since OAuth flow handles authentication
 */
export const GOOGLE_DRIVE_CONFIG_SCHEMA = {
  type: 'object',
  required: [],
  properties: {
    email: {
      type: 'string',
      title: 'Google Account',
      description:
        'Your Google account email address (set automatically after OAuth)',
      readOnly: true,
    },
    folderMode: {
      type: 'string',
      title: 'Folder Selection',
      description: 'Choose which folders to sync',
      enum: ['all', 'specific', 'shared_drives'],
      default: 'all',
    },
  },
  // UI hints - OAuth flow will populate these
  'ui:authType': 'oauth',
  'ui:authProvider': 'google',
};

/**
 * Drive file metadata from Google Drive API
 */
export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  driveId?: string;
  trashed?: boolean;
}

/**
 * Drive folder item for browsing
 */
export interface DriveFolderItem {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  childCount?: number;
}

/**
 * Shared Drive info
 */
export interface SharedDriveInfo {
  id: string;
  name: string;
  colorRgb?: string;
}

/**
 * Document metadata stored for Drive files
 */
export interface DriveDocumentMetadata {
  /** Google Drive file ID */
  driveFileId: string;
  /** Parent folder ID */
  driveFolderId?: string;
  /** Shared Drive ID (if from a Shared Drive) */
  sharedDriveId?: string;
  /** Shared Drive name */
  sharedDriveName?: string;
  /** Original MIME type */
  mimeType: string;
  /** Exported MIME type (if Google Workspace file was exported) */
  exportedMimeType?: string;
  /** File size in bytes */
  fileSizeBytes?: number;
  /** URL to view in Google Drive */
  webViewLink?: string;
  /** Direct download link (if available) */
  webContentLink?: string;
  /** File creation time in Drive */
  driveCreatedTime?: string;
  /** File modification time in Drive */
  driveModifiedTime?: string;
  /** Full folder path */
  folderPath?: string;
  /** Provider identifier */
  provider: 'google_drive';
}
