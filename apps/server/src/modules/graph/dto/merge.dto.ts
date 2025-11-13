import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class BranchMergeRequestDto {
  @IsUUID()
  @ApiProperty({ description: 'Source branch to merge from' })
  sourceBranchId!: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      'If true, attempt to apply the merge (will fail with 409 if any conflicts). When false or omitted, performs a dry-run only.',
  })
  execute?: boolean;

  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Optional enumeration limit override (must be <= server max). Primarily for testing.',
  })
  limit?: number;
}

export enum BranchMergeObjectStatus {
  Unchanged = 'unchanged',
  Added = 'added', // exists only on source branch
  FastForward = 'fast_forward', // target has no divergent change; apply source head
  Conflict = 'conflict', // changed on both with overlapping paths different
}

// Reuse same status enum for relationships for now (semantic parity)
export const BranchMergeRelationshipStatus = BranchMergeObjectStatus;
export type BranchMergeRelationshipStatus = BranchMergeObjectStatus;

export class BranchMergeObjectSummaryDto {
  @ApiProperty({ description: 'Canonical object id' })
  canonical_id!: string;
  @ApiProperty({ enum: BranchMergeObjectStatus })
  status!: BranchMergeObjectStatus;
  @ApiProperty({
    description: 'Head version id on source branch',
    nullable: true,
  })
  source_head_id!: string | null;
  @ApiProperty({
    description: 'Head version id on target branch',
    nullable: true,
  })
  target_head_id!: string | null;
  @ApiProperty({
    description: 'Changed property paths on source since LCA',
    isArray: true,
    type: String,
  })
  source_paths!: string[];
  @ApiProperty({
    description:
      'Changed property paths on target since LCA (empty if no divergence)',
    isArray: true,
    type: String,
  })
  target_paths!: string[];
  @ApiPropertyOptional({
    description:
      'List of conflicting property paths (subset intersection of source/target paths with differing final values)',
    isArray: true,
    type: String,
  })
  conflicts?: string[];
}

export class BranchMergeSummaryDto {
  @ApiProperty({ description: 'Target branch the merge would apply to' })
  targetBranchId!: string;
  @ApiProperty({ description: 'Source branch provided in request' })
  sourceBranchId!: string;
  @ApiProperty({
    description: 'True if this response is only a dry-run (always true in MVP)',
  })
  dryRun!: boolean;
  @ApiProperty({ description: 'Total divergent canonical objects considered' })
  total_objects!: number;
  @ApiProperty({
    description: 'Count of objects unchanged after merge (no action needed)',
  })
  unchanged_count!: number;
  @ApiProperty({ description: 'Count of objects newly added by source branch' })
  added_count!: number;
  @ApiProperty({
    description:
      'Count of objects that can be applied without conflict (fast-forward or safe merge)',
  })
  fast_forward_count!: number;
  @ApiProperty({
    description: 'Count of objects with conflicts requiring manual resolution',
  })
  conflict_count!: number;
  @ApiProperty({ type: [BranchMergeObjectSummaryDto] })
  objects!: BranchMergeObjectSummaryDto[];
  @ApiPropertyOptional({
    description: 'Set when enumeration truncated due to limit cap',
  })
  truncated?: boolean;
  @ApiPropertyOptional({
    description: 'Server enforced hard limit (for client visibility)',
  })
  hard_limit?: number;
  @ApiPropertyOptional({
    description:
      'True when merge changes were applied (execute=true & no conflicts)',
  })
  applied?: boolean;
  @ApiPropertyOptional({
    description:
      'Number of objects mutated/created during apply (added + fast_forward)',
  })
  applied_objects?: number;
  @ApiPropertyOptional({
    description: 'Total divergent canonical relationships considered',
  })
  relationships_total?: number;
  @ApiPropertyOptional({
    description:
      'Count of relationships unchanged after merge (no action needed)',
  })
  relationships_unchanged_count?: number;
  @ApiPropertyOptional({
    description: 'Count of relationships newly added by source branch',
  })
  relationships_added_count?: number;
  @ApiPropertyOptional({
    description:
      'Count of relationships that can be applied without conflict (fast-forward or safe merge)',
  })
  relationships_fast_forward_count?: number;
  @ApiPropertyOptional({
    description:
      'Count of relationships with conflicts requiring manual resolution',
  })
  relationships_conflict_count?: number;
  @ApiPropertyOptional({ type: () => [BranchMergeRelationshipSummaryDto] })
  relationships?: BranchMergeRelationshipSummaryDto[];
}

export class BranchMergeRelationshipSummaryDto {
  @ApiProperty({ description: 'Canonical relationship id' })
  canonical_id!: string;
  @ApiProperty({ enum: BranchMergeRelationshipStatus })
  status!: BranchMergeRelationshipStatus;
  @ApiProperty({
    description: 'Head version id on source branch',
    nullable: true,
  })
  source_head_id!: string | null;
  @ApiProperty({
    description: 'Head version id on target branch',
    nullable: true,
  })
  target_head_id!: string | null;
  @ApiProperty({
    description: 'Source node id (src) on source head',
    nullable: true,
  })
  source_src_id!: string | null;
  @ApiProperty({
    description: 'Destination node id (dst) on source head',
    nullable: true,
  })
  source_dst_id!: string | null;
  @ApiProperty({
    description: 'Source node id (src) on target head',
    nullable: true,
  })
  target_src_id!: string | null;
  @ApiProperty({
    description: 'Destination node id (dst) on target head',
    nullable: true,
  })
  target_dst_id!: string | null;
  @ApiProperty({
    description: 'Changed property paths on source since LCA',
    isArray: true,
    type: String,
  })
  source_paths!: string[];
  @ApiProperty({
    description:
      'Changed property paths on target since LCA (empty if no divergence)',
    isArray: true,
    type: String,
  })
  target_paths!: string[];
  @ApiPropertyOptional({
    description:
      'List of conflicting property paths (subset intersection of source/target paths with differing final values)',
    isArray: true,
    type: String,
  })
  conflicts?: string[];
}

declare module './merge.dto' {
  // no-op to satisfy potential augmentation tooling
  // placeholder
}
