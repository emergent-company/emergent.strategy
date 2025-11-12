import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Graph expansion DTO – richer variant of traversal with projection & property filtering.
 * Differences vs TraverseGraphDto:
 *  - Always returns a single pass (no pagination window slicing) – full bounded expansion until limits hit.
 *  - Allows property projection: include / exclude paths (simple shallow keys for now).
 *  - Optionally include full relationship objects (properties) when include_relationship_properties=true.
 */
export class GraphExpandProjectionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  include_object_properties?: string[]; // whitelist of top-level property keys to include

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
  exclude_object_properties?: string[]; // blacklisted top-level property keys (applied after include whitelist)
}

export class GraphExpandDto {
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
  max_nodes?: number = 400; // expand returns bigger default window than traverse page slice

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15000)
  max_edges?: number = 800;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
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

  @IsOptional()
  @ValidateNested()
  @Type(() => GraphExpandProjectionDto)
  projection?: GraphExpandProjectionDto;

  @IsOptional()
  @IsBoolean()
  include_relationship_properties?: boolean = false;
}
