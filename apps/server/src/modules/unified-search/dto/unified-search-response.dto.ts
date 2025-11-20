import { ApiProperty } from '@nestjs/swagger';
import { GraphSearchItemDto } from '../../graph-search/dto/graph-search-response.dto';

/**
 * Type discriminator for unified search results
 */
export enum UnifiedSearchItemType {
  GRAPH = 'graph',
  TEXT = 'text',
}

/**
 * Relationship information for graph results
 */
export class UnifiedSearchRelationshipDto {
  @ApiProperty({
    description: 'ID of the related object',
    example: 'b3d52c50-5101-4c6c-8d30-4a1f0f7645cb',
  })
  object_id!: string;

  @ApiProperty({
    description: 'Type of the relationship',
    example: 'informs',
  })
  type!: string;

  @ApiProperty({
    description: 'Direction of the relationship relative to the result',
    enum: ['in', 'out'],
    example: 'out',
  })
  direction!: 'in' | 'out';

  @ApiProperty({
    description: 'Properties of the relationship',
    type: Object,
    example: { confidence: 0.95 },
    required: false,
  })
  properties?: Record<string, unknown>;

  @ApiProperty({
    description: 'Type of the related object',
    example: 'Requirement',
    required: false,
  })
  related_object_type?: string;

  @ApiProperty({
    description: 'Key/identifier of the related object',
    example: 'req-hybrid-search',
    required: false,
  })
  related_object_key?: string;
}

/**
 * A text search result (document chunk)
 */
export class UnifiedSearchTextResultDto {
  @ApiProperty({
    description: 'Type discriminator',
    enum: [UnifiedSearchItemType.TEXT],
    example: UnifiedSearchItemType.TEXT,
  })
  type!: UnifiedSearchItemType.TEXT;

  @ApiProperty({
    description: 'Unique identifier of the chunk',
    example: 'chunk-uuid-123',
  })
  id!: string;

  @ApiProperty({
    description: 'Text snippet/preview of the result',
    example: 'Hybrid search combines lexical BM25 with vector embeddings...',
  })
  snippet!: string;

  @ApiProperty({
    description: 'Relevance score (0-1, higher is better)',
    minimum: 0,
    maximum: 1,
    example: 0.87,
  })
  score!: number;

  @ApiProperty({
    description: 'Source document or location',
    example: 'docs/architecture/search.md#L42',
    required: false,
  })
  source?: string;

  @ApiProperty({
    description: 'Search mode used (hybrid, lexical, vector)',
    example: 'hybrid',
    required: false,
  })
  mode?: string;

  @ApiProperty({
    description: 'ID of the parent document',
    example: 'doc-uuid-456',
    required: false,
  })
  document_id?: string;
}

/**
 * A graph search result (knowledge graph object)
 */
export class UnifiedSearchGraphResultDto {
  @ApiProperty({
    description: 'Type discriminator',
    enum: [UnifiedSearchItemType.GRAPH],
    example: UnifiedSearchItemType.GRAPH,
  })
  type!: UnifiedSearchItemType.GRAPH;

  @ApiProperty({
    description: 'Common ID field (same as object_id)',
    example: 'af6b1db2-e7f9-4d2f-b3f4-5d8c0c61c9cd',
  })
  id!: string;

  @ApiProperty({
    description: 'Unique identifier of the graph object',
    example: 'af6b1db2-e7f9-4d2f-b3f4-5d8c0c61c9cd',
  })
  object_id!: string;

  @ApiProperty({
    description: 'Canonical ID of the graph object',
    example: 'af6b1db2-e7f9-4d2f-b3f4-5d8c0c61c9cd',
  })
  canonical_id!: string;

  @ApiProperty({
    description: 'Relevance score (0-1, higher is better)',
    minimum: 0,
    maximum: 1,
    example: 0.92,
  })
  score!: number;

  @ApiProperty({
    description: 'Rank position in results',
    minimum: 1,
    example: 1,
  })
  rank!: number;

