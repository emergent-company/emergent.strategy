import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { GraphService } from '../../graph/graph.service';
import { SchemaVersionService } from '../services/schema-version.service';
import { GraphObjectDto, ToolResultDto } from '../dto/data.dto';

/**
 * Generic Data Tool
 *
 * Provides fallback MCP tools for querying any object type in the knowledge graph
 * when type-specific tools (Person, Task) are not sufficient.
 *
 * These tools return raw GraphObjectDto without transformation, making them
 * flexible for any object type but requiring agents to understand the generic structure.
 *
 * Tools:
 * - data_getObjectsByType: Query objects of any type with pagination
 * - data_getObjectById: Fetch any object by ID when type is unknown
 * - data_getRelatedObjects: Generic relationship traversal
 */
@Injectable()
export class GenericDataTool {
  constructor(
    private readonly graphService: GraphService,
    private readonly schemaVersionService: SchemaVersionService
  ) {}

  /**
   * Get objects by type with optional filtering and pagination
   *
   * This is a fallback tool for querying object types that don't have
   * dedicated specific tools (e.g., Company, Project, Document).
   *
   * @param type - Object type to query (e.g., 'Company', 'Document')
   * @param limit - Maximum number of objects to return (default: 20, max: 100)
   * @param cursor - Pagination cursor from previous response
   * @param label - Optional label filter to narrow results
   * @returns Array of generic graph objects with pagination cursor
   *
   * @example
   * // Get companies with pagination
   * data_getObjectsByType({ type: 'Company', limit: 10 })
   *
   * // Get documents with specific label
   * data_getObjectsByType({ type: 'Document', label: 'invoice' })
   */
  @Tool({
    name: 'data_getObjectsByType',
    description:
      'Get objects of a specific type with pagination. Use this for object types without dedicated tools (Company, Document, etc.). Returns generic graph objects.',
    parameters: z.object({
      type: z
        .string()
        .describe(
          'The object type to query (e.g., Company, Document, Project)'
        ),
      limit: z
        .number()
        .optional()
        .describe(
          'Maximum number of objects to return (default: 20, max: 100)'
        ),
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from previous response'),
      label: z.string().optional().describe('Optional label to filter objects'),
    }),
  })
  async data_getObjectsByType(params: {
    type: string;
    limit?: number;
    cursor?: string;
    label?: string;
  }): Promise<ToolResultDto<GraphObjectDto[]>> {
    try {
      // Validate and cap limit
      const limit = Math.min(params.limit || 20, 100);

      // Query objects of specified type
      const result = await this.graphService.searchObjects({
        type: params.type,
        label: params.label,
        limit,
        cursor: params.cursor,
      });

      // Transform GraphObjectDto from graph service to MCP format
      const objects: GraphObjectDto[] = result.items.map((obj) => ({
        id: obj.id,
        type_name: obj.type,
        key: obj.key || '',
        name: obj.labels?.[0] || obj.key || 'Unnamed',
        properties: obj.properties || {},
        created_at: obj.created_at,
        updated_at: obj.created_at, // Reuse created_at (no updated_at in graph)
        metadata: {
          labels: obj.labels || [],
          canonical_id: obj.canonical_id,
          version: obj.version,
        },
      }));

      return {
        success: true,
        data: objects,
        metadata: {
          schema_version: await this.schemaVersionService.getSchemaVersion(),
          cached_until: Date.now() + 5 * 60 * 1000, // 5 minutes from now
          next_cursor: result.next_cursor,
          total_returned: objects.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error querying objects by type',
        metadata: {
          schema_version: 'placeholder-version',
        },
      };
    }
  }

  /**
   * Get a single object by ID without knowing its type
   *
   * Use this when you have an object ID but don't know the type,
   * or when the type doesn't have a dedicated specific tool.
   *
   * @param id - The object ID to fetch
   * @returns Single generic graph object
   *
   * @example
   * // Get any object by ID
   * data_getObjectById({ id: '123e4567-e89b-12d3-a456-426614174000' })
   */
  @Tool({
    name: 'data_getObjectById',
    description:
      'Get any object by ID without knowing its type. Returns generic graph object with all properties.',
    parameters: z.object({
      id: z.string().describe('The unique identifier of the object to fetch'),
    }),
  })
  async data_getObjectById(params: {
    id: string;
  }): Promise<ToolResultDto<GraphObjectDto>> {
    try {
      // Fetch object by ID (type-agnostic)
      const obj = await this.graphService.getObject(params.id);

      // Transform to MCP format
      const object: GraphObjectDto = {
        id: obj.id,
        type_name: obj.type,
        key: obj.key || '',
        name: obj.labels?.[0] || obj.key || 'Unnamed',
        properties: obj.properties || {},
        created_at: obj.created_at,
        updated_at: obj.created_at, // Reuse created_at (no updated_at in graph)
        metadata: {
          labels: obj.labels || [],
          canonical_id: obj.canonical_id,
          version: obj.version,
        },
      };

      return {
        success: true,
        data: object,
        metadata: {
          schema_version: await this.schemaVersionService.getSchemaVersion(),
          cached_until: Date.now() + 5 * 60 * 1000, // 5 minutes from now
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error fetching object by ID',
        metadata: {
          schema_version: 'placeholder-version',
        },
      };
    }
  }

  /**
   * Get objects related to a given object through relationships
   *
   * Generic relationship traversal tool. Use this when you need to follow
   * relationships that aren't covered by specific tools (e.g., getTaskAssignees).
   *
   * @param object_id - The ID of the source object
   * @param relationship_type - Optional filter by relationship type (e.g., 'assigned_to', 'depends_on')
   * @param direction - Direction of relationships: 'out' (outgoing), 'in' (incoming), or 'both' (default: 'both')
   * @param limit - Maximum number of related objects to return (default: 20, max: 100)
   * @returns Array of related objects with relationship information
   *
   * @example
   * // Get all objects related to a project
   * data_getRelatedObjects({ object_id: 'project-123' })
   *
   * // Get tasks that depend on a specific task (incoming 'depends_on' relationships)
   * data_getRelatedObjects({
   *   object_id: 'task-456',
   *   relationship_type: 'depends_on',
   *   direction: 'in'
   * })
   */
  @Tool({
    name: 'data_getRelatedObjects',
    description:
      'Get objects related to a given object through relationships. Supports filtering by relationship type and direction.',
    parameters: z.object({
      object_id: z
        .string()
        .describe('The ID of the object to get related objects for'),
      relationship_type: z
        .string()
        .optional()
        .describe(
          'Optional filter by relationship type (e.g., assigned_to, depends_on)'
        ),
      direction: z
        .enum(['out', 'in', 'both'])
        .optional()
        .describe('Direction: out (outgoing), in (incoming), both (default)'),
      limit: z
        .number()
        .optional()
        .describe(
          'Maximum number of related objects to return (default: 20, max: 100)'
        ),
    }),
  })
  async data_getRelatedObjects(params: {
    object_id: string;
    relationship_type?: string;
    direction?: 'out' | 'in' | 'both';
    limit?: number;
  }): Promise<
    ToolResultDto<
      Array<
        GraphObjectDto & {
          relationship_type: string;
          relationship_direction: 'out' | 'in';
        }
      >
    >
  > {
    try {
      // Validate and cap limit
      const limit = Math.min(params.limit || 20, 100);
      const direction = params.direction || 'both';

      // Collect edges from requested direction(s)
      const edges = [];

      if (direction === 'out' || direction === 'both') {
        const outEdges = await this.graphService.listEdges(
          params.object_id,
          'out',
          limit
        );
        edges.push(
          ...outEdges.map((e) => ({ ...e, direction: 'out' as const }))
        );
      }

      if (direction === 'in' || direction === 'both') {
        const inEdges = await this.graphService.listEdges(
          params.object_id,
          'in',
          limit
        );
        edges.push(...inEdges.map((e) => ({ ...e, direction: 'in' as const })));
      }

      // Filter by relationship type if specified
      const filteredEdges = params.relationship_type
        ? edges.filter((e) => e.type === params.relationship_type)
        : edges;

      // Take only up to limit after filtering
      const limitedEdges = filteredEdges.slice(0, limit);

      // Fetch related objects
      const relatedObjectIds = limitedEdges.map((e) =>
        e.direction === 'out' ? e.dst_id : e.src_id
      );

      // Fetch all related objects
      const relatedObjects = await Promise.all(
        relatedObjectIds.map((id) => this.graphService.getObject(id))
      );

      // Transform to MCP format with relationship info
      const objectsWithRelationships = relatedObjects.map((obj, idx) => {
        const edge = limitedEdges[idx];
        return {
          id: obj.id,
          type_name: obj.type,
          key: obj.key || '',
          name: obj.labels?.[0] || obj.key || 'Unnamed',
          properties: obj.properties || {},
          created_at: obj.created_at,
          updated_at: obj.created_at, // Reuse created_at (no updated_at in graph)
          metadata: {
            labels: obj.labels || [],
            canonical_id: obj.canonical_id,
            version: obj.version,
          },
          relationship_type: edge.type,
          relationship_direction: edge.direction,
        };
      });

      return {
        success: true,
        data: objectsWithRelationships,
        metadata: {
          schema_version: await this.schemaVersionService.getSchemaVersion(),
          cached_until: Date.now() + 5 * 60 * 1000, // 5 minutes from now
          total_returned: objectsWithRelationships.length,
          total_edges: edges.length,
          filtered_edges: filteredEdges.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error fetching related objects',
        metadata: {
          schema_version: 'placeholder-version',
        },
      };
    }
  }
}
