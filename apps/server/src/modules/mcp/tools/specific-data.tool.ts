import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { GraphService } from '../../graph/graph.service';
import { SchemaVersionService } from '../services/schema-version.service';
import { PersonDto, TaskDto, RelationshipDto } from '../dto/data.dto';
import { ToolResultDto } from '../dto/data.dto';

/**
 * Specific Data Tool - Provides type-specific query methods for common entity types
 *
 * Implements MCP tools for:
 * - Person queries (getPersons, getPerson)
 * - Task queries (getTasks, getTask)
 * - Relationship queries (getTaskAssignees, getPersonTasks)
 *
 * These tools provide better discoverability than generic "getObjectsByType"
 * while still falling back to the GenericDataTool for less common types.
 *
 * All tools include schema_version metadata for cache invalidation.
 */
@Injectable()
export class SpecificDataTool {
  constructor(
    private readonly graphService: GraphService,
    private readonly schemaVersionService: SchemaVersionService
  ) {}

  // ============================================================================
  // PERSON QUERIES
  // ============================================================================

  @Tool({
    name: 'data_getPersons',
    description:
      'Returns a list of Person objects from the knowledge base. ' +
      'Persons typically represent team members, stakeholders, or any individuals. ' +
      'Supports pagination and basic filtering by label.',
    parameters: z
      .object({
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number to return (1-100, default 20)'),
        cursor: z
          .string()
          .optional()
          .describe('Pagination cursor from previous response'),
        label: z
          .string()
          .optional()
          .describe('Filter by label (partial match)'),
      })
      .optional(),
  })
  async getPersons(params?: {
    limit?: number;
    cursor?: string;
    label?: string;
  }): Promise<ToolResultDto<PersonDto[]>> {
    try {
      const result = await this.graphService.searchObjects({
        type: 'Person',
        label: params?.label,
        limit: params?.limit || 20,
        cursor: params?.cursor,
      });

      // Transform to PersonDto
      const persons: PersonDto[] = result.items.map((obj) => ({
        id: obj.id,
        type_name: obj.type,
        key: obj.key || '',
        name: obj.labels?.[0] || obj.key || 'Unnamed',
        properties: obj.properties || {},
        created_at: obj.created_at,
        updated_at: obj.created_at, // GraphObjectDto doesn't have updated_at field
        metadata: {
          labels: obj.labels || [],
          canonical_id: obj.canonical_id,
          version: obj.version,
        },
      }));

      // TODO: Get actual schema version from service (Phase 3.5)
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: persons,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
          count: persons.length,
          next_cursor: result.next_cursor,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to retrieve persons',
      };
    }
  }

  @Tool({
    name: 'data_getPerson',
    description:
      'Returns a specific Person object by ID. ' +
      'Use this after discovering person IDs via data_getPersons or relationship queries.',
    parameters: z.object({
      id: z.string().uuid().describe('UUID of the Person object'),
    }),
  })
  async getPerson(params: { id: string }): Promise<ToolResultDto<PersonDto>> {
    try {
      const obj = await this.graphService.getObject(params.id);

      if (obj.type !== 'Person') {
        return {
          success: false,
          error: `Object ${params.id} is not a Person (type: ${obj.type})`,
        };
      }

      const person: PersonDto = {
        id: obj.id,
        type_name: obj.type,
        key: obj.key || '',
        name: obj.labels?.[0] || obj.key || 'Unnamed',
        properties: obj.properties || {},
        created_at: obj.created_at,
        updated_at: obj.created_at,
        metadata: {
          labels: obj.labels || [],
          canonical_id: obj.canonical_id,
          version: obj.version,
        },
      };

      // TODO: Get actual schema version from service (Phase 3.5)
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: person,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to retrieve person',
      };
    }
  }

  // ============================================================================
  // TASK QUERIES
  // ============================================================================

  @Tool({
    name: 'data_getTasks',
    description:
      'Returns a list of Task objects from the knowledge base. ' +
      'Tasks typically represent work items, todos, issues, or action items. ' +
      'Supports pagination and basic filtering by label.',
    parameters: z
      .object({
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number to return (1-100, default 20)'),
        cursor: z
          .string()
          .optional()
          .describe('Pagination cursor from previous response'),
        label: z
          .string()
          .optional()
          .describe('Filter by label (partial match)'),
      })
      .optional(),
  })
  async getTasks(params?: {
    limit?: number;
    cursor?: string;
    label?: string;
  }): Promise<ToolResultDto<TaskDto[]>> {
    try {
      const result = await this.graphService.searchObjects({
        type: 'Task',
        label: params?.label,
        limit: params?.limit || 20,
        cursor: params?.cursor,
      });

      // Transform to TaskDto
      const tasks: TaskDto[] = result.items.map((obj) => ({
        id: obj.id,
        type_name: obj.type,
        key: obj.key || '',
        name: obj.labels?.[0] || obj.key || 'Unnamed',
        properties: obj.properties || {},
        created_at: obj.created_at,
        updated_at: obj.created_at,
        metadata: {
          labels: obj.labels || [],
          canonical_id: obj.canonical_id,
          version: obj.version,
        },
      }));

      // TODO: Get actual schema version from service (Phase 3.5)
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: tasks,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
          count: tasks.length,
          next_cursor: result.next_cursor,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to retrieve tasks',
      };
    }
  }

  @Tool({
    name: 'data_getTask',
    description:
      'Returns a specific Task object by ID. ' +
      'Use this after discovering task IDs via data_getTasks or relationship queries.',
    parameters: z.object({
      id: z.string().uuid().describe('UUID of the Task object'),
    }),
  })
  async getTask(params: { id: string }): Promise<ToolResultDto<TaskDto>> {
    try {
      const obj = await this.graphService.getObject(params.id);

      if (obj.type !== 'Task') {
        return {
          success: false,
          error: `Object ${params.id} is not a Task (type: ${obj.type})`,
        };
      }

      const task: TaskDto = {
        id: obj.id,
        type_name: obj.type,
        key: obj.key || '',
        name: obj.labels?.[0] || obj.key || 'Unnamed',
        properties: obj.properties || {},
        created_at: obj.created_at,
        updated_at: obj.created_at,
        metadata: {
          labels: obj.labels || [],
          canonical_id: obj.canonical_id,
          version: obj.version,
        },
      };

      // TODO: Get actual schema version from service (Phase 3.5)
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: task,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to retrieve task',
      };
    }
  }

  // ============================================================================
  // RELATIONSHIP QUERIES
  // ============================================================================

  @Tool({
    name: 'data_getTaskAssignees',
    description:
      'Returns all Persons assigned to a specific Task. ' +
      'Follows outgoing "assigned_to" relationships from the Task.',
    parameters: z.object({
      task_id: z.string().uuid().describe('UUID of the Task object'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number to return (default 50)'),
    }),
  })
  async getTaskAssignees(params: {
    task_id: string;
    limit?: number;
  }): Promise<ToolResultDto<PersonDto[]>> {
    try {
      // Get outgoing edges from the task
      const edges = await this.graphService.listEdges(
        params.task_id,
        'out',
        params.limit || 50
      );

      // Filter to assigned_to relationships and fetch target persons
      const assignedToEdges = edges.filter((e) => e.type === 'assigned_to');
      const personIds = assignedToEdges.map((e) => e.dst_id);

      // Fetch all person objects
      const persons: PersonDto[] = [];
      for (const personId of personIds) {
        try {
          const obj = await this.graphService.getObject(personId);
          if (obj.type === 'Person') {
            persons.push({
              id: obj.id,
              type_name: obj.type,
              key: obj.key || '',
              name: obj.labels?.[0] || obj.key || 'Unnamed',
              properties: obj.properties || {},
              created_at: obj.created_at,
              updated_at: obj.created_at,
              metadata: {
                labels: obj.labels || [],
                canonical_id: obj.canonical_id,
                version: obj.version,
              },
            });
          }
        } catch {
          // Skip if person not found or deleted
        }
      }

      // TODO: Get actual schema version from service (Phase 3.5)
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: persons,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
          count: persons.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve task assignees',
      };
    }
  }

  @Tool({
    name: 'data_getPersonTasks',
    description:
      'Returns all Tasks assigned to a specific Person. ' +
      'Follows incoming "assigned_to" relationships to the Person.',
    parameters: z.object({
      person_id: z.string().uuid().describe('UUID of the Person object'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number to return (default 50)'),
    }),
  })
  async getPersonTasks(params: {
    person_id: string;
    limit?: number;
  }): Promise<ToolResultDto<TaskDto[]>> {
    try {
      // Get incoming edges to the person
      const edges = await this.graphService.listEdges(
        params.person_id,
        'in',
        params.limit || 50
      );

      // Filter to assigned_to relationships and fetch source tasks
      const assignedToEdges = edges.filter((e) => e.type === 'assigned_to');
      const taskIds = assignedToEdges.map((e) => e.src_id);

      // Fetch all task objects
      const tasks: TaskDto[] = [];
      for (const taskId of taskIds) {
        try {
          const obj = await this.graphService.getObject(taskId);
          if (obj.type === 'Task') {
            tasks.push({
              id: obj.id,
              type_name: obj.type,
              key: obj.key || '',
              name: obj.labels?.[0] || obj.key || 'Unnamed',
              properties: obj.properties || {},
              created_at: obj.created_at,
              updated_at: obj.created_at,
              metadata: {
                labels: obj.labels || [],
                canonical_id: obj.canonical_id,
                version: obj.version,
              },
            });
          }
        } catch {
          // Skip if task not found or deleted
        }
      }

      // TODO: Get actual schema version from service (Phase 3.5)
      const schemaVersion = await this.schemaVersionService.getSchemaVersion();

      return {
        success: true,
        data: tasks,
        metadata: {
          schema_version: schemaVersion,
          cached_until: Date.now() + 300000, // 5 min TTL hint
          count: tasks.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve person tasks',
      };
    }
  }
}
