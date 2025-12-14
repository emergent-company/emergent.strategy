import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from 'class-validator';

/**
 * DTO for creating a custom object type
 */
export class CreateObjectTypeDto {
  @IsString()
  type!: string;

  @IsEnum(['custom', 'discovered'])
  source: 'custom' | 'discovered' = 'custom';

  @IsObject()
  json_schema!: Record<string, any>;

  @IsOptional()
  @IsObject()
  ui_config?: Record<string, any>;

  @IsOptional()
  @IsObject()
  extraction_config?: Record<string, any>;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.0)
  @Max(1.0)
  discovery_confidence?: number;
}

/**
 * DTO for updating an object type
 */
export class UpdateObjectTypeDto {
  @IsOptional()
  @IsObject()
  json_schema?: Record<string, any>;

  @IsOptional()
  @IsObject()
  ui_config?: Record<string, any>;

  @IsOptional()
  @IsObject()
  extraction_config?: Record<string, any>;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  schema_version?: number;
}

/**
 * Response DTO for type registry entry
 */
export interface TypeRegistryEntryDto {
  id: string;
  type: string;
  source: 'template' | 'custom' | 'discovered';
  template_pack_id?: string;
  template_pack_name?: string;
  schema_version: number;
  json_schema: any;
  ui_config: Record<string, any>;
  extraction_config: Record<string, any>;
  enabled: boolean;
  discovery_confidence?: number;
  description?: string;
  object_count?: number;
  created_at: string;
  updated_at: string;
  /** Outgoing relationships this type can have (as source) */
  outgoing_relationships?: RelationshipTypeInfo[];
  /** Incoming relationships this type can have (as target) */
  incoming_relationships?: RelationshipTypeInfo[];
}

/**
 * Relationship type info for display
 */
export interface RelationshipTypeInfo {
  type: string;
  label?: string;
  inverse_label?: string;
  description?: string;
  /** For outgoing: types this relationship can connect to */
  target_types?: string[];
  /** For incoming: types this relationship can come from */
  source_types?: string[];
}

/**
 * Query params for listing types
 */
export class ListObjectTypesQueryDto {
  @IsOptional()
  @IsBoolean()
  enabled_only?: boolean = true;

  @IsOptional()
  @IsEnum(['template', 'custom', 'discovered', 'all'])
  source?: 'template' | 'custom' | 'discovered' | 'all' = 'all';

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * DTO for validating object data against schema
 */
export interface ValidateObjectDataDto {
  type: string;
  properties: Record<string, any>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
    keyword?: string;
  }>;
}
