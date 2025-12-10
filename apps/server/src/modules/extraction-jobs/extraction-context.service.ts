/**
 * Extraction Context Service
 *
 * Provides context-aware entity loading for smart extraction.
 * Uses vector similarity search to find existing entities that are
 * likely to be mentioned in the document being extracted.
 *
 * This enables the LLM to:
 * 1. Recognize entities that already exist in the knowledge graph
 * 2. Reference them by canonical_id instead of creating duplicates
 * 3. Enrich existing entities with new fields from the document
 *
 * See: docs/spec/search-based-context-injection.md
 * See: docs/spec/context-aware-extraction-design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import {
  GraphVectorSearchService,
  VectorSearchResultRow,
} from '../graph/graph-vector-search.service';
import { ExistingEntityContext } from './llm/llm-provider.interface';

/**
 * Options for loading existing entity context
 */
export interface ContextLoadingOptions {
  /** Project ID to scope entity search */
  projectId: string;

  /** Entity types to include (defaults to all types if not specified) */
  entityTypes?: string[];

  /** Maximum entities to return per type (default: 30) */
  limitPerType?: number;

  /** Minimum similarity score 0-1 (default: 0.5 = 50% similar) */
  similarityThreshold?: number;

  /** Include all entities if count is below this threshold (default: 50) */
  includeAllIfBelowCount?: number;

  /** Use hybrid search (vector + keyword) for better precision */
  useHybridSearch?: boolean;
}

/**
 * Result of context loading operation
 */
export interface ContextLoadingResult {
  /** Entities grouped by type */
  entitiesByType: Record<string, ExistingEntityContext[]>;

  /** Flattened list of all entities */
  allEntities: ExistingEntityContext[];

  /** Search method used */
  searchMethod: 'vector' | 'hybrid' | 'recent_fallback' | 'all_entities';

  /** Statistics about the search */
  stats: {
    totalEntitiesFound: number;
    typeBreakdown: Record<string, number>;
    averageSimilarity?: number;
    searchDurationMs: number;
  };
}

@Injectable()
export class ExtractionContextService {
  private readonly logger = new Logger(ExtractionContextService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly vectorSearchService: GraphVectorSearchService
  ) {}

