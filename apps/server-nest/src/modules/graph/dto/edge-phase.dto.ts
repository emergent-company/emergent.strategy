import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * EdgePhaseDto: Defines a single phase of multi-phase graph traversal.
 *
 * Phases are executed sequentially, with each phase starting from nodes discovered
 * by previous phases. This enables complex queries like:
 * - Phase 1: Follow "depends_on" outbound up to 2 hops
 * - Phase 2: From Phase 1 results, follow "implemented_by" inbound 1 hop
 *
 * Use cases:
 * - "Show all dependencies and their implementations"
 * - "Find requirements, their designs, and test cases"
 * - "Navigate hierarchies then cross-references"
 */
export class EdgePhaseDto {
  /**
   * Relationship types to follow in this phase.
   * If empty/undefined, all relationship types are allowed.
   */
  @ApiPropertyOptional({
    description:
      'Relationship types to follow in this phase. If omitted, all types are allowed.',
    example: ['DEPENDS_ON', 'REQUIRES'],
    type: [String],
    maxItems: 32,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  relationshipTypes?: string[];

  /**
   * Edge traversal direction for this phase.
   * - 'out': Follow outbound edges (src -> dst)
   * - 'in': Follow inbound edges (dst <- src)
   * - 'both': Follow edges in both directions
   */
  @ApiProperty({
    description:
      'Edge traversal direction: out (src->dst), in (dst<-src), or both',
    enum: ['out', 'in', 'both'],
    example: 'out',
  })
  @IsIn(['out', 'in', 'both'])
  direction!: 'out' | 'in' | 'both';

  /**
   * Maximum depth (hops) to traverse in this phase.
   * Depth is relative to the starting nodes of this phase (results from previous phase).
   *
   * Example: maxDepth=2 means traverse up to 2 edges from phase start nodes.
   */
  @ApiProperty({
    description:
      'Maximum depth (hops) to traverse in this phase, relative to phase start nodes',
    minimum: 1,
    maximum: 8,
    example: 2,
  })
  @IsInt()
  @Min(1)
  @Max(8)
  maxDepth!: number;

  /**
   * Optional object type filter for nodes discovered in this phase.
   * Only nodes matching one of these types will be included.
   */
  @ApiPropertyOptional({
    description:
      'Filter discovered nodes by object types. Only matching types included.',
    example: ['Implementation', 'TestCase'],
    type: [String],
    maxItems: 64,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  objectTypes?: string[];

  /**
   * Optional label filter for nodes discovered in this phase.
   * Only nodes having at least one of these labels will be included.
   */
  @ApiPropertyOptional({
    description:
      'Filter discovered nodes by labels. Nodes must have at least one matching label.',
    example: ['verified', 'high-priority'],
    type: [String],
    maxItems: 64,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  labels?: string[];
}

/**
 * Extended TraverseGraphDto properties for phased traversal.
 *
 * When `edgePhases` is provided:
 * - Legacy direction/max_depth/relationship_types are ignored
 * - Each phase defines its own constraints
 * - Phases execute sequentially (Phase N starts from Phase N-1 results)
 * - Response includes `phaseIndex` for each discovered node
 */
export class PhasedTraversalOptions {
  /**
   * Array of traversal phases to execute sequentially.
   *
   * Execution flow:
   * 1. Phase 0 starts from root_ids
   * 2. Each subsequent phase starts from nodes discovered by previous phase
   * 3. Nodes are tagged with the phase that discovered them
   *
   * Example:
   * ```json
   * {
   *   "root_ids": ["req-1", "req-2"],
   *   "edgePhases": [
   *     {
   *       "relationshipTypes": ["depends_on"],
   *       "direction": "out",
   *       "maxDepth": 2
   *     },
   *     {
   *       "relationshipTypes": ["implemented_by"],
   *       "direction": "in",
   *       "maxDepth": 1,
   *       "objectTypes": ["TestCase"]
   *     }
   *   ]
   * }
   * ```
   *
   * Constraints:
   * - Maximum 8 phases per traversal
   * - Each phase inherits global max_nodes/max_edges limits
   * - object_types and labels filters apply per-phase
   */
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => EdgePhaseDto)
  edgePhases!: EdgePhaseDto[];
}
