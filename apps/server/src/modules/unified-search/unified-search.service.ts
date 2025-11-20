import { Injectable, Logger } from '@nestjs/common';
import {
  UnifiedSearchRequestDto,
  UnifiedSearchResponseDto,
  UnifiedSearchResultItem,
  UnifiedSearchItemType,
  UnifiedSearchFusionStrategy,
  UnifiedSearchGraphResultDto,
  UnifiedSearchTextResultDto,
  UnifiedSearchMetadataDto,
  UnifiedSearchRelationshipDto,
  UnifiedSearchResultType,
} from './dto';
import { GraphSearchService } from '../graph-search/graph-search.service';
import { SearchService } from '../search/search.service';
import { GraphService } from '../graph/graph.service';
import { GraphSearchRequestDto } from '../graph-search/dto/graph-search-request.dto';
import { SearchMode } from '../search/dto/search-query.dto';

/**
 * Service for unified search combining graph objects and document chunks
 */
@Injectable()
export class UnifiedSearchService {
  private readonly logger = new Logger(UnifiedSearchService.name);

  constructor(
    private readonly graphSearchService: GraphSearchService,
    private readonly searchService: SearchService,
    private readonly graphService: GraphService
  ) {}

  /**
   * Execute unified search combining graph and text results
   */
  async search(
    request: UnifiedSearchRequestDto,
    context: {
      orgId: string;
      projectId: string;
      scopes: string[];
    }
  ): Promise<UnifiedSearchResponseDto> {
    const startTime = performance.now();

    // Execute graph and text searches in parallel
    const [graphSearchResult, textSearchResult] = await Promise.all([
      this.executeGraphSearch(request, context),
      this.executeTextSearch(request),
    ]);

    // Expand relationships for graph results if enabled
    let graphResultsWithRelationships = graphSearchResult.results;
    let relationshipsExpanded = 0;
    let relationshipElapsed = 0;

    if (
      request.relationshipOptions?.enabled &&
      graphSearchResult.results.length > 0
    ) {
      const relationshipStart = performance.now();
      graphResultsWithRelationships = await this.expandRelationships(
        graphSearchResult.results,
        request.relationshipOptions,
        context
      );
      relationshipsExpanded = graphResultsWithRelationships.reduce(
        (sum, r) => sum + (r.relationships?.length || 0),
        0
      );
      relationshipElapsed = performance.now() - relationshipStart;
      this.logger.debug(
        `Expanded ${relationshipsExpanded} relationships in ${relationshipElapsed.toFixed(
          1
        )}ms`
      );
    }

    // Fuse and rank combined results
    const fusionStart = performance.now();
    const fusedResults = this.fuseResults(
      graphResultsWithRelationships,
      textSearchResult.results,
      request
    );
    const fusionElapsed = performance.now() - fusionStart;

    // Build metadata with camelCase field names
    const graphCount = fusedResults.filter(
      (r) => r.type === UnifiedSearchItemType.GRAPH
    ).length;
    const textCount = fusedResults.filter(
      (r) => r.type === UnifiedSearchItemType.TEXT
    ).length;

    const metadata: UnifiedSearchMetadataDto = {
      totalResults: fusedResults.length,
      graphResultCount: graphCount,
      textResultCount: textCount,
      fusionStrategy:
        request.fusionStrategy || UnifiedSearchFusionStrategy.WEIGHTED,
      executionTime: {
        graphSearchMs:
          request.resultTypes !== UnifiedSearchResultType.TEXT
            ? Math.round(graphSearchResult.elapsed_ms)
            : undefined,
        textSearchMs:
          request.resultTypes !== UnifiedSearchResultType.GRAPH
            ? Math.round(textSearchResult.elapsed_ms)
            : undefined,
        relationshipExpansionMs:
          relationshipsExpanded > 0
            ? Math.round(relationshipElapsed)
            : undefined,
        fusionMs: Math.round(fusionElapsed),
        totalMs: Math.round(performance.now() - startTime),
      },
    };

    // Build debug info if requested
    const debug = request.includeDebug
      ? {
          graphSearch: graphSearchResult.rawItems,
          textSearch: textSearchResult.rawResults,
          score_distribution: this.calculateScoreDistribution(
            graphSearchResult.results,
            textSearchResult.results
          ),
          fusion_details: {
            strategy: request.fusionStrategy,
            weights: request.weights,
            pre_fusion_counts: {
              graph: graphSearchResult.results.length,
              text: textSearchResult.results.length,
            },
            post_fusion_count: fusedResults.length,
          },
        }
      : undefined;

    return {
      results: fusedResults,
      metadata,
      debug,
    };
  }