  /**
   * Load relevant existing entities as context for extraction.
   *
   * Strategy:
   * 1. Generate embedding for document preview (first ~2000 chars)
   * 2. Vector search for similar entities in the knowledge graph
   * 3. Return top N most relevant entities per type
   *
   * @param documentContent - Document text to extract from
   * @param options - Search options
   * @returns Context with relevant existing entities
   */
  async loadRelevantEntities(
    documentContent: string,
    options: ContextLoadingOptions
  ): Promise<ContextLoadingResult> {
    const startTime = Date.now();
    const {
      projectId,
      entityTypes,
      limitPerType = 30,
      similarityThreshold = 0.5,
      includeAllIfBelowCount = 50,
      useHybridSearch = false,
    } = options;

    this.logger.debug(
      `Loading context for extraction: projectId=${projectId}, types=${
        entityTypes?.join(',') || 'all'
      }`
    );

    // Check if embeddings service is enabled
    if (!this.embeddingsService.isEnabled()) {
      this.logger.warn(
        'Embeddings service not enabled, using recent entities fallback'
      );
      return this.loadRecentEntitiesFallback(
        projectId,
        entityTypes,
        limitPerType,
        startTime
      );
    }

    try {
      // Step 1: Generate embedding for document preview
      const documentPreview = documentContent.substring(0, 2000);
      const documentEmbedding = await this.embeddingsService.embedQuery(
        documentPreview
      );

      this.logger.debug(
        `Generated document embedding (${documentEmbedding.length} dims)`
      );

      // Step 2: Get entity types to search
      const typesToSearch =
        entityTypes || (await this.getEntityTypesInProject(projectId));

      if (typesToSearch.length === 0) {
        this.logger.debug('No entity types found in project');
        return this.emptyResult(startTime);
      }

      // Step 3: Search for relevant entities per type
      const entitiesByType: Record<string, ExistingEntityContext[]> = {};
      const allEntities: ExistingEntityContext[] = [];
      let totalSimilarity = 0;
      let similarityCount = 0;

      for (const typeName of typesToSearch) {
        // Check total count for this type
        const typeCount = await this.getEntityCountByType(projectId, typeName);

        let typeEntities: ExistingEntityContext[];

        if (typeCount === 0) {
          typeEntities = [];
        } else if (typeCount <= includeAllIfBelowCount) {
          // Small number - just load all
          this.logger.debug(
            `Type ${typeName}: Only ${typeCount} entities, loading all`
          );
          typeEntities = await this.loadAllEntitiesOfType(projectId, typeName);
        } else {
          // Use vector similarity search
          typeEntities = await this.searchSimilarEntities(
            documentEmbedding,
            projectId,
            typeName,
            limitPerType,
            similarityThreshold
          );

          // Optionally add keyword matches for hybrid search
          if (useHybridSearch) {
            const keywordMatches = await this.searchByKeywords(
              documentContent,
              projectId,
              typeName,
              Math.floor(limitPerType / 2)
            );

            // Merge and deduplicate
            typeEntities = this.mergeAndDeduplicate(
              typeEntities,
              keywordMatches,
              limitPerType
            );
          }
        }

        if (typeEntities.length > 0) {
          entitiesByType[typeName] = typeEntities;
          allEntities.push(...typeEntities);

          // Track similarity for stats
          for (const entity of typeEntities) {
            if (entity.similarity !== undefined) {
              totalSimilarity += entity.similarity;
              similarityCount++;
            }
          }

          this.logger.debug(
            `Type ${typeName}: Found ${typeEntities.length} relevant entities`
          );
        }
      }

      const searchDurationMs = Date.now() - startTime;
      const averageSimilarity =
        similarityCount > 0 ? totalSimilarity / similarityCount : undefined;

      this.logger.log(
        `Loaded ${allEntities.length} relevant entities across ${
          Object.keys(entitiesByType).length
        } types in ${searchDurationMs}ms` +
          (averageSimilarity !== undefined
            ? ` (avg similarity: ${averageSimilarity.toFixed(2)})`
            : '')
      );

      return {
        entitiesByType,
        allEntities,
        searchMethod: useHybridSearch ? 'hybrid' : 'vector',
        stats: {
          totalEntitiesFound: allEntities.length,
          typeBreakdown: Object.fromEntries(
            Object.entries(entitiesByType).map(([type, entities]) => [
              type,
              entities.length,
            ])
          ),
          averageSimilarity,
          searchDurationMs,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Context loading failed: ${errorMessage}`);

      // Fall back to recent entities
      return this.loadRecentEntitiesFallback(
        projectId,
        entityTypes,
        limitPerType,
        startTime
      );
    }
  }

  /**
   * Search for entities similar to the document using vector similarity
   */
  private async searchSimilarEntities(
    documentEmbedding: number[],
    projectId: string,
    typeName: string,
    limit: number,
    similarityThreshold: number
  ): Promise<ExistingEntityContext[]> {
    // Convert similarity threshold to distance (cosine distance = 1 - similarity)
    const maxDistance = 1 - similarityThreshold;

    const results = await this.vectorSearchService.searchByVector(
      documentEmbedding,
      {
        projectId,
        type: typeName,
        limit,
        maxDistance,
      }
    );

    if (results.length === 0) {
      return [];
    }

    // Fetch full entity details for the matched IDs
    return this.fetchEntityDetails(
      results.map((r) => r.id),
      results
    );
  }

  /**
   * Search for entities by keyword matching in the document
   */
  private async searchByKeywords(
    documentContent: string,
    projectId: string,
    typeName: string,
    limit: number
  ): Promise<ExistingEntityContext[]> {
    // Extract potential entity names (capitalized words, proper nouns)
    const potentialNames = this.extractPotentialEntityNames(documentContent);

    if (potentialNames.length === 0) {
      return [];
    }

    try {
      const result = await this.db.query<{
        id: string;
        canonical_id: string;
        key: string;
        properties: Record<string, any>;
        type: string;
      }>(
        `SELECT id, canonical_id, key, properties, type
         FROM kb.graph_objects
         WHERE project_id = $1
           AND type = $2
           AND deleted_at IS NULL
           AND supersedes_id IS NULL
           AND (
             key = ANY($3) OR
             properties->>'name' = ANY($3) OR
             properties->'aliases' ?| $3
           )
         LIMIT $4`,
        [projectId, typeName, potentialNames, limit]
      );

      return result.rows.map((row) => ({
        id: row.canonical_id || row.id,
        name: row.properties?.name || row.key,
        type_name: row.type,
        description: row.properties?.description,
        properties: this.filterInternalProperties(row.properties),
      }));
    } catch (error) {
      this.logger.warn(
        `Keyword search failed for ${typeName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Extract potential entity names from document text
   */
  private extractPotentialEntityNames(text: string): string[] {
    // Match capitalized words and multi-word proper nouns
    const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

    // Filter common words and deduplicate
    const commonWords = new Set([
      'The',
      'And',
      'But',
      'For',
      'With',
      'From',
      'This',
      'That',
      'When',
      'Where',
      'What',
      'How',
      'Why',
      'Chapter',
      'Verse',
      'Section',
    ]);

    const uniqueNames = [...new Set(matches)]
      .filter((name) => !commonWords.has(name))
      .slice(0, 50); // Limit to prevent query explosion

    return uniqueNames;
  }

  /**
   * Merge vector and keyword results, deduplicating by ID
   */
  private mergeAndDeduplicate(
    vectorResults: ExistingEntityContext[],
    keywordResults: ExistingEntityContext[],
    limit: number
  ): ExistingEntityContext[] {
    const seen = new Set<string>();
    const merged: ExistingEntityContext[] = [];

    // Add vector results first (higher priority due to semantic match)
    for (const entity of vectorResults) {
      if (!seen.has(entity.id)) {
        seen.add(entity.id);
        merged.push(entity);
      }
    }

    // Add keyword matches that weren't in vector results
    for (const entity of keywordResults) {
      if (!seen.has(entity.id) && merged.length < limit) {
        seen.add(entity.id);
        // Boost keyword matches since they're exact name matches
        merged.push({ ...entity, similarity: 0.95 });
      }
    }

    return merged.slice(0, limit);
  }

  /**
   * Load all entities of a type (used when count is small)
   */
  private async loadAllEntitiesOfType(
    projectId: string,
    typeName: string
  ): Promise<ExistingEntityContext[]> {
    const result = await this.db.query<{
      id: string;
      canonical_id: string;
      key: string;
      properties: Record<string, any>;
      type: string;
    }>(
      `SELECT id, canonical_id, key, properties, type
       FROM kb.graph_objects
       WHERE project_id = $1
         AND type = $2
         AND deleted_at IS NULL
         AND supersedes_id IS NULL
       ORDER BY created_at DESC`,
      [projectId, typeName]
    );

    return result.rows.map((row) => ({
      id: row.canonical_id || row.id,
      name: row.properties?.name || row.key,
      type_name: row.type,
      description: row.properties?.description,
      properties: this.filterInternalProperties(row.properties),
    }));
  }

  /**
   * Fetch full entity details for a list of IDs
   */
  private async fetchEntityDetails(
    ids: string[],
    searchResults: VectorSearchResultRow[]
  ): Promise<ExistingEntityContext[]> {
    if (ids.length === 0) return [];

    // Create a map of id -> distance for similarity scoring
    const distanceMap = new Map(searchResults.map((r) => [r.id, r.distance]));

    const result = await this.db.query<{
      id: string;
      canonical_id: string;
      key: string;
      properties: Record<string, any>;
      type: string;
    }>(
      `SELECT id, canonical_id, key, properties, type
       FROM kb.graph_objects
       WHERE id = ANY($1)`,
      [ids]
    );

    return result.rows.map((row) => {
      const distance = distanceMap.get(row.id) ?? 0;
      const similarity = 1 - distance; // Convert distance to similarity

      return {
        id: row.canonical_id || row.id,
        name: row.properties?.name || row.key,
        type_name: row.type,
        description: row.properties?.description,
        properties: this.filterInternalProperties(row.properties),
        similarity,
      };
    });
  }

  /**
   * Get count of entities of a specific type in project
   */
  private async getEntityCountByType(
    projectId: string,
    typeName: string
  ): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM kb.graph_objects
       WHERE project_id = $1
         AND type = $2
         AND deleted_at IS NULL
         AND supersedes_id IS NULL`,
      [projectId, typeName]
    );

    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Get all entity types in a project
   */
  private async getEntityTypesInProject(projectId: string): Promise<string[]> {
    const result = await this.db.query<{ type: string }>(
      `SELECT DISTINCT type
       FROM kb.graph_objects
       WHERE project_id = $1
         AND deleted_at IS NULL
         AND supersedes_id IS NULL
       ORDER BY type`,
      [projectId]
    );

    return result.rows.map((r) => r.type);
  }

  /**
   * Fallback: Load recent entities when vector search is unavailable
   */
  private async loadRecentEntitiesFallback(
    projectId: string,
    entityTypes: string[] | undefined,
    limitPerType: number,
    startTime: number
  ): Promise<ContextLoadingResult> {
    const typesToSearch =
      entityTypes || (await this.getEntityTypesInProject(projectId));

    const entitiesByType: Record<string, ExistingEntityContext[]> = {};
    const allEntities: ExistingEntityContext[] = [];

    for (const typeName of typesToSearch) {
      const result = await this.db.query<{
        id: string;
        canonical_id: string;
        key: string;
        properties: Record<string, any>;
        type: string;
      }>(
        `SELECT id, canonical_id, key, properties, type
         FROM kb.graph_objects
         WHERE project_id = $1
           AND type = $2
           AND deleted_at IS NULL
           AND supersedes_id IS NULL
         ORDER BY created_at DESC
         LIMIT $3`,
        [projectId, typeName, limitPerType]
      );

      const typeEntities = result.rows.map((row) => ({
        id: row.canonical_id || row.id,
        name: row.properties?.name || row.key,
        type_name: row.type,
        description: row.properties?.description,
        properties: this.filterInternalProperties(row.properties),
      }));

      if (typeEntities.length > 0) {
        entitiesByType[typeName] = typeEntities;
        allEntities.push(...typeEntities);
      }
    }

    return {
      entitiesByType,
      allEntities,
      searchMethod: 'recent_fallback',
      stats: {
        totalEntitiesFound: allEntities.length,
        typeBreakdown: Object.fromEntries(
          Object.entries(entitiesByType).map(([type, entities]) => [
            type,
            entities.length,
          ])
        ),
        searchDurationMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Filter out internal properties (starting with _)
   */
  private filterInternalProperties(
    properties: Record<string, any> | null
  ): Record<string, any> {
    if (!properties) return {};

    return Object.fromEntries(
      Object.entries(properties).filter(([key]) => !key.startsWith('_'))
    );
  }

  /**
   * Return empty result
   */
  private emptyResult(startTime: number): ContextLoadingResult {
    return {
      entitiesByType: {},
      allEntities: [],
      searchMethod: 'vector',
      stats: {
        totalEntitiesFound: 0,
        typeBreakdown: {},
        searchDurationMs: Date.now() - startTime,
      },
    };
  }
}
