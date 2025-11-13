import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { TemplatePackService } from '../../template-packs/template-pack.service';
import { TemplatePackRow } from '../../template-packs/template-pack.types';
import { SchemaVersionService } from '../services/schema-version.service';
import {
  TemplatePackSummaryDto,
  TemplatePackDetailsDto,
  ObjectTypeSchemaDto,
  RelationshipTypeSchemaDto,
} from '../dto/schema.dto';
import { ToolResultDto } from '../dto/data.dto';

/**
 * Schema Tool - Exposes template pack schemas to AI agents
 *
 * Provides MCP tools for discovering:
 * - Available template packs
 * - Object type definitions (Person, Task, etc.)
 * - Relationship type definitions (assigned_to, reports_to, etc.)
 *
 * Tools include schema_version metadata for cache invalidation.
 */
@Injectable()
export class SchemaTool {
  constructor(
    private readonly templatePackService: TemplatePackService,
    private readonly schemaVersionService: SchemaVersionService
  ) {}

  @Tool({
    name: 'schema_getTemplatePacks',
    description:
      'Returns a list of all available template packs. ' +
      'Each pack defines object types (Person, Task, Project, etc.) and their relationships. ' +
      'Use this to discover what types of data are available in the knowledge base.',
  })
  async getTemplatePacks(): Promise<ToolResultDto<TemplatePackSummaryDto[]>> {
    try {
      const result = await this.templatePackService.listTemplatePacks({
        limit: 100,
        page: 1,
      });

      // Transform to summary DTOs
      const summaries: TemplatePackSummaryDto[] = result.packs.map(
        (pack: any) => {
          const objectTypes = pack.object_type_schemas || {};
          const relationshipTypes = pack.relationship_type_schemas || {};

          return {
            id: pack.id,
            name: pack.name,
            version: pack.version,
            description: pack.description || 'No description available',
            object_type_count: Object.keys(objectTypes).length,
            relationship_type_count: Object.keys(relationshipTypes).length,
          };
        }
      );

      // Get current schema version
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: summaries,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
          count: summaries.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve template packs',
      };
    }
  }

  @Tool({
    name: 'schema_getTemplatePackDetails',
    description:
      'Returns the complete schema definition for a specific template pack. ' +
      'Includes all object types with their properties and all relationship types. ' +
      'Use this after discovering pack IDs via schema_getTemplatePacks.',
    parameters: z.object({
      pack_id: z
        .string()
        .describe(
          'Unique identifier for the template pack (e.g., "core", "project-management")'
        ),
    }),
  })
  async getTemplatePackDetails(params: {
    pack_id: string;
  }): Promise<ToolResultDto<TemplatePackDetailsDto>> {
    try {
      const pack = await this.templatePackService.getTemplatePackById(
        params.pack_id
      );

      if (!pack) {
        return {
          success: false,
          error: `Template pack not found: ${params.pack_id}`,
        };
      }

      // Transform object type schemas
      const objectTypeSchemas = pack.object_type_schemas || {};
      const objectTypes: ObjectTypeSchemaDto[] = Object.entries(
        objectTypeSchemas
      ).map(([typeName, schema]: [string, any]) => ({
        name: typeName,
        label: schema.label || typeName,
        description: schema.description || '',
        properties: schema.properties || {},
        required: schema.required || [],
        display: schema.display,
      }));

      // Transform relationship type schemas
      const relationshipTypeSchemas = pack.relationship_type_schemas || {};
      const relationshipTypes: RelationshipTypeSchemaDto[] = Object.entries(
        relationshipTypeSchemas
      ).map(([relName, schema]: [string, any]) => ({
        name: relName,
        label: schema.label || relName,
        description: schema.description || '',
        source_type: schema.sourceType || schema.source_type || '',
        target_type: schema.targetType || schema.target_type || '',
        cardinality: schema.cardinality || 'many-to-many',
        properties: schema.properties,
      }));

      const details: TemplatePackDetailsDto = {
        id: pack.id,
        name: pack.name,
        version: pack.version,
        description: pack.description || 'No description available',
        object_types: objectTypes,
        relationship_types: relationshipTypes,
        metadata: {
          created_at: pack.created_at,
          updated_at: pack.updated_at,
        },
      };

      // Get current schema version
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: details,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve template pack details',
      };
    }
  }

  @Tool({
    name: 'schema_getObjectTypes',
    description:
      'Returns a list of all object types across all template packs. ' +
      'Useful for quickly discovering what entities exist (Person, Task, Project, etc.) ' +
      'without having to query each pack individually.',
    parameters: z
      .object({
        pack_id: z
          .string()
          .optional()
          .describe('Optional: filter to a specific template pack'),
      })
      .optional(),
  })
  async getObjectTypes(params?: {
    pack_id?: string;
  }): Promise<ToolResultDto<ObjectTypeSchemaDto[]>> {
    try {
      let packs: any[];

      if (params?.pack_id) {
        const pack = await this.templatePackService.getTemplatePackById(
          params.pack_id
        );
        packs = pack ? [pack] : [];
      } else {
        const result = await this.templatePackService.listTemplatePacks({
          limit: 100,
          page: 1,
        });
        packs = result.packs;
      }

      // Collect all object types
      const objectTypes: ObjectTypeSchemaDto[] = [];

      for (const pack of packs) {
        const objectTypeSchemas = pack.object_type_schemas || {};
        const types = Object.entries(objectTypeSchemas).map(
          ([typeName, schema]: [string, any]) => ({
            name: typeName,
            label: schema.label || typeName,
            description: schema.description || '',
            properties: schema.properties || {},
            required: schema.required || [],
            display: schema.display,
          })
        );
        objectTypes.push(...types);
      }

      // Get current schema version
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: objectTypes,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
          count: objectTypes.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve object types',
      };
    }
  }

  @Tool({
    name: 'schema_getRelationshipTypes',
    description:
      'Returns a list of all relationship types across all template packs. ' +
      'Shows how different object types can be connected (e.g., Person assigned_to Task).',
    parameters: z
      .object({
        pack_id: z
          .string()
          .optional()
          .describe('Optional: filter to a specific template pack'),
        source_type: z
          .string()
          .optional()
          .describe('Optional: filter by source object type (e.g., "Task")'),
        target_type: z
          .string()
          .optional()
          .describe('Optional: filter by target object type (e.g., "Person")'),
      })
      .optional(),
  })
  async getRelationshipTypes(params?: {
    pack_id?: string;
    source_type?: string;
    target_type?: string;
  }): Promise<ToolResultDto<RelationshipTypeSchemaDto[]>> {
    try {
      let packs: any[];

      if (params?.pack_id) {
        const pack = await this.templatePackService.getTemplatePackById(
          params.pack_id
        );
        packs = pack ? [pack] : [];
      } else {
        const result = await this.templatePackService.listTemplatePacks({
          limit: 100,
          page: 1,
        });
        packs = result.packs;
      }

      // Collect all relationship types
      let relationshipTypes: RelationshipTypeSchemaDto[] = [];

      for (const pack of packs) {
        const relationshipTypeSchemas = pack.relationship_type_schemas || {};
        const rels = Object.entries(relationshipTypeSchemas).map(
          ([relName, schema]: [string, any]) => ({
            name: relName,
            label: schema.label || relName,
            description: schema.description || '',
            source_type: schema.sourceType || schema.source_type || '',
            target_type: schema.targetType || schema.target_type || '',
            cardinality: schema.cardinality || 'many-to-many',
            properties: schema.properties,
          })
        );
        relationshipTypes.push(...rels);
      }

      // Apply filters
      if (params?.source_type) {
        relationshipTypes = relationshipTypes.filter(
          (rel) => rel.source_type === params.source_type
        );
      }
      if (params?.target_type) {
        relationshipTypes = relationshipTypes.filter(
          (rel) => rel.target_type === params.target_type
        );
      }

      // Get current schema version
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: relationshipTypes,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
          count: relationshipTypes.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve relationship types',
      };
    }
  }
}
