import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProjectObjectTypeRegistry } from '../../entities/project-object-type-registry.entity';
import {
  CreateObjectTypeDto,
  UpdateObjectTypeDto,
  TypeRegistryEntryDto,
  ListObjectTypesQueryDto,
  ValidateObjectDataDto,
  ValidationResult,
  RelationshipTypeInfo,
} from './dto/type-registry.dto';
import { ProjectTypeRegistryRow } from '../template-packs/template-pack.types';

@Injectable()
export class TypeRegistryService {
  private readonly logger = new Logger(TypeRegistryService.name);

  constructor(
    @InjectRepository(ProjectObjectTypeRegistry)
    private readonly typeRegistryRepo: Repository<ProjectObjectTypeRegistry>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Derive organization ID from project ID
   * Used for tenant context - organization_id is no longer required as a parameter
   */
  private async getOrganizationIdFromProject(
    projectId: string
  ): Promise<string> {
    const orgResult = await this.dataSource.query(
      'SELECT organization_id FROM kb.projects WHERE id = $1',
      [projectId]
    );

    if (!orgResult || orgResult.length === 0) {
      throw new BadRequestException(`Project ${projectId} not found`);
    }

    return orgResult[0].organization_id;
  }

  /**
   * Get all types for a project
   * Keep as DataSource.query - complex GROUP BY with aggregations
   */
  async getProjectTypes(
    projectId: string,
    query: ListObjectTypesQueryDto
  ): Promise<TypeRegistryEntryDto[]> {
    // Derive org ID for tenant context (not used in query but available if needed)
    await this.getOrganizationIdFromProject(projectId);

    let whereConditions = ['ptr.project_id = $1'];
    const params: any[] = [projectId];
    let paramIndex = 2;

    if (query.enabled_only) {
      whereConditions.push('ptr.enabled = true');
    }

    if (query.source && query.source !== 'all') {
      whereConditions.push(`ptr.source = $${paramIndex++}`);
      params.push(query.source);
    }

    if (query.search) {
      whereConditions.push(
        `(ptr.type_name ILIKE $${paramIndex} OR ptr.description ILIKE $${paramIndex})`
      );
      params.push(`%${query.search}%`);
      paramIndex++;
    }

    const sql = `
            SELECT 
                ptr.id,
                ptr.type_name as type,
                ptr.source,
                ptr.template_pack_id,
                ptr.schema_version,
                ptr.json_schema,
                ptr.ui_config,
                ptr.extraction_config,
                ptr.enabled,
                ptr.discovery_confidence,
                ptr.description,
                ptr.created_by,
                ptr.created_at,
                ptr.updated_at,
                tp.name as template_pack_name,
                COUNT(go.id) FILTER (WHERE go.deleted_at IS NULL) as object_count
            FROM kb.project_object_type_registry ptr
            LEFT JOIN kb.graph_template_packs tp ON ptr.template_pack_id = tp.id
            LEFT JOIN kb.graph_objects go ON go.type = ptr.type_name 
                AND go.project_id = ptr.project_id 
                AND go.deleted_at IS NULL
            WHERE ${whereConditions.join(' AND ')}
            GROUP BY ptr.id, ptr.type_name, ptr.source, ptr.template_pack_id, 
                     ptr.schema_version, ptr.json_schema, ptr.ui_config, 
                     ptr.extraction_config, ptr.enabled, ptr.discovery_confidence, 
                     ptr.description, ptr.created_by, ptr.created_at, ptr.updated_at, tp.name
            ORDER BY ptr.type_name
        `;

    const result = await this.dataSource.query(sql, params);
    return result as TypeRegistryEntryDto[];
  }

  /**
   * Get a specific type by name
   * Keep as DataSource.query - complex GROUP BY with aggregations
   */
  async getTypeByName(
    projectId: string,
    typeName: string
  ): Promise<TypeRegistryEntryDto> {
    // Derive org ID for tenant context (not used in query but available if needed)
    await this.getOrganizationIdFromProject(projectId);

    const result = (await this.dataSource.query(
      `SELECT 
                ptr.id,
                ptr.type_name as type,
                ptr.source,
                ptr.template_pack_id,
                ptr.schema_version,
                ptr.json_schema,
                ptr.ui_config,
                ptr.extraction_config,
                ptr.enabled,
                ptr.discovery_confidence,
                ptr.description,
                ptr.created_by,
                ptr.created_at,
                ptr.updated_at,
                tp.name as template_pack_name,
                COUNT(go.id) FILTER (WHERE go.deleted_at IS NULL) as object_count
            FROM kb.project_object_type_registry ptr
            LEFT JOIN kb.graph_template_packs tp ON ptr.template_pack_id = tp.id
            LEFT JOIN kb.graph_objects go ON go.type = ptr.type_name 
                AND go.project_id = ptr.project_id 
                AND go.deleted_at IS NULL
            WHERE ptr.project_id = $1 
                AND ptr.type_name = $2
            GROUP BY ptr.id, ptr.type_name, ptr.source, ptr.template_pack_id, 
                     ptr.schema_version, ptr.json_schema, ptr.ui_config, 
                     ptr.extraction_config, ptr.enabled, ptr.discovery_confidence, 
                     ptr.description, ptr.created_by, ptr.created_at, ptr.updated_at, tp.name`,
      [projectId, typeName]
    )) as TypeRegistryEntryDto[];

    if (result.length === 0) {
      throw new NotFoundException(`Type not found: ${typeName}`);
    }

    const typeEntry = result[0];

    // Fetch relationship info from template packs
    const relationships = await this.getRelationshipsForType(
      projectId,
      typeName
    );
    typeEntry.outgoing_relationships = relationships.outgoing;
    typeEntry.incoming_relationships = relationships.incoming;

    return typeEntry;
  }

  /**
   * Get relationships for a specific object type from active template packs
   */
  private async getRelationshipsForType(
    projectId: string,
    typeName: string
  ): Promise<{
    outgoing: RelationshipTypeInfo[];
    incoming: RelationshipTypeInfo[];
  }> {
    // Get all active template packs for this project with their relationship schemas
    const packsResult = await this.dataSource.query(
      `SELECT tp.relationship_type_schemas
       FROM kb.project_template_packs ptp
       JOIN kb.graph_template_packs tp ON ptp.template_pack_id = tp.id
       WHERE ptp.project_id = $1 AND ptp.active = true`,
      [projectId]
    );

    const outgoing: RelationshipTypeInfo[] = [];
    const incoming: RelationshipTypeInfo[] = [];

    for (const row of packsResult) {
      const relationshipSchemas = row.relationship_type_schemas || {};

      for (const [relType, schema] of Object.entries(relationshipSchemas) as [
        string,
        any
      ][]) {
        const sourceTypes = schema.fromTypes || schema.sourceTypes || [];
        const targetTypes = schema.toTypes || schema.targetTypes || [];

        // Check if this type is a source (outgoing relationships)
        if (sourceTypes.includes(typeName)) {
          // Avoid duplicates
          if (!outgoing.find((r) => r.type === relType)) {
            outgoing.push({
              type: relType,
              label: schema.label,
              description: schema.description,
              target_types: targetTypes,
            });
          }
        }

        // Check if this type is a target (incoming relationships)
        if (targetTypes.includes(typeName)) {
          // Avoid duplicates
          if (!incoming.find((r) => r.type === relType)) {
            incoming.push({
              type: relType,
              label: schema.label,
              inverse_label: schema.inverseLabel,
              description: schema.description,
              source_types: sourceTypes,
            });
          }
        }
      }
    }

    return { outgoing, incoming };
  }

  /**
   * Create a custom object type - Migrated to TypeORM
   */
  async createCustomType(
    projectId: string,
    orgId: string,
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
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        throw new BadRequestException(`Invalid JSON Schema: ${errorMessage}`);
      }
    }

