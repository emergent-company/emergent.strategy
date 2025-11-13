import { ApiProperty } from '@nestjs/swagger';
import { GraphChannel, GraphIntent, GraphRole } from './graph-search.enums';

export class GraphSearchReasonDto {
  @ApiProperty({ enum: GraphChannel }) channel!: GraphChannel | string; // string fallback for future channels
  @ApiProperty({ example: 0.42 }) score!: number;
}

export class GraphSearchCitationDto {
  @ApiProperty({ example: 'Decision depends on consistent flag rollout' })
  span!: string;
  @ApiProperty({ example: 'b3d52c50-5101-4c6c-8d30-4a1f0f7645cb' })
  source_object_id!: string;
  @ApiProperty({ example: 0.82 }) confidence!: number;
}

export class GraphSearchItemDto {
  @ApiProperty({ example: 'af6b1db2-e7f9-4d2f-b3f4-5d8c0c61c9cd' })
  object_id!: string;
  @ApiProperty({ example: 'af6b1db2-e7f9-4d2f-b3f4-5d8c0c61c9cd' })
  canonical_id!: string;
  @ApiProperty({ example: 0.87123 }) score!: number;
  @ApiProperty({ example: 1 }) rank!: number;
  @ApiProperty({ enum: GraphRole }) role!: GraphRole;
  @ApiProperty({
    type: Object,
    example: {
      title: 'Adopt Feature Flagging',
      type: 'Decision',
      status: 'active',
    },
  })
  fields!: Record<string, unknown>;
  @ApiProperty({ required: false, type: [String], example: ['description'] })
  truncated_fields?: string[];
  @ApiProperty({ type: GraphSearchReasonDto, isArray: true })
  reasons!: GraphSearchReasonDto[];
  @ApiProperty({ required: false, type: GraphSearchCitationDto, isArray: true })
  citations?: GraphSearchCitationDto[];
  @ApiProperty({ required: false, example: 'High lexical match on ...' })
  explanation?: string;
  @ApiProperty({
    required: false,
    example: 'eyJzY29yZSI6MC44NzEyMywiaWQiOiJkb2MtMSJ9',
  })
  cursor?: string; // opaque cursor for this item (points AFTER item when used as page cursor)
}

export class GraphSearchPathSummaryDto {
  @ApiProperty({ example: 'e7b7ff6e-ef5f-4b55-9580-5d3b45d0a123' })
  path_id!: string;
  @ApiProperty({ example: 'Meeting X decided Decision Y' }) summary!: string;
  @ApiProperty({ type: GraphSearchReasonDto, isArray: true })
  reasons!: GraphSearchReasonDto[];
}

export class GraphSearchRerankMetaDto {
  @ApiProperty({ example: true }) applied!: boolean;
  @ApiProperty({ required: false, example: 'mini-cross-encoder-v1' })
  model?: string;
  @ApiProperty({ required: false, example: 42 }) latency_ms?: number;
  @ApiProperty({ required: false, example: 60 }) pool?: number;
  @ApiProperty({ required: false, example: false }) timeout?: boolean;
}

export class GraphSearchExpansionMetaDto {
  @ApiProperty({ example: 42 }) neighbors!: number;
  @ApiProperty({ example: true }) hub_sampled!: boolean;
  @ApiProperty({ required: false, example: 1342 }) hub_degree?: number;
}

export class GraphSearchEmbeddingModelMetaDto {
  @ApiProperty({ example: 'text-embedding-3-large' }) model!: string;
  @ApiProperty({ example: 2 }) version!: number;
  @ApiProperty({ example: 91.4 }) coverage_pct!: number;
}

export class GraphSearchRequestMetaDto {
  @ApiProperty({
    example: 40,
    description: 'Effective page size after server cap',
  })
  limit!: number;
  @ApiProperty({
    example: 100,
    description: 'Original client requested limit before clamping',
    required: false,
  })
  requested_limit?: number;
  @ApiProperty({
    type: [String],
    required: false,
    example: ['lexical', 'vector'],
  })
  channels?: string[];
  @ApiProperty({ required: false, example: false }) rerank?: boolean | null;
  @ApiProperty({
    required: false,
    example: 'forward',
    enum: ['forward', 'backward'],
    description: 'Pagination direction used for this page.',
  })
  direction?: 'forward' | 'backward';
}

