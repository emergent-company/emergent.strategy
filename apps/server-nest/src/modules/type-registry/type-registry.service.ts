import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
    CreateObjectTypeDto,
    UpdateObjectTypeDto,
    TypeRegistryEntryDto,
    ListObjectTypesQueryDto,
    ValidateObjectDataDto,
    ValidationResult,
} from './dto/type-registry.dto';
import { ProjectTypeRegistryRow } from '../template-packs/template-pack.types';

@Injectable()
export class TypeRegistryService {
    private readonly logger = new Logger(TypeRegistryService.name);

    constructor(private readonly db: DatabaseService) { }

    /**
     * Get all types for a project
     */
    async getProjectTypes(
        projectId: string,
        orgId: string,
        query: ListObjectTypesQueryDto
    ): Promise<TypeRegistryEntryDto[]> {
        let whereConditions = ['ptr.project_id = $1', 'ptr.organization_id = $2'];
        const params: any[] = [projectId, orgId];
        let paramIndex = 3;

        if (query.enabled_only) {
            whereConditions.push('ptr.enabled = true');
        }

        if (query.source && query.source !== 'all') {
            whereConditions.push(`ptr.source = $${paramIndex++}`);
            params.push(query.source);
        }

        if (query.search) {
            whereConditions.push(`(ptr.type ILIKE $${paramIndex} OR ptr.description ILIKE $${paramIndex})`);
            params.push(`%${query.search}%`);
            paramIndex++;
        }

        const sql = `
            SELECT 
                ptr.*,
                tp.name as template_pack_name,
                COUNT(go.id) FILTER (WHERE go.deleted_at IS NULL) as object_count
            FROM kb.project_object_type_registry ptr
            LEFT JOIN kb.graph_template_packs tp ON ptr.template_pack_id = tp.id
            LEFT JOIN kb.graph_objects go ON go.type = ptr.type 
                AND go.project_id = ptr.project_id 
                AND go.deleted_at IS NULL
            WHERE ${whereConditions.join(' AND ')}
            GROUP BY ptr.id, tp.name
            ORDER BY ptr.type
        `;

        const result = await this.db.query<TypeRegistryEntryDto>(sql, params);
        return result.rows;
    }

    /**
     * Get a specific type by name
     */
    async getTypeByName(
        projectId: string,
        orgId: string,
        typeName: string
    ): Promise<TypeRegistryEntryDto> {
        const result = await this.db.query<TypeRegistryEntryDto>(
            `SELECT 
                ptr.*,
                tp.name as template_pack_name,
                COUNT(go.id) FILTER (WHERE go.deleted_at IS NULL) as object_count
            FROM kb.project_object_type_registry ptr
            LEFT JOIN kb.graph_template_packs tp ON ptr.template_pack_id = tp.id
            LEFT JOIN kb.graph_objects go ON go.type = ptr.type 
                AND go.project_id = ptr.project_id 
                AND go.deleted_at IS NULL
            WHERE ptr.project_id = $1 
                AND ptr.organization_id = $2 
                AND ptr.type = $3
            GROUP BY ptr.id, tp.name`,
            [projectId, orgId, typeName]
        );

        if (result.rows.length === 0) {
            throw new NotFoundException(`Type not found: ${typeName}`);
        }

        return result.rows[0];
    }