    // Check if type already exists using TypeORM
    const existing = await this.typeRegistryRepo.findOne({
      where: { projectId, typeName: dto.type },
    });

    if (existing) {
      throw new ConflictException(`Type already exists: ${dto.type}`);
    }

    // Create new type using TypeORM
    const newType = this.typeRegistryRepo.create({
      projectId,
      typeName: dto.type,
      source: dto.source as 'template' | 'custom' | 'discovered',
      jsonSchema: dto.json_schema,
      uiConfig: dto.ui_config || {},
      extractionConfig: dto.extraction_config || {},
      enabled: dto.enabled !== undefined ? dto.enabled : true,
      discoveryConfidence: dto.discovery_confidence ?? undefined,
      description: dto.description ?? undefined,
      createdBy: userId ?? undefined,
    });

    const saved = await this.typeRegistryRepo.save(newType);

    this.logger.log(
      `Created custom type: ${dto.type} for project ${projectId}`
    );

    // Return in expected format
    return {
      id: saved.id,
      project_id: saved.projectId,
      type: saved.typeName,
      source: saved.source,
      template_pack_id: saved.templatePackId ?? null,
      schema_version: saved.schemaVersion,
      json_schema: saved.jsonSchema,
      ui_config: saved.uiConfig ?? null,
      extraction_config: saved.extractionConfig ?? null,
      enabled: saved.enabled,
      discovery_confidence: saved.discoveryConfidence ?? null,
      description: saved.description ?? null,
      created_by: saved.createdBy ?? null,
      created_at: saved.createdAt.toISOString(),
      updated_at: saved.updatedAt.toISOString(),
    } as ProjectTypeRegistryRow;
  }

  /**
   * Update an existing type - Migrated to TypeORM
   */
  async updateType(
    projectId: string,
    typeName: string,
    dto: UpdateObjectTypeDto
  ): Promise<ProjectTypeRegistryRow> {
    // Get existing type
    const existing = await this.getTypeByName(projectId, typeName);

    // Validate new schema if provided
    if (dto.json_schema) {
      try {
        // Basic schema validation - check required structure
        if (typeof dto.json_schema !== 'object') {
          throw new Error('Schema must be a JSON object');
        }
        // TODO: Add full JSON Schema validation when AJV is added
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        throw new BadRequestException(`Invalid JSON Schema: ${errorMessage}`);
      }
    }

    // Prevent modifying template types (only allow enabling/disabling)
    if (
      existing.source === 'template' &&
      (dto.json_schema || dto.extraction_config)
    ) {
      throw new BadRequestException(
        'Cannot modify schema or extraction config of template types. ' +
          'You can only enable/disable them or override UI config.'
      );
    }

    // Build update object
    const updates: Partial<ProjectObjectTypeRegistry> = {};
    let incrementVersion = false;

    if (dto.json_schema !== undefined) {
      updates.jsonSchema = dto.json_schema;
      incrementVersion = true;
    }

    if (dto.ui_config !== undefined) {
      updates.uiConfig = dto.ui_config;
    }

    if (dto.extraction_config !== undefined) {
      updates.extractionConfig = dto.extraction_config;
    }

    if (dto.description !== undefined) {
      updates.description = dto.description;
    }

    if (dto.enabled !== undefined) {
      updates.enabled = dto.enabled;
    }

    if (Object.keys(updates).length === 0) {
      return existing as ProjectTypeRegistryRow;
    }

    // Update using TypeORM
    await this.typeRegistryRepo.update({ projectId, typeName }, updates);

    // Increment schema version if schema changed
    if (incrementVersion) {
      await this.typeRegistryRepo.increment(
        { projectId, typeName },
        'schemaVersion',
        1
      );
    }

    this.logger.log(`Updated type: ${typeName} for project ${projectId}`);

    // Fetch and return updated type
    return (await this.getTypeByName(
      projectId,
      typeName
    )) as unknown as ProjectTypeRegistryRow;
  }

  /**
   * Delete a custom type - Migrated to TypeORM
   */
  async deleteType(projectId: string, typeName: string): Promise<void> {
    // Get type
    const type = await this.getTypeByName(projectId, typeName);

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

    // Delete using TypeORM
    await this.typeRegistryRepo.delete({ projectId, typeName });

    this.logger.log(`Deleted type: ${typeName} from project ${projectId}`);
  }

  /**
   * Validate object data against type schema
   * TODO: Implement full validation with AJV when library is added
   */
  async validateObjectData(
    projectId: string,
    dto: ValidateObjectDataDto
  ): Promise<ValidationResult> {
    // Get type schema
    const type = await this.getTypeByName(projectId, dto.type);

    if (!type.enabled) {
      throw new BadRequestException(`Type is disabled: ${dto.type}`);
    }

    // Basic validation - check if schema exists
    if (!type.json_schema) {
      this.logger.warn(
        `Type ${dto.type} has no schema defined, skipping validation`
      );
      return { valid: true };
    }

    // TODO: Implement full JSON Schema validation with AJV
    // For now, just validate that required properties exist
    const schema = type.json_schema as any;
    const errors: Array<{ path: string; message: string; keyword: string }> =
      [];

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
   * Get type schema including UI schema and validation rules
   */
  async getTypeSchema(
    projectId: string,
    typeName: string
  ): Promise<{
    type: string;
    json_schema: any;
    ui_schema: any;
    validation_rules: any;
  }> {
    const type = await this.getTypeByName(projectId, typeName);

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
    typeName: string,
    enabled: boolean
  ): Promise<ProjectTypeRegistryRow> {
    return this.updateType(projectId, typeName, { enabled });
  }

  /**
   * Get the schema version for a specific type in a project.
   * Used for automatic schema version tracking when creating objects.
   *
   * The schema version is the template pack version (e.g., "2.0.0").
   * For custom types without a template pack, returns null.
   *
   * @param projectId - Project ID
   * @param typeName - Type name to look up
   * @returns Template pack version string, or null if type not found or has no pack
   */
  async getSchemaVersionForType(
    projectId: string,
    typeName: string
  ): Promise<string | null> {
    try {
      const result = await this.dataSource.query(
        `SELECT tp.version as schema_version
        FROM kb.project_object_type_registry ptr
        JOIN kb.graph_template_packs tp ON ptr.template_pack_id = tp.id
        WHERE ptr.project_id = $1 AND ptr.type_name = $2 AND ptr.enabled = true`,
        [projectId, typeName]
      );

      if (result.length === 0) {
        return null;
      }

      return result[0].schema_version;
    } catch (error) {
      this.logger.warn(
        `Failed to get schema version for type ${typeName}: ${error}`
      );
      return null;
    }
  }

  /**
   * Get type statistics for a project
   */
  async getTypeStatistics(projectId: string): Promise<{
    total_types: number;
    enabled_types: number;
    template_types: number;
    custom_types: number;
    discovered_types: number;
    total_objects: number;
    types_with_objects: number;
  }> {
    // Derive org ID for tenant context (not used in query but available if needed)
    await this.getOrganizationIdFromProject(projectId);

    const result = (await this.dataSource.query(
      `SELECT 
                COUNT(DISTINCT ptr.id) as total_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.enabled = true) as enabled_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.source = 'template') as template_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.source = 'custom') as custom_types,
                COUNT(DISTINCT ptr.id) FILTER (WHERE ptr.source = 'discovered') as discovered_types,
                COUNT(go.id) FILTER (WHERE go.deleted_at IS NULL) as total_objects,
                COUNT(DISTINCT go.type) FILTER (WHERE go.deleted_at IS NULL) as types_with_objects
            FROM kb.project_object_type_registry ptr
            LEFT JOIN kb.graph_objects go ON go.type = ptr.type_name 
                AND go.project_id = ptr.project_id
            WHERE ptr.project_id = $1`,
      [projectId]
    )) as any[];

    const row = result[0];
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