  /**
   * Execute graph search
   */
  private async executeGraphSearch(
    request: UnifiedSearchRequestDto,
    context: { scopes: string[] }
  ): Promise<{
    results: UnifiedSearchGraphResultDto[];
    rawItems?: any[];
    elapsed_ms: number;
    channels: string[];
  }> {
    if (request.resultTypes === UnifiedSearchResultType.TEXT) {
      return { results: [], elapsed_ms: 0, channels: [] };
    }

    const startTime = performance.now();

    const graphRequest: GraphSearchRequestDto = {
      query: request.query,
      limit: request.limit,
      maxTokenBudget: request.maxTokenBudget,
      includeDebug: request.includeDebug,
    };

    const graphResponse = await this.graphSearchService.search(graphRequest, {
      debug: request.includeDebug || false,
      scopes: context.scopes,
    });

    const results: UnifiedSearchGraphResultDto[] = graphResponse.items.map(
      (item) => {
        const result: UnifiedSearchGraphResultDto = {
          type: UnifiedSearchItemType.GRAPH,
          id: item.object_id, // Common id field for all result types
          object_id: item.object_id,
          canonical_id: item.canonical_id,
          score: item.score,
          rank: item.rank,
          object_type: (item.fields.type as string) || 'Unknown',
          key: (item.fields.key as string) || item.object_id,
          fields: item.fields,
          explanation: item.explanation,
          truncated_fields: item.truncated_fields,
        };

        // Always initialize relationships field as empty array
        // It will be populated later if relationship expansion is enabled
        result.relationships = [];

        return result;
      }
    );

    return {
      results,
      rawItems: request.includeDebug ? graphResponse.items : undefined,
      elapsed_ms: performance.now() - startTime,
      channels: graphResponse.meta.channels,
    };
  }

  /**
   * Execute text search
   */
  private async executeTextSearch(request: UnifiedSearchRequestDto): Promise<{
    results: UnifiedSearchTextResultDto[];
    rawResults?: any[];
    elapsed_ms: number;
    mode: string;
  }> {
    if (request.resultTypes === UnifiedSearchResultType.GRAPH) {
      return { results: [], elapsed_ms: 0, mode: 'none' };
    }

    const startTime = performance.now();

    const searchResponse = await this.searchService.search(
      request.query,
      request.limit || 20,
      SearchMode.HYBRID,
      0.5,
      0.5,
      false
    );

    const results: UnifiedSearchTextResultDto[] = searchResponse.results.map(
      (item: any) => ({
        type: UnifiedSearchItemType.TEXT,
        id: item.id,
        snippet: item.text || item.snippet || '',
        score: item.score || 0,
        source: item.source,
        mode: searchResponse.mode,
        document_id: item.document_id,
      })
    );

    return {
      results,
      rawResults: request.includeDebug ? searchResponse.results : undefined,
      elapsed_ms: performance.now() - startTime,
      mode: searchResponse.mode,
    };
  }

  /**
   * Expand relationships for graph results
   */
  private async expandRelationships(
    graphResults: UnifiedSearchGraphResultDto[],
    options: NonNullable<UnifiedSearchRequestDto['relationshipOptions']>,
    context: { orgId: string; projectId: string }
  ): Promise<UnifiedSearchGraphResultDto[]> {
    if (!options.enabled || options.maxDepth === 0) {
      this.logger.debug('Relationship expansion disabled or maxDepth=0');
      return graphResults;
    }

    const objectIds = graphResults.map((r) => r.object_id);
    this.logger.debug(
      `Expanding relationships for ${objectIds.length} objects with maxDepth=${options.maxDepth}, direction=${options.direction}`
    );

    try {
      // Use graph service to expand relationships
      const expandResponse = await this.graphService.expand(
        {
          object_ids: objectIds,
          direction: options.direction || 'both',
          max_depth: options.maxDepth || 1,
        },
        {
          orgId: context.orgId,
          projectId: context.projectId,
        }
      );

      this.logger.debug(
        `Expand response: ${expandResponse?.nodes?.length || 0} nodes, ${
          expandResponse?.edges?.length || 0
        } edges`
      );

      // Check if expand returned valid data
      if (!expandResponse || !expandResponse.edges || !expandResponse.nodes) {
        this.logger.warn(
          'Graph expand returned no relationships or invalid structure'
        );
        return graphResults; // Return without relationships
      }

      // Build relationship map: object_id -> relationships[]
      const relationshipMap = new Map<string, UnifiedSearchRelationshipDto[]>();

      for (const edge of expandResponse.edges) {
        const sourceId = edge.src_id;
        const targetId = edge.dst_id;

        // Add outgoing relationship from source
        if (!relationshipMap.has(sourceId)) {
          relationshipMap.set(sourceId, []);
        }

        // Find related object info
        const relatedObject = expandResponse.nodes.find(
          (n: any) => n.id === targetId
        );

        relationshipMap.get(sourceId)!.push({
          object_id: targetId,
          type: edge.type,
          direction: 'out',
          properties: edge.properties,
          related_object_type: relatedObject?.type,
          related_object_key: relatedObject?.key,
        });

        // Add incoming relationship to target
        if (!relationshipMap.has(targetId)) {
          relationshipMap.set(targetId, []);
        }

        const sourceObject = expandResponse.nodes.find(
          (n: any) => n.id === sourceId
        );

        relationshipMap.get(targetId)!.push({
          object_id: sourceId,
          type: edge.type,
          direction: 'in',
          properties: edge.properties,
          related_object_type: sourceObject?.type,
          related_object_key: sourceObject?.key,
        });
      }

      // Attach relationships to results
      return graphResults.map((result) => {
        const relationships = relationshipMap.get(result.object_id) || [];

        // Apply maxNeighbors limit
        const limitedRelationships =
          options.maxNeighbors && relationships.length > options.maxNeighbors
            ? relationships.slice(0, options.maxNeighbors)
            : relationships;

        return {
          ...result,
          relationships: limitedRelationships,
        };
      });
    } catch (error) {
      this.logger.error(
        `Failed to expand relationships for ${objectIds.length} objects`,
        error instanceof Error ? error.stack : error
      );
      // Return results without relationships on error
      return graphResults;
    }
  }

