/**
 * DTOs for MCP Data Tools
 *
 * These DTOs define the structure for graph objects and relationships
 * exposed via MCP tools.
 */

import { ApiProperty } from '@nestjs/swagger';

export class GraphObjectDto {
  @ApiProperty({ description: 'Unique object identifier (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Object type name (e.g., "Person", "Task")' })
  type_name!: string;

  @ApiProperty({ description: 'Business key (human-readable identifier)' })
  key!: string;

  @ApiProperty({ description: 'Display name' })
  name!: string;

  @ApiProperty({
    description: 'Object properties (type-specific)',
    type: 'object',
  })
  properties!: Record<string, any>;

  @ApiProperty({ description: 'ISO timestamp when object was created' })
  created_at!: string;

  @ApiProperty({ description: 'ISO timestamp when object was last updated' })
  updated_at!: string;

  @ApiProperty({
    description: 'Metadata (source, confidence, etc)',
    type: 'object',
    required: false,
  })
  metadata?: Record<string, any>;
}

export class PersonDto extends GraphObjectDto {
  @ApiProperty({
    description: 'Department name',
    example: 'Engineering',
    required: false,
  })
  department?: string;

  @ApiProperty({
    description: 'Job role/title',
    example: 'Software Engineer',
    required: false,
  })
  role?: string;

  @ApiProperty({
    description: 'Email address',
    example: 'john.doe@example.com',
    required: false,
  })
  email?: string;

  @ApiProperty({
    description: 'Skills list',
    type: [String],
    required: false,
  })
  skills?: string[];
}

export class TaskDto extends GraphObjectDto {
  @ApiProperty({
    description: 'Task status',
    enum: ['todo', 'in_progress', 'done', 'blocked'],
    required: false,
  })
  status?: 'todo' | 'in_progress' | 'done' | 'blocked';

  @ApiProperty({
    description: 'Task priority',
    enum: ['low', 'medium', 'high', 'critical'],
    required: false,
  })
  priority?: 'low' | 'medium' | 'high' | 'critical';

  @ApiProperty({
    description: 'ID of assigned person',
    required: false,
  })
  assignee_id?: string;

  @ApiProperty({
    description: 'ISO timestamp due date',
    example: '2025-10-25T00:00:00.000Z',
    required: false,
  })
  due_date?: string;

  @ApiProperty({
    description: 'Task description',
    required: false,
  })
  description?: string;
}

export class RelationshipDto {
  @ApiProperty({ description: 'Unique relationship identifier (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Relationship type name (e.g., "assigned_to")' })
  type_name!: string;

  @ApiProperty({ description: 'Source object ID' })
  source_id!: string;

  @ApiProperty({ description: 'Target object ID' })
  target_id!: string;

  @ApiProperty({
    description: 'Relationship properties',
    type: 'object',
    required: false,
  })
  properties?: Record<string, any>;

  @ApiProperty({ description: 'ISO timestamp when relationship was created' })
  created_at!: string;

  @ApiProperty({
    description: 'Metadata (confidence, source, etc)',
    type: 'object',
    required: false,
  })
  metadata?: Record<string, any>;
}

export class ToolResultMetadataDto {
  @ApiProperty({
    description: 'Schema version hash for cache validation',
    example: 'a1b2c3d4e5f6g7h8',
    required: false,
  })
  schema_version?: string;

  @ApiProperty({
    description: 'Unix timestamp until which result can be cached',
    example: 1729425600000,
    required: false,
  })
  cached_until?: number;

  @ApiProperty({
    description: 'Number of items returned',
    required: false,
  })
  count?: number;

  @ApiProperty({
    description: 'Whether more results are available',
    required: false,
  })
  has_more?: boolean;

  // Additional context-specific metadata
  [key: string]: any;
}

export class ToolResultDto<T = any> {
  @ApiProperty({ description: 'Whether the tool execution succeeded' })
  success!: boolean;

  @ApiProperty({
    description: 'Result data (type varies by tool)',
    required: false,
  })
  data?: T;

  @ApiProperty({
    description: 'Error message if success is false',
    required: false,
  })
  error?: string;

  @ApiProperty({
    description: 'Additional metadata',
    type: ToolResultMetadataDto,
    required: false,
  })
  metadata?: ToolResultMetadataDto;
}
