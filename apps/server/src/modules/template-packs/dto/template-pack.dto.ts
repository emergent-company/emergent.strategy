import {
  IsString,
  IsOptional,
  IsObject,
  IsUrl,
  IsUUID,
  ValidateNested,
  IsArray,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new template pack
 */
export class CreateTemplatePackDto {
  @IsString()
  name!: string;

  @IsString()
  version!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  license?: string;

  @IsOptional()
  @IsUrl()
  repository_url?: string;

  @IsOptional()
  @IsUrl()
  documentation_url?: string;

  @IsObject()
  object_type_schemas!: Record<string, any>;

  @IsOptional()
  @IsObject()
  relationship_type_schemas?: Record<string, any>;

  @IsOptional()
  @IsObject()
  ui_configs?: Record<string, any>;

  @IsOptional()
  @IsObject()
  extraction_prompts?: Record<string, any>;

  @IsOptional()
  @IsArray()
  sql_views?: any[];

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  checksum?: string;
}

/**
 * DTO for customizing template pack installation
 */
export class TemplateCustomizationsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  disabledTypes?: string[];

  @IsOptional()
  @IsObject()
  schemaOverrides?: Record<string, any>;
}

/**
 * DTO for assigning template pack to project
 */
export class AssignTemplatePackDto {
  @IsUUID()
  template_pack_id!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateCustomizationsDto)
  customizations?: TemplateCustomizationsDto;
}

/**
 * DTO for updating template pack assignment
 */
export class UpdateTemplatePackAssignmentDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateCustomizationsDto)
  customizations?: TemplateCustomizationsDto;
}

/**
 * Response DTO for template pack assignment
 */
export interface AssignTemplatePackResponse {
  success: boolean;
  assignment_id: string;
  installed_types: string[];
  disabled_types: string[];
  conflicts?: Array<{
    type: string;
    issue: string;
    resolution: 'merged' | 'skipped' | 'renamed';
  }>;
}

/**
 * DTO for listing available templates
 */
export interface AvailableTemplateDto {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  source?: 'manual' | 'discovered' | 'imported' | 'system';
  object_types: Array<{
    type: string;
    description?: string;
    sample_count?: number;
  }>;
  relationship_types: string[];
  relationship_count: number;
  installed: boolean;
  active?: boolean; // Only present if installed
  assignment_id?: string; // Only present if installed
  compatible: boolean;
  published_at: string;
  deprecated_at?: string;
}

/**
 * Query params for listing template packs
 */
export class ListTemplatePacksQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  include_deprecated?: boolean = false;

  @IsOptional()
  @IsString()
  search?: string;
}
