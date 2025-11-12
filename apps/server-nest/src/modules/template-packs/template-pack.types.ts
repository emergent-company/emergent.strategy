/**
 * Template Pack entity interfaces matching database schema
 */

export interface TemplatePackRow {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  repository_url?: string;
  documentation_url?: string;
  source?: 'manual' | 'discovered' | 'imported' | 'system';
  discovery_job_id?: string;
  pending_review?: boolean;
  object_type_schemas: Record<string, any>;
  relationship_type_schemas: Record<string, any>;
  ui_configs: Record<string, any>;
  extraction_prompts: Record<string, any>;
  sql_views: any[];
  signature?: string;
  checksum?: string;
  published_at: string;
  deprecated_at?: string;
  superseded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectTemplatePackRow {
  id: string;
  organization_id: string;
  project_id: string;
  template_pack_id: string;
  installed_at: string;
  installed_by: string;
  active: boolean;
  customizations: {
    enabledTypes?: string[];
    disabledTypes?: string[];
    schemaOverrides?: Record<string, any>;
  };
  created_at: string;
  updated_at: string;
}

export interface ProjectTypeRegistryRow {
  id: string;
  organization_id: string;
  project_id: string;
  type: string;
  source: 'template' | 'custom' | 'discovered';
  template_pack_id?: string;
  schema_version: number;
  json_schema: any;
  ui_config: Record<string, any>;
  extraction_config: Record<string, any>;
  enabled: boolean;
  discovery_confidence?: number;
  description?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}
