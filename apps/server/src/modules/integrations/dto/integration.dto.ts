import { IsString, IsBoolean, IsOptional, IsObject } from 'class-validator';

/**
 * Base DTO for integration settings (will be encrypted)
 */
export interface IntegrationSettings {
  authentication?: {
    method: 'apikey' | 'oauth2' | 'basic';
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    username?: string;
    password?: string;
    [key: string]: any;
  };
  dataMapping?: Record<string, any>;
  syncSettings?: {
    autoSync?: boolean;
    syncInterval?: number;
    lastSyncAt?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * DTO for Integration entity
 */
export interface IntegrationDto {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  enabled: boolean;
  organization_id: string;
  project_id: string;
  settings?: IntegrationSettings; // Decrypted settings
  logo_url?: string;
  webhook_secret?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * DTO for creating a new integration
 */
export class CreateIntegrationDto {
  @IsString()
  name!: string;

  @IsString()
  display_name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  settings?: IntegrationSettings;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsString()
  @IsOptional()
  webhook_secret?: string;

  @IsString()
  @IsOptional()
  created_by?: string;
}

/**
 * DTO for updating an integration
 */
export class UpdateIntegrationDto {
  @IsString()
  @IsOptional()
  display_name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  settings?: IntegrationSettings;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsString()
  @IsOptional()
  webhook_secret?: string;
}

/**
 * DTO for listing integrations
 */
export class ListIntegrationsDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

/**
 * Response DTO for integration list
 */
export interface IntegrationListDto {
  items: IntegrationDto[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Public integration info (without sensitive settings)
 */
export interface PublicIntegrationDto {
  name: string;
  display_name: string;
  description?: string;
  enabled: boolean;
  logo_url?: string;
  has_configuration: boolean;
}
