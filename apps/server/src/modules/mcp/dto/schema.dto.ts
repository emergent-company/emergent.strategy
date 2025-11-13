/**
 * DTOs for MCP Schema Tools
 *
 * These DTOs define the structure for template pack schemas,
 * object types, and relationship types exposed via MCP.
 */

import { ApiProperty } from '@nestjs/swagger';

export class TemplatePackSummaryDto {
  @ApiProperty({ description: 'Unique identifier for the template pack' })
  id!: string;

  @ApiProperty({ description: 'Display name of the template pack' })
  name!: string;

  @ApiProperty({ description: 'Semantic version of the pack' })
  version!: string;

  @ApiProperty({ description: 'Brief description of the pack purpose' })
  description!: string;

  @ApiProperty({ description: 'Number of object types in this pack' })
  object_type_count!: number;

  @ApiProperty({ description: 'Number of relationship types in this pack' })
  relationship_type_count!: number;
}

export class ObjectTypeSchemaDto {
  @ApiProperty({ description: 'Type name (e.g., "Person", "Task")' })
  name!: string;

  @ApiProperty({ description: 'Human-readable label' })
  label!: string;

  @ApiProperty({ description: 'Description of this object type' })
  description!: string;

  @ApiProperty({
    description: 'JSON schema defining properties for this type',
    type: 'object',
  })
  properties!: Record<string, any>;

  @ApiProperty({
    description: 'Required property names',
    type: [String],
  })
  required!: string[];

  @ApiProperty({
    description: 'Display configuration (icon, color, etc)',
    type: 'object',
    required: false,
  })
  display?: Record<string, any>;
}

export class RelationshipTypeSchemaDto {
  @ApiProperty({ description: 'Relationship type name (e.g., "assigned_to")' })
  name!: string;

  @ApiProperty({ description: 'Human-readable label' })
  label!: string;

  @ApiProperty({ description: 'Description of this relationship' })
  description!: string;

  @ApiProperty({ description: 'Source object type name' })
  source_type!: string;

  @ApiProperty({ description: 'Target object type name' })
  target_type!: string;

  @ApiProperty({
    description: 'Relationship cardinality',
    enum: ['one-to-one', 'one-to-many', 'many-to-many'],
  })
  cardinality!: 'one-to-one' | 'one-to-many' | 'many-to-many';

  @ApiProperty({
    description: 'Additional properties for the relationship',
    type: 'object',
    required: false,
  })
  properties?: Record<string, any>;
}

export class TemplatePackDetailsDto {
  @ApiProperty({ description: 'Unique identifier for the template pack' })
  id!: string;

  @ApiProperty({ description: 'Display name of the template pack' })
  name!: string;

  @ApiProperty({ description: 'Semantic version of the pack' })
  version!: string;

  @ApiProperty({ description: 'Brief description of the pack purpose' })
  description!: string;

  @ApiProperty({
    description: 'Object type definitions',
    type: [ObjectTypeSchemaDto],
  })
  object_types!: ObjectTypeSchemaDto[];

  @ApiProperty({
    description: 'Relationship type definitions',
    type: [RelationshipTypeSchemaDto],
  })
  relationship_types!: RelationshipTypeSchemaDto[];

  @ApiProperty({
    description: 'Metadata (created_at, updated_at, etc)',
    type: 'object',
    required: false,
  })
  metadata?: Record<string, any>;
}

export class SchemaVersionDto {
  @ApiProperty({
    description: 'Hash representing current schema state',
    example: 'a1b2c3d4e5f6g7h8',
  })
  version!: string;

  @ApiProperty({
    description: 'ISO timestamp of last schema update',
    example: '2025-10-20T10:30:00.000Z',
  })
  updated_at!: string;

  @ApiProperty({
    description: 'Suggested cache TTL in seconds',
    example: 300,
  })
  cache_hint_ttl!: number;
}

export class SchemaChangeDto {
  @ApiProperty({ description: 'Template pack ID' })
  pack_id!: string;

  @ApiProperty({ description: 'New version number' })
  version!: string;

  @ApiProperty({ description: 'Schema hash for this version' })
  schema_hash!: string;

  @ApiProperty({ description: 'ISO timestamp of change' })
  created_at!: string;

  @ApiProperty({
    description: 'Type of change',
    enum: ['created', 'updated', 'deleted'],
    required: false,
  })
  change_type?: 'created' | 'updated' | 'deleted';
}