  @ApiProperty({
    description: 'Object type',
    example: 'Decision',
  })
  object_type!: string;

  @ApiProperty({
    description: 'Object key/identifier',
    example: 'dec-search-architecture',
  })
  key!: string;

  @ApiProperty({
    description: 'Object fields/properties',
    type: Object,
    example: {
      title: 'Adopt Hybrid Search Architecture',
      status: 'approved',
    },
  })
  fields!: Record<string, unknown>;

  @ApiProperty({
    description: 'Relationships to other objects (if expansion enabled)',
    type: [UnifiedSearchRelationshipDto],
    required: false,
  })
  relationships?: UnifiedSearchRelationshipDto[];

  @ApiProperty({
    description: 'Explanation of why this result was returned',
    example: 'High semantic match on architecture decisions',
    required: false,
  })
  explanation?: string;

  @ApiProperty({
    description: 'Fields that were truncated due to token budget',
    type: [String],
    example: ['description'],
    required: false,
  })
  truncated_fields?: string[];
}

/**
 * Union type for all unified search result types
 */
export type UnifiedSearchResultItem =
  | UnifiedSearchTextResultDto
  | UnifiedSearchGraphResultDto;

/**
 * Response metadata with camelCase field names (JavaScript/TypeScript convention)
 */
export class UnifiedSearchMetadataDto {
  @ApiProperty({
    description: 'Total number of results across both types',
    example: 27,
  })
  totalResults!: number;

  @ApiProperty({
    description: 'Number of graph results',
    example: 12,
  })
  graphResultCount!: number;

  @ApiProperty({
    description: 'Number of text results',
    example: 15,
  })
  textResultCount!: number;

  @ApiProperty({
    description: 'Fusion strategy used',
    example: 'weighted',
  })
  fusionStrategy!: string;

  @ApiProperty({
    description: 'Query execution time breakdown (ms)',
    type: Object,
    example: {
      graphSearchMs: 45.2,
      textSearchMs: 67.3,
      relationshipExpansionMs: 12.1,
      fusionMs: 5.7,
      totalMs: 130.3,
    },
  })
  executionTime!: {
    graphSearchMs?: number;
    textSearchMs?: number;
    relationshipExpansionMs?: number;
    fusionMs: number;
    totalMs: number;
  };
}

/**
 * Debug information (optional)
 */
export class UnifiedSearchDebugDto {
  @ApiProperty({
    description: 'Raw graph search response',
    type: Object,
    required: false,
  })
  graphSearch?: GraphSearchItemDto[];

  @ApiProperty({
    description: 'Raw text search results',
    type: Object,
    required: false,
  })
  textSearch?: any[];
}

/**
 * Unified search response
 */
export class UnifiedSearchResponseDto {
  @ApiProperty({
    description: 'Fused and ranked search results',
    type: [Object], // Union types not fully supported in Swagger, using Object
    example: [
      {
        type: 'graph',
        object_id: 'af6b1db2-e7f9-4d2f-b3f4-5d8c0c61c9cd',
        canonical_id: 'af6b1db2-e7f9-4d2f-b3f4-5d8c0c61c9cd',
        score: 0.92,
        rank: 1,
        object_type: 'Decision',
        key: 'dec-search-architecture',
        fields: { title: 'Adopt Hybrid Search' },
      },
      {
        type: 'text',
        id: 'chunk-123',
        snippet: 'Hybrid search combines...',
        score: 0.87,
      },
    ],
  })
  results!: UnifiedSearchResultItem[];

  @ApiProperty({
    description: 'Query metadata and performance metrics',
    type: UnifiedSearchMetadataDto,
  })
  metadata!: UnifiedSearchMetadataDto;

  @ApiProperty({
    description: 'Debug information (only included with search:debug scope)',
    type: UnifiedSearchDebugDto,
    required: false,
  })
  debug?: UnifiedSearchDebugDto;
}
