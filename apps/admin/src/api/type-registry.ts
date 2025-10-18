/**
 * Type Registry API Client
 * 
 * Provides access to the project's object type registry
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
}

export interface TypeRegistryStats {
    total_types: number;
    enabled_types: number;
    template_types: number;
    custom_types: number;
    discovered_types: number;
    total_objects: number;
    types_with_objects: number;
}

export function createTypeRegistryClient(
    apiBase: string,
    fetchJson: <T>(url: string, options?: RequestInit) => Promise<T>
) {
    return {
        /**
         * Get all object types for a project
         */
        async getProjectTypes(projectId: string): Promise<TypeRegistryEntryDto[]> {
            return fetchJson<TypeRegistryEntryDto[]>(
                `${apiBase}/api/type-registry/projects/${projectId}`
            );
        },

        /**
         * Get a specific object type definition
         */
        async getObjectType(projectId: string, typeName: string): Promise<TypeRegistryEntryDto> {
            return fetchJson<TypeRegistryEntryDto>(
                `${apiBase}/api/type-registry/projects/${projectId}/types/${typeName}`
            );
        },

        /**
         * Get stats for project's type registry
         */
        async getTypeStats(projectId: string): Promise<TypeRegistryStats> {
            return fetchJson<TypeRegistryStats>(
                `${apiBase}/api/type-registry/projects/${projectId}/stats`
            );
        },
    };
}
