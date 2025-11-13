import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EdgePhaseDto } from './edge-phase.dto';
import { PredicateDto } from './predicate.dto';
import { TemporalFilterDto } from './temporal-filter.dto';

/**
 * Request DTO for bounded graph traversal (BFS).
 * root_ids: starting object ids (depth 0)
 * direction: edge orientation to follow
 * max_depth: maximum hop distance from any root (0 returns only roots)
 * max_nodes / max_edges: safety caps to prevent large explosions
 * relationship_types: optional allow-list for relationship types
 * object_types / labels: optional filters applied to INCLUDED nodes (nodes failing filters will not be added / expanded)
 *
 * PHASE 3 ENHANCEMENT: Phased Traversal
 * edgePhases: Define multiple sequential traversal phases with different constraints.
 *             When provided, legacy direction/max_depth/relationship_types are ignored.
 */
export class TraverseGraphDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  root_ids!: string[];

  @IsOptional()
  @IsIn(['out', 'in', 'both'])
  direction?: 'out' | 'in' | 'both' = 'both';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  max_depth?: number = 2;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  max_nodes?: number = 200;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  max_edges?: number = 400;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  relationship_types?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  object_types?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  labels?: string[];

  // Pagination (breaking change addition): supports bidirectional cursor-based paging over ordered node list.
  // limit: page size (default 50, max 200)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  // direction: 'forward' (default) or 'backward' relative to cursor position.
  @IsOptional()
  @IsIn(['forward', 'backward'])
  page_direction?: 'forward' | 'backward' = 'forward';

  // Opaque cursor produced by previous page (encodes depth & id of boundary item).
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * PHASE 3: Phased Traversal
   *
   * Define multiple sequential traversal phases, each with its own relationship types,
   * direction, depth limit, and filters. Phases execute in order, with each phase
   * starting from nodes discovered by the previous phase.
   *
   * When edgePhases is provided:
   * - Legacy direction, max_depth, relationship_types are ignored
   * - object_types and labels apply globally unless overridden per-phase
   * - Response includes phaseIndex indicating which phase discovered each node
   *
   * Example:
   * ```json
   * {
   *   "root_ids": ["requirement-1"],
   *   "edgePhases": [
   *     {
   *       "relationshipTypes": ["depends_on"],
   *       "direction": "out",
   *       "maxDepth": 2
   *     },
   *     {
   *       "relationshipTypes": ["implemented_by", "tested_by"],
   *       "direction": "in",
   *       "maxDepth": 1
   *     }
   *   ]
   * }
   * ```
   */
  @ApiPropertyOptional({
    description:
      'Define multiple sequential traversal phases with different constraints per phase. When provided, legacy direction/max_depth/relationship_types are ignored.',
    type: [EdgePhaseDto],
    maxItems: 8,
    example: [
      { relationshipTypes: ['DEPENDS_ON'], direction: 'out', maxDepth: 2 },
      {
        relationshipTypes: ['IMPLEMENTED_BY'],
        direction: 'in',
        maxDepth: 1,
        objectTypes: ['TestCase'],
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => EdgePhaseDto)
  edgePhases?: EdgePhaseDto[];

  /**
   * PHASE 3: Property Predicate Filtering (Node Filter)
   *
   * Filter nodes based on property values using JSON Pointer paths and operators.
   * Only nodes satisfying ALL predicates will be included in results.
   *
   * Example: Only include nodes with status="active"
   * ```json
   * {
   *   "root_ids": ["node1"],
   *   "nodeFilter": {
   *     "path": "/status",
   *     "operator": "equals",
   *     "value": "active"
   *   }
   * }
   * ```
   */
  @ApiPropertyOptional({
    description:
      'Filter nodes by property values using JSON Pointer paths and comparison operators. Only nodes satisfying the predicate are included.',
    type: PredicateDto,
    example: { path: '/status', operator: 'equals', value: 'active' },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PredicateDto)
  nodeFilter?: PredicateDto;

  /**
   * PHASE 3: Property Predicate Filtering (Edge Filter)
   *
   * Filter edges based on property values.
   * Only edges satisfying the predicate will be traversed.
   *
   * Example: Only traverse edges with confidence > 0.7
   * ```json
   * {
   *   "root_ids": ["node1"],
   *   "edgeFilter": {
   *     "path": "/confidence",
   *     "operator": "greaterThan",
   *     "value": 0.7
   *   }
   * }
   * ```
   */
  @ApiPropertyOptional({
    description:
      'Filter edges by property values. Only edges satisfying the predicate will be traversed.',
    type: PredicateDto,
    example: { path: '/confidence', operator: 'greaterThan', value: 0.7 },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PredicateDto)
  edgeFilter?: PredicateDto;

  /**
   * PHASE 3: Path Enumeration
   *
   * When true, include full paths from root nodes to each result node.
   * Each path is an array of node IDs showing the traversal route.
   * Nodes reachable via multiple paths will have multiple path entries.
   *
   * Example:
   * ```json
   * {
   *   "root_ids": ["A"],
   *   "returnPaths": true,
   *   "maxPathsPerNode": 5
   * }
   * ```
   *
   * Result node might have:
   * ```json
   * {
   *   "id": "D",
   *   "paths": [["A", "B", "D"], ["A", "C", "D"]]
   * }
   * ```
   */
  @ApiPropertyOptional({
    description:
      'When true, include full paths from root nodes to each result node. Each path is an array of node IDs showing the traversal route.',
    type: Boolean,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  returnPaths?: boolean;

  /**
   * PHASE 3: Maximum paths to track per node (used with returnPaths).
   *
   * Limits memory usage when a node is reachable via many routes.
   * Default: 10, Max: 100
   */
  @ApiPropertyOptional({
    description:
      'Maximum paths to track per node (used with returnPaths). Limits memory usage when a node is reachable via many routes.',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxPathsPerNode?: number = 10;

  /**
   * PHASE 3: Temporal Filtering
   *
   * Filter nodes and edges based on temporal validity.
   * Enables point-in-time queries to see the graph state at a specific timestamp.
   *
   * Example: Show graph as it was on December 31, 2024
   * ```json
   * {
   *   "root_ids": ["project-1"],
   *   "temporalFilter": {
   *     "asOf": "2024-12-31T23:59:59Z",
   *     "field": "valid_from"
   *   }
   * }
   * ```
   *
   * When temporalFilter is provided:
   * - Nodes/edges with valid_from > asOf are excluded
   * - Nodes/edges with valid_to <= asOf are excluded (if valid_to is set)
   * - Useful for historical analysis, audit trails, and time-travel queries
   */
  @ApiPropertyOptional({
    description:
      'Filter nodes and edges based on temporal validity. Enables point-in-time queries to see historical graph state.',
    type: TemporalFilterDto,
    example: { asOf: '2024-12-31T23:59:59Z', field: 'valid_from' },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TemporalFilterDto)
  temporalFilter?: TemporalFilterDto;

  /**
   * PHASE 3: Field Pruning Strategy
   *
   * Controls which fields are included in the response to reduce payload size.
   * Based on salience scores (importance/frequency of use):
   *
   * - **full** (default): All fields included, no pruning
   * - **compact**: Removes low-salience fields (paths, phaseIndex, some pagination metadata)
   *   Reduces payload by ~25% on average
   * - **minimal**: Only essential fields (id, type, depth, core topology)
   *   Reduces payload by ~45% on average
   *
   * Use 'compact' for API consumers that don't need path enumeration.
   * Use 'minimal' for high-volume queries where bandwidth is critical.
   *
   * Example:
   * ```json
   * {
   *   "root_ids": ["node-1"],
   *   "max_depth": 3,
   *   "fieldStrategy": "compact"
   * }
   * ```
   */
  @ApiPropertyOptional({
    description:
      'Field pruning strategy to control response payload size. compact removes paths/phaseIndex (~25% reduction), minimal keeps only essential fields (~45% reduction).',
    enum: ['full', 'compact', 'minimal'],
    default: 'full',
    example: 'compact',
  })
  @IsOptional()
  @IsIn(['full', 'compact', 'minimal'])
  fieldStrategy?: 'full' | 'compact' | 'minimal' = 'full';
}