export class GraphSearchMetaDto {
  @ApiProperty({ type: [String], example: ['lexical', 'vector'] })
  channels!: string[];
  @ApiProperty({ example: 'weighted_sum:v2' }) fusion!: string;
  @ApiProperty({ example: 'zscore_v1' }) normalization_version!: string;
  @ApiProperty({ example: 100 }) lexical_considered!: number;
  @ApiProperty({ example: 100 }) vector_considered!: number;
  @ApiProperty({ example: 12 }) skipped_unembedded!: number;
  @ApiProperty({ example: 47 }) neighbor_expanded!: number;
  @ApiProperty({ example: 1450 }) token_estimate!: number;
  @ApiProperty({ example: 3500 }) token_budget!: number;
  @ApiProperty({ example: false }) truncation_notice!: boolean;
  @ApiProperty({
    required: false,
    type: [String],
    example: ['embedding_version_backlog'],
  })
  warnings?: string[];
  @ApiProperty({ type: GraphSearchEmbeddingModelMetaDto })
  embedding_model!: GraphSearchEmbeddingModelMetaDto;
  @ApiProperty({ type: GraphSearchRerankMetaDto })
  rerank!: GraphSearchRerankMetaDto;
  @ApiProperty({ type: GraphSearchExpansionMetaDto })
  expansion!: GraphSearchExpansionMetaDto;
  @ApiProperty({ type: () => GraphSearchRequestMetaDto })
  request!: GraphSearchRequestMetaDto;
  @ApiProperty({ example: 92 }) elapsed_ms!: number;
  @ApiProperty({
    example: 8,
    description:
      'Total size of fused candidate pool prior to pagination (may be less than lexical_considered+vector_considered due to overlaps).',
  })
  total_estimate!: number;
  @ApiProperty({ required: false, example: null }) nextCursor?: string | null;
  @ApiProperty({ required: false, example: null }) prevCursor?: string | null;
  @ApiProperty({ example: true }) hasNext!: boolean;
  @ApiProperty({ example: false }) hasPrev!: boolean;
  @ApiProperty({
    required: false,
    example: 41,
    description:
      'Approximate 1-based index of first item in this page relative to fused pool snapshot. 0 if page empty.',
  })
  approx_position_start?: number;
  @ApiProperty({
    required: false,
    example: 80,
    description:
      'Approximate 1-based index of last item in this page relative to fused pool snapshot. 0 if page empty.',
  })
  approx_position_end?: number;
}

export class GraphSearchDebugDto {
  @ApiProperty({
    type: Object,
    example: { lexical: { mean: 0.42, std: 0.11 } },
  })
  normalization!: Record<string, unknown>;
  @ApiProperty({ example: 5 }) gain_rejections!: number;
  @ApiProperty({ example: 0.02 }) marginal_gain_min!: number;
  @ApiProperty({
    type: [Object],
    example: [
      { relation: 'decides', edge_score: 0.63, depth: 1, hub_damping: 0.43 },
    ],
  })
  edge_samples!: Record<string, unknown>[];
  @ApiProperty({
    type: Object,
    example: { paths: true, rerank: true, citations: false },
  })
  feature_flags!: Record<string, boolean>;
}

export class GraphSearchResponseDto {
  @ApiProperty({ example: 'original query text' }) query!: string;
  @ApiProperty({ enum: GraphIntent, required: false })
  intent?: GraphIntent | null;
  @ApiProperty({ type: GraphSearchItemDto, isArray: true })
  items!: GraphSearchItemDto[];
  @ApiProperty({
    type: GraphSearchPathSummaryDto,
    isArray: true,
    required: false,
  })
  path_summaries?: GraphSearchPathSummaryDto[];
  @ApiProperty({ type: GraphSearchMetaDto }) meta!: GraphSearchMetaDto;
  @ApiProperty({ type: GraphSearchDebugDto, required: false })
  debug?: GraphSearchDebugDto;
}
