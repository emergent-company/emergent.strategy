import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/**
 * Request DTO for bounded graph traversal (BFS).
 * root_ids: starting object ids (depth 0)
 * direction: edge orientation to follow
 * max_depth: maximum hop distance from any root (0 returns only roots)
 * max_nodes / max_edges: safety caps to prevent large explosions
 * relationship_types: optional allow-list for relationship types
 * object_types / labels: optional filters applied to INCLUDED nodes (nodes failing filters will not be added / expanded)
 */
export class TraverseGraphDto {
    @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
    root_ids!: string[];

    @IsOptional() @IsIn(['out', 'in', 'both'])
    direction?: 'out' | 'in' | 'both' = 'both';

    @IsOptional() @IsInt() @Min(0) @Max(8)
    max_depth?: number = 2;

    @IsOptional() @IsInt() @Min(1) @Max(5000)
    max_nodes?: number = 200;

    @IsOptional() @IsInt() @Min(1) @Max(10000)
    max_edges?: number = 400;

    @IsOptional() @IsArray() @ArrayMaxSize(32) @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
    relationship_types?: string[];

    @IsOptional() @IsArray() @ArrayMaxSize(64) @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
    object_types?: string[];

    @IsOptional() @IsArray() @ArrayMaxSize(64) @Matches(/^[A-Za-z0-9_.:-]{1,64}$/, { each: true })
    labels?: string[];

    // Pagination (breaking change addition): supports bidirectional cursor-based paging over ordered node list.
    // limit: page size (default 50, max 200)
    @IsOptional() @IsInt() @Min(1) @Max(200)
    limit?: number = 50;

    // direction: 'forward' (default) or 'backward' relative to cursor position.
    @IsOptional() @IsIn(['forward', 'backward'])
    page_direction?: 'forward' | 'backward' = 'forward';

    // Opaque cursor produced by previous page (encodes depth & id of boundary item).
    @IsOptional() @IsString()
    cursor?: string;
}