    /**
     * Create a custom object type
     */
    async createCustomType(
        projectId: string,
        orgId: string,
        tenantId: string,
        userId: string,
        dto: CreateObjectTypeDto
    ): Promise<ProjectTypeRegistryRow> {
        // Validate JSON Schema syntax
        if (dto.json_schema) {
            try {
                // Basic schema validation - check required structure
                if (typeof dto.json_schema !== 'object') {
                    throw new Error('Schema must be a JSON object');
                }
                // TODO: Add full JSON Schema validation when AJV is added
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                throw new BadRequestException(`Invalid JSON Schema: ${errorMessage}`);
            }
        }

        // Check if type already exists
        const existing = await this.db.query<{ id: string }>(
            `SELECT id FROM kb.project_object_type_registry 
             WHERE project_id = $1 AND organization_id = $2 AND type = $3`,
            [projectId, orgId, dto.type]
        );

        if (existing.rows.length > 0) {
            throw new ConflictException(`Type already exists: ${dto.type}`);
        }

        const result = await this.db.query<ProjectTypeRegistryRow>(
            `INSERT INTO kb.project_object_type_registry (
                tenant_id, organization_id, project_id, type, source,
                json_schema, ui_config, extraction_config, enabled,
                discovery_confidence, description, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                tenantId,
                orgId,
                projectId,
                dto.type,
                dto.source,
                JSON.stringify(dto.json_schema),
                JSON.stringify(dto.ui_config || {}),
                JSON.stringify(dto.extraction_config || {}),
                dto.enabled !== undefined ? dto.enabled : true,
                dto.discovery_confidence || null,
                dto.description || null,
                userId,
            ]
        );

        this.logger.log(`Created custom type: ${dto.type} for project ${projectId}`);
        return result.rows[0];
    }

    /**
     * Update an existing type
     */
    async updateType(
        projectId: string,
        orgId: string,
        typeName: string,
        dto: UpdateObjectTypeDto
    ): Promise<ProjectTypeRegistryRow> {
        // Get existing type
        const existing = await this.getTypeByName(projectId, orgId, typeName);

        // Validate new schema if provided
        if (dto.json_schema) {
            try {
                // Basic schema validation - check required structure
                if (typeof dto.json_schema !== 'object') {
                    throw new Error('Schema must be a JSON object');
                }
                // TODO: Add full JSON Schema validation when AJV is added
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                throw new BadRequestException(`Invalid JSON Schema: ${errorMessage}`);
            }
        }

        // Prevent modifying template types (only allow enabling/disabling)
        if (existing.source === 'template' && (dto.json_schema || dto.extraction_config)) {
            throw new BadRequestException(
                'Cannot modify schema or extraction config of template types. ' +
                'You can only enable/disable them or override UI config.'
            );
        }

        const updates: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (dto.json_schema !== undefined) {
            updates.push(`json_schema = $${paramIndex++}`);
            params.push(JSON.stringify(dto.json_schema));

            // Increment schema version if schema changed
            updates.push(`schema_version = schema_version + 1`);
        }

        if (dto.ui_config !== undefined) {
            updates.push(`ui_config = $${paramIndex++}`);
            params.push(JSON.stringify(dto.ui_config));
        }

        if (dto.extraction_config !== undefined) {
            updates.push(`extraction_config = $${paramIndex++}`);
            params.push(JSON.stringify(dto.extraction_config));
        }

        if (dto.description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(dto.description);
        }

        if (dto.enabled !== undefined) {
            updates.push(`enabled = $${paramIndex++}`);
            params.push(dto.enabled);
        }

        if (updates.length === 0) {
            return existing as ProjectTypeRegistryRow;
        }

        updates.push(`updated_at = now()`);
        params.push(projectId, orgId, typeName);

        const result = await this.db.query<ProjectTypeRegistryRow>(
            `UPDATE kb.project_object_type_registry 
             SET ${updates.join(', ')}
             WHERE project_id = $${paramIndex} 
                AND organization_id = $${paramIndex + 1} 
                AND type = $${paramIndex + 2}
             RETURNING *`,
            params
        );

        this.logger.log(`Updated type: ${typeName} for project ${projectId}`);
        return result.rows[0];
    }

    /**
     * Delete a custom type
     */
    async deleteType(
        projectId: string,
        orgId: string,
        typeName: string
    ): Promise<void> {
        // Get type
        const type = await this.getTypeByName(projectId, orgId, typeName);

        // Prevent deleting template types
        if (type.source === 'template') {
            throw new BadRequestException(
                'Cannot delete template types. Uninstall the template pack instead or disable the type.'
            );
        }

        // Check if any objects exist
        const objectCount = parseInt(type.object_count?.toString() || '0');
        if (objectCount > 0) {
            throw new BadRequestException(
                `Cannot delete type: ${objectCount} objects still exist with this type. ` +
                `Delete or migrate these objects first.`
            );
        }

        await this.db.query(
            `DELETE FROM kb.project_object_type_registry 
             WHERE project_id = $1 AND organization_id = $2 AND type = $3`,
            [projectId, orgId, typeName]
        );

        this.logger.log(`Deleted type: ${typeName} from project ${projectId}`);
    }

    /**
     * Validate object data against type schema
     * TODO: Implement full validation with AJV when library is added
     */
    async validateObjectData(
        projectId: string,
        orgId: string,
        dto: ValidateObjectDataDto
    ): Promise<ValidationResult> {
        // Get type schema
        const type = await this.getTypeByName(projectId, orgId, dto.type);

        if (!type.enabled) {
            throw new BadRequestException(`Type is disabled: ${dto.type}`);
        }

        // Basic validation - check if schema exists
        if (!type.json_schema) {
            this.logger.warn(`Type ${dto.type} has no schema defined, skipping validation`);
            return { valid: true };
        }

        // TODO: Implement full JSON Schema validation with AJV
        // For now, just validate that required properties exist
        const schema = type.json_schema as any;
        const errors: Array<{ path: string; message: string; keyword: string }> = [];

        if (schema.required && Array.isArray(schema.required)) {
            for (const requiredProp of schema.required) {
                if (!(requiredProp in dto.properties)) {
                    errors.push({
                        path: `/${requiredProp}`,
                        message: `Missing required property: ${requiredProp}`,
                        keyword: 'required',
                    });
                }
            }
        }

        if (errors.length > 0) {
            return { valid: false, errors };
        }

        return { valid: true };
    }

    /**
     * Get schema for a specific type
     */
    async getTypeSchema(
        projectId: string,
        orgId: string,
        typeName: string
    ): Promise<{
        type: string;
        json_schema: any;
        ui_schema: any;
        validation_rules: any;
    }> {
        const type = await this.getTypeByName(projectId, orgId, typeName);

        return {
            type: type.type,
            json_schema: type.json_schema,
            ui_schema: type.ui_config,
            validation_rules: {
                required: type.json_schema.required || [],
                properties: type.json_schema.properties || {},
            },
        };
    }

    /**
     * Enable/Disable a type
     */
    async toggleType(
        projectId: string,
        orgId: string,
        typeName: string,
        enabled: boolean
    ): Promise<ProjectTypeRegistryRow> {
        return this.updateType(projectId, orgId, typeName, { enabled });
    }

    /**
     * Get type statistics for a project
     */
    async getTypeStatistics(
        projectId: string,
        orgId: string
    ): Promise<{
        total_types: number;
        enabled_types: number;
        template_types: number;
        custom_types: number;
        discovered_types: number;
        total_objects: number;
        types_with_objects: number;
    }> {
        const result = await this.db.query<any>(
            `SELECT 
                COUNT(DISTINCT ptr.id) as total_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.enabled = true) as enabled_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.source = 'template') as template_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.source = 'custom') as custom_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.source = 'discovered') as discovered_types,
                COUNT(go.id) FILTER (WHERE go.deleted_at IS NULL) as total_objects,
                COUNT(DISTINCT go.type) FILTER (WHERE go.deleted_at IS NULL) as types_with_objects
            FROM kb.project_object_type_registry ptr
            LEFT JOIN kb.graph_objects go ON go.type = ptr.type 
                AND go.project_id = ptr.project_id
            WHERE ptr.project_id = $1 AND ptr.organization_id = $2`,
            [projectId, orgId]
        );

        const row = result.rows[0];
        return {
            total_types: parseInt(row.total_types) || 0,
            enabled_types: parseInt(row.enabled_types) || 0,
            template_types: parseInt(row.template_types) || 0,
            custom_types: parseInt(row.custom_types) || 0,
            discovered_types: parseInt(row.discovered_types) || 0,
            total_objects: parseInt(row.total_objects) || 0,
            types_with_objects: parseInt(row.types_with_objects) || 0,
        };
    }
}
