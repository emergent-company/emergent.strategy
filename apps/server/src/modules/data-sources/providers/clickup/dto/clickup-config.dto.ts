import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Selected space reference for ClickUp sync
 */
export class SelectedSpaceDto {
  @IsString()
  id: string;

  @IsString()
  name: string;
}

/**
 * ClickUp Configuration DTO
 *
 * Stores API token and selected spaces for ClickUp Docs import.
 * This data is encrypted before storage.
 *
 * Note: OAuth support can be added later - for now we use API token authentication.
 */
export class ClickUpConfigDto {
  /**
   * ClickUp API token (personal token or OAuth access token)
   * @example 'pk_12345678_...'
   */
  @IsString()
  apiToken: string;

  /**
   * ClickUp workspace ID (required for API calls)
   * Set after successful connection test
   */
  @IsString()
  @IsOptional()
  workspaceId?: string;

  /**
   * Workspace name for display purposes
   */
  @IsString()
  @IsOptional()
  workspaceName?: string;

  /**
   * Selected spaces to import docs from
   * If empty, imports from all spaces
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedSpaceDto)
  @IsOptional()
  selectedSpaces?: SelectedSpaceDto[];

  /**
   * Include archived content in sync
   */
  @IsOptional()
  includeArchived?: boolean;

  /**
   * Last sync timestamp for incremental updates
   */
  @IsOptional()
  lastSyncedAt?: number;
}

/**
 * JSON Schema for ClickUp configuration
 * Used to generate forms in the UI
 */
export const CLICKUP_CONFIG_SCHEMA = {
  type: 'object',
  required: ['apiToken'],
  properties: {
    apiToken: {
      type: 'string',
      title: 'API Token',
      description:
        'Your ClickUp personal API token. Get it from Settings > Apps in ClickUp.',
      format: 'password',
      'ui:placeholder': 'pk_12345678_...',
    },
    workspaceId: {
      type: 'string',
      title: 'Workspace',
      description: 'Select the ClickUp workspace to import from',
      readOnly: true, // Set after connection test
    },
    workspaceName: {
      type: 'string',
      title: 'Workspace Name',
      readOnly: true,
    },
    includeArchived: {
      type: 'boolean',
      title: 'Include Archived',
      description: 'Include archived docs and spaces in sync',
      default: false,
    },
  },
  // UI hints
  'ui:authType': 'token',
  'ui:testConnection': true,
  'ui:browseEnabled': true,
};

/**
 * ClickUp browse item for workspace/space tree
 */
export interface ClickUpBrowseItem {
  id: string;
  name: string;
  type: 'workspace' | 'space' | 'doc';
  path: string;
  isFolder: boolean;
  archived?: boolean;
  docCount?: number;
  metadata?: Record<string, any>;
}

/**
 * Document metadata stored for ClickUp docs
 */
export interface ClickUpDocumentMetadata {
  /** ClickUp doc ID */
  clickupDocId: string;
  /** ClickUp workspace ID */
  clickupWorkspaceId: string;
  /** ClickUp space ID */
  clickupSpaceId?: string;
  /** ClickUp space name */
  clickupSpaceName?: string;
  /** Doc creator ID */
  creatorId?: number;
  /** Date created in ClickUp */
  clickupCreatedAt?: string;
  /** Date updated in ClickUp */
  clickupUpdatedAt?: string;
  /** Doc avatar/icon */
  avatar?: string;
  /** Whether doc is archived */
  archived?: boolean;
  /** Number of pages in doc */
  pageCount?: number;
  /** Provider identifier */
  provider: 'clickup';
}