  /**
   * Fuse graph and text results into a single ranked list
   */
  private fuseResults(
    graphResults: UnifiedSearchGraphResultDto[],
    textResults: UnifiedSearchTextResultDto[],
    request: UnifiedSearchRequestDto
  ): UnifiedSearchResultItem[] {
    const strategy =
      request.fusionStrategy || UnifiedSearchFusionStrategy.WEIGHTED;

    switch (strategy) {
      case UnifiedSearchFusionStrategy.WEIGHTED:
        return this.fuseWeighted(graphResults, textResults, request);

      case UnifiedSearchFusionStrategy.RRF:
        return this.fuseRRF(graphResults, textResults, request);

      case UnifiedSearchFusionStrategy.INTERLEAVE:
        return this.fuseInterleave(graphResults, textResults, request);

      case UnifiedSearchFusionStrategy.GRAPH_FIRST:
        return this.fuseGraphFirst(graphResults, textResults, request);

      case UnifiedSearchFusionStrategy.TEXT_FIRST:
        return this.fuseTextFirst(graphResults, textResults, request);

      default:
        return this.fuseWeighted(graphResults, textResults, request);
    }
  }

  /**
   * Weighted fusion: combine scores using weights
   *
   * Strategy:
   * 1. Normalize weights to sum to 1.0 (ensures consistent scaling)
   * 2. Multiply each result's score by its normalized weight
   * 3. Sort all results by weighted score descending
   * 4. Return top N results up to limit
   *
   * Example: graphWeight=0.7, textWeight=0.3
   * - Graph result with score 0.8 → fused = 0.8 * 0.7 = 0.56
   * - Text result with score 0.6 → fused = 0.6 * 0.3 = 0.18
   * - Graph result ranks higher
   */
  private fuseWeighted(
    graphResults: UnifiedSearchGraphResultDto[],
    textResults: UnifiedSearchTextResultDto[],
    request: UnifiedSearchRequestDto
  ): UnifiedSearchResultItem[] {
    const graphWeight = request.weights?.graphWeight || 0.5;
    const textWeight = request.weights?.textWeight || 0.5;

    // Normalize weights to sum to 1
    const weightSum = graphWeight + textWeight;
    const normalizedGraphWeight = graphWeight / weightSum;
    const normalizedTextWeight = textWeight / weightSum;

    // Combine and score
    const combined: Array<UnifiedSearchResultItem & { fusedScore: number }> = [
      ...graphResults.map((r) => ({
        ...r,
        fusedScore: r.score * normalizedGraphWeight,
      })),
      ...textResults.map((r) => ({
        ...r,
        fusedScore: r.score * normalizedTextWeight,
      })),
    ];

    // Sort by fused score descending
    combined.sort((a, b) => b.fusedScore - a.fusedScore);

    // Apply limit and return without fusedScore
    return combined
      .slice(0, request.limit)
      .map(({ fusedScore, ...rest }) => rest);
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   *
   * Strategy:
   * RRF is a rank-based fusion that handles different score scales gracefully.
   * Formula: score = Σ 1/(k + rank) across all result lists
   *
   * Benefits:
   * - Score-independent: works even when graph/text scores have different ranges
   * - Proven effective in meta-search and multi-modal retrieval
   * - k=60 is standard (from research literature)
   *
   * Example:
   * - Item appears at rank 1 in graph (score = 1/61 = 0.0164)
   * - Same item at rank 3 in text (score = 1/63 = 0.0159)
   * - Combined RRF score = 0.0323
   */
  private fuseRRF(
    graphResults: UnifiedSearchGraphResultDto[],
    textResults: UnifiedSearchTextResultDto[],
    request: UnifiedSearchRequestDto
  ): UnifiedSearchResultItem[] {
    const k = 60; // RRF constant (standard value from research)

    const scoreMap = new Map<
      string,
      { item: UnifiedSearchResultItem; score: number }
    >();

    // RRF formula: score = sum(1 / (k + rank))
    graphResults.forEach((item, index) => {
      const id = item.object_id;
      const rrfScore = 1 / (k + index + 1);
      scoreMap.set(id, { item, score: rrfScore });
    });

    textResults.forEach((item, index) => {
      const id = item.id;
      const rrfScore = 1 / (k + index + 1);

      const existing = scoreMap.get(id);
      if (existing) {
        // Item appears in both lists - boost its score
        existing.score += rrfScore;
      } else {
        scoreMap.set(id, { item, score: rrfScore });
      }
    });

    // Sort by RRF score descending and update score fields
    const sorted = Array.from(scoreMap.values()).sort(
      (a, b) => b.score - a.score
    );

    return sorted.slice(0, request.limit).map((entry) => ({
      ...entry.item,
      score: entry.score, // Update with RRF score
    }));
  }

  /**
   * Interleave: alternate between graph and text results
   *
   * Strategy:
   * 1. Take one result from graph list
   * 2. Take one result from text list
   * 3. Repeat until limit is reached or both lists exhausted
   *
   * Benefits:
   * - Ensures balanced representation from both result types
   * - Good for exploratory search where user wants variety
   * - Preserves relative ranking within each result type
   *
   * Example with limit=6:
   * [G1, T1, G2, T2, G3, T3] where G=graph, T=text, number=rank
   */
  private fuseInterleave(
    graphResults: UnifiedSearchGraphResultDto[],
    textResults: UnifiedSearchTextResultDto[],
    request: UnifiedSearchRequestDto
  ): UnifiedSearchResultItem[] {
    const combined: UnifiedSearchResultItem[] = [];
    const limit = request.limit || 20;

    let graphIndex = 0;
    let textIndex = 0;

    while (combined.length < limit) {
      if (graphIndex < graphResults.length) {
        combined.push(graphResults[graphIndex++]);
      }
      if (combined.length >= limit) break;

      if (textIndex < textResults.length) {
        combined.push(textResults[textIndex++]);
      }
      if (combined.length >= limit) break;

      // Stop if both exhausted
      if (
        graphIndex >= graphResults.length &&
        textIndex >= textResults.length
      ) {
        break;
      }
    }

    return combined;
  }

  /**
   * Graph first: show graph results, then text
   *
   * Strategy: Simple concatenation - all graph results before text results
   *
   * Use case: When graph objects (decisions, requirements) should be prioritized
   * over document chunks for a particular query or user context
   */
  private fuseGraphFirst(
    graphResults: UnifiedSearchGraphResultDto[],
    textResults: UnifiedSearchTextResultDto[],
    request: UnifiedSearchRequestDto
  ): UnifiedSearchResultItem[] {
    const combined = [...graphResults, ...textResults];
    return combined.slice(0, request.limit);
  }

  /**
   * Text first: show text results, then graph
   *
   * Strategy: Simple concatenation - all text results before graph results
   *
   * Use case: When document chunks should be prioritized over graph objects,
   * e.g., for reference lookup or detailed content search
   */
  private fuseTextFirst(
    graphResults: UnifiedSearchGraphResultDto[],
    textResults: UnifiedSearchTextResultDto[],
    request: UnifiedSearchRequestDto
  ): UnifiedSearchResultItem[] {
    const combined = [...textResults, ...graphResults];
    return combined.slice(0, request.limit);
  }

  /**
   * Calculate score distribution for debug info
   */
  private calculateScoreDistribution(
    graphResults: UnifiedSearchGraphResultDto[],
    textResults: UnifiedSearchTextResultDto[]
  ): Record<string, unknown> {
    const calcStats = (scores: number[]) => {
      if (scores.length === 0) return { min: 0, max: 0, mean: 0 };
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { min, max, mean };
    };

    return {
      graph: calcStats(graphResults.map((r) => r.score)),
      text: calcStats(textResults.map((r) => r.score)),
    };
  }
}
