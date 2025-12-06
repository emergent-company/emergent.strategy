import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GraphService } from '../graph/graph.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { ExtractedEntity } from './llm/llm-provider.interface';
import { GraphObject } from '../../entities/graph-object.entity';

/**
 * Entity Linking Service
 *
 * Implements intelligent entity linking strategies to avoid duplicates and
 * merge information with existing graph objects.
 *
 * Strategies:
 * - Key Match: Find exact or normalized key matches
 * - Vector Similarity: Find semantically similar objects (future)
 * - Property Overlap: Calculate similarity based on property matching
 *
 * Migrated to TypeORM - uses Repository for simple queries, DataSource.query for vector search
 */
@Injectable()
export class EntityLinkingService {
  private readonly logger = new Logger(EntityLinkingService.name);
  private readonly embeddingCache = new Map<string, number[]>();

  constructor(
    private readonly graphService: GraphService,
    private readonly embeddings: EmbeddingsService,
    @InjectRepository(GraphObject)
    private readonly graphObjectRepo: Repository<GraphObject>,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Find similar objects using key-based or vector-based matching
   *
   * @param entity - The extracted entity to match
   * @param projectId - Project scope
   * @param strategy - Linking strategy ('key_match', 'vector_similarity', etc.)
   * @returns Object ID if match found, null otherwise
   */
  async findSimilarObject(
    entity: ExtractedEntity,
    projectId: string,
    strategy: 'key_match' | 'vector_similarity' | 'always_new'
  ): Promise<string | null> {
    if (strategy === 'always_new') {
      return null; // Never find matches
    }

    if (strategy === 'key_match') {
      return this.findByKeyMatch(entity, projectId);
    }

    if (strategy === 'vector_similarity') {
      // Try key match first for exact matches
      const keyMatch = await this.findByKeyMatch(entity, projectId);
      if (keyMatch) {
        this.logger.debug(
          `Vector strategy: found exact key match for ${entity.name}`
        );
        return keyMatch;
      }

      // Fall back to semantic similarity search
      if (this.embeddings.isEnabled()) {
        const vectorMatch = await this.findByVectorSimilarity(
          entity,
          projectId
        );
        if (vectorMatch) {
          this.logger.debug(
            `Vector strategy: found semantic match for ${entity.name}`
          );
          return vectorMatch;
        }
      } else {
        this.logger.warn(
          'Vector similarity requested but embeddings service is disabled'
        );
      }

      return null;
    }

    return null;
  }

  /**
   * Find object by key-based matching
   *
   * Tries multiple key matching strategies:
   * 1. Exact business_key match (if provided)
   * 2. Normalized name match (lowercase, trimmed)
   * 3. Property-based key extraction (id, code, identifier fields)
   *
   * @param entity - The extracted entity
   * @param projectId - Project scope
   * @returns Object ID if found, null otherwise
   */
  private async findByKeyMatch(
    entity: ExtractedEntity,
    projectId: string
  ): Promise<string | null> {
    const typeName = entity.type_name;

    // Strategy 1: Exact business_key match
    if (entity.business_key) {
      const exactMatch = await this.findByExactKey(
        projectId,
        typeName,
        entity.business_key
      );
      if (exactMatch) {
        this.logger.debug(
          `Found exact key match for ${entity.name}: ${exactMatch}`
        );
        return exactMatch;
      }
    }

    // Strategy 2: Normalized name match
    const normalizedName = this.normalizeKey(entity.name);
    if (normalizedName) {
      const nameMatch = await this.findByNormalizedName(
        projectId,
        typeName,
        normalizedName
      );
      if (nameMatch) {
        this.logger.debug(
          `Found normalized name match for ${entity.name}: ${nameMatch}`
        );
        return nameMatch;
      }
    }

    // Strategy 3: Property-based key extraction
    const extractedKey = this.extractKeyFromProperties(entity);
    if (extractedKey) {
      const propertyMatch = await this.findByExactKey(
        projectId,
        typeName,
        extractedKey
      );
      if (propertyMatch) {
        this.logger.debug(
          `Found property-based key match for ${entity.name}: ${propertyMatch}`
        );
        return propertyMatch;
      }
    }

    return null;
  }

  /**
   * Find object by vector similarity search
   * Keep as DataSource.query - uses pgvector <=> operator
   *
   * Uses cosine similarity with pgvector to find semantically similar objects.
   * Generates embedding from entity name and key properties.
   *
   * @param entity - The extracted entity
   * @param projectId - Project scope
   * @param threshold - Minimum cosine similarity (default 0.85)
   * @returns Object ID if similar object found, null otherwise
   */
  private async findByVectorSimilarity(
    entity: ExtractedEntity,
    projectId: string,
    threshold: number = 0.85
  ): Promise<string | null> {
    try {
      // Generate embedding for the entity
      const entityText = this.generateEntityText(entity);
      const embedding = await this.generateEmbedding(entityText);

      // Query for similar objects using cosine similarity - keep as raw SQL for pgvector
      // Uses embedding_v2 (768-dim) which matches Gemini text-embedding-004 output
      const result = (await this.dataSource.query(
        `SELECT id, 
                        1 - (embedding_v2 <=> $1::vector) as similarity
                 FROM kb.graph_objects
                 WHERE project_id = $2 
                   AND type = $3
                   AND embedding_v2 IS NOT NULL
                   AND 1 - (embedding_v2 <=> $1::vector) >= $4
                 ORDER BY similarity DESC
                 LIMIT 1`,
        [JSON.stringify(embedding), projectId, entity.type_name, threshold]
      )) as Array<{ id: string; similarity: number }>;

      if (result && result.length > 0) {
        const match = result[0];
        this.logger.debug(
          `Found vector match for ${entity.name}: ${match.id} ` +
            `(similarity: ${(match.similarity * 100).toFixed(1)}%)`
        );
        return match.id;
      }

      return null;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Vector similarity search failed: ${errorMessage}`,
        errorStack
      );
      return null;
    }
  }

  /**
   * Generate text representation of entity for embedding
   *
   * Combines entity name with key properties to create a rich text
   * representation for semantic matching.
   *
   * @param entity - The extracted entity
   * @returns Text representation
   */
  private generateEntityText(entity: ExtractedEntity): string {
    const parts: string[] = [entity.name];

    // Add type information
    parts.push(`Type: ${entity.type_name}`);

    // Add description if available
    if (entity.description) {
      parts.push(entity.description);
    }

    // Add key properties
    if (entity.properties) {
      const keyProps = [
        'id',
        'identifier',
        'code',
        'reference',
        'name',
        'title',
      ];
      for (const key of keyProps) {
        const value = entity.properties[key];
        if (value && typeof value === 'string' && value.trim()) {
          parts.push(`${key}: ${value}`);
        }
      }
    }

    return parts.join(' | ');
  }

  /**
   * Generate embedding vector for text
   *
   * Uses caching to avoid redundant API calls for the same text.
   *
   * @param text - Text to embed
   * @returns Embedding vector (768 dimensions for Gemini)
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = text.toLowerCase().trim();
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      this.logger.debug('Using cached embedding');
      return cached;
    }

    // Generate new embedding
    const embedding = await this.embeddings.embedQuery(text);

    // Cache the result (simple LRU: clear if cache gets too large)
    if (this.embeddingCache.size > 1000) {
      const firstKey = this.embeddingCache.keys().next().value;
      if (firstKey) {
        this.embeddingCache.delete(firstKey);
      }
    }
    this.embeddingCache.set(cacheKey, embedding);

    return embedding;
  }

  /**
   * Find object by exact key match - Migrated to TypeORM Repository
   *
   * @param projectId - Project scope
   * @param typeName - Object type
   * @param key - Business key
   * @returns Object ID if found, null otherwise
   */
  private async findByExactKey(
    projectId: string,
    typeName: string,
    key: string
  ): Promise<string | null> {
    const result = await this.graphObjectRepo.findOne({
      where: { projectId, type: typeName, key },
      select: ['id'],
    });

    return result?.id || null;
  }

  /**
   * Find object by normalized name match - Keep as DataSource.query for JSONB operators
   *
   * Searches for objects with matching normalized names in the properties
   *
   * @param projectId - Project scope
   * @param typeName - Object type
   * @param normalizedName - Normalized name (lowercase, trimmed)
   * @returns Object ID if found, null otherwise
   */
  private async findByNormalizedName(
    projectId: string,
    typeName: string,
    normalizedName: string
  ): Promise<string | null> {
    const result = (await this.dataSource.query(
      `SELECT id FROM kb.graph_objects
             WHERE project_id = $1 
               AND type = $2
               AND LOWER(TRIM(properties->>'name')) = $3
             LIMIT 1`,
      [projectId, typeName, normalizedName]
    )) as Array<{ id: string }>;

    return result.length > 0 ? result[0].id : null;
  }

  /**
   * Normalize a key for matching
   *
   * - Convert to lowercase
   * - Trim whitespace
   * - Remove special characters (optional)
   *
   * @param key - Raw key value
   * @returns Normalized key
   */
  private normalizeKey(key: string): string {
    if (!key) return '';
    return key.trim().toLowerCase();
  }

  /**
   * Extract key from entity properties
   *
   * Looks for common key field names:
   * - id, identifier, code, reference, key
   * - <type>_id, <type>_code (e.g., product_id, customer_code)
   *
   * @param entity - The extracted entity
   * @returns Extracted key if found, null otherwise
   */
  private extractKeyFromProperties(entity: ExtractedEntity): string | null {
    if (!entity.properties) return null;

    // Common key field names (in priority order)
    const keyFields = [
      'id',
      'identifier',
      'code',
      'reference',
      'key',
      'external_id',
      'system_id',
    ];

    for (const field of keyFields) {
      const value = entity.properties[field];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    // Try type-specific fields (e.g., product_id for Product type)
    const typePrefix = entity.type_name.toLowerCase().replace(/\s+/g, '_');
    const typeSpecificFields = [
      `${typePrefix}_id`,
      `${typePrefix}_code`,
      `${typePrefix}_reference`,
    ];

    for (const field of typeSpecificFields) {
      const value = entity.properties[field];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  /**
   * Merge entity properties with existing object
   *
   * Strategy:
   * - Keep existing properties if not present in new entity
   * - Update existing properties with new values
   * - Add new properties from entity
   *
   * @param existingObjectId - ID of existing object
   * @param entity - New extracted entity
   * @param jobId - Extraction job ID (for tracking)
   * @returns Updated object ID
   */
  async mergeEntityIntoObject(
    existingObjectId: string,
    entity: ExtractedEntity,
    jobId: string
  ): Promise<string> {
    // Get existing object (will throw NotFoundException if not found)
    const existingObject = await this.graphService.getObject(existingObjectId);

    // Merge properties (new values override existing)
    const mergedProperties = {
      ...existingObject.properties,
      ...entity.properties,
      // Always update these metadata fields
      name: entity.name,
      description: entity.description || existingObject.properties?.description,
      _extraction_last_updated_by_job: jobId,
      _extraction_last_updated_at: new Date().toISOString(),
    };

    // Update the object
    await this.graphService.patchObject(existingObjectId, {
      properties: mergedProperties,
    });

    this.logger.debug(
      `Merged entity ${entity.name} into existing object ${existingObjectId}`
    );

    return existingObjectId;
  }

  /**
   * Calculate property overlap between entity and existing object
   *
   * Useful for deciding merge strategy or confidence adjustment
   *
   * @param entity - New extracted entity
   * @param existingProperties - Properties of existing object
   * @returns Overlap ratio (0.0 - 1.0)
   */
  calculatePropertyOverlap(
    entity: ExtractedEntity,
    existingProperties: Record<string, any>
  ): number {
    if (!entity.properties || Object.keys(entity.properties).length === 0) {
      return 0.0;
    }

    const entityKeys = Object.keys(entity.properties);
    const existingKeys = Object.keys(existingProperties);

    // Calculate intersection
    const intersection = entityKeys.filter((key) => existingKeys.includes(key));

    // Calculate matching values
    let matchingValues = 0;
    for (const key of intersection) {
      const entityValue = entity.properties[key];
      const existingValue = existingProperties[key];

      // Compare values (simple equality for now)
      if (entityValue === existingValue) {
        matchingValues++;
      } else if (
        typeof entityValue === 'string' &&
        typeof existingValue === 'string' &&
        this.normalizeKey(entityValue) === this.normalizeKey(existingValue)
      ) {
        matchingValues++;
      }
    }

    // Overlap = matching values / total unique keys
    const totalKeys = new Set([...entityKeys, ...existingKeys]).size;
    return totalKeys > 0 ? matchingValues / totalKeys : 0.0;
  }

  /**
   * Decide merge action based on similarity and strategy
   *
   * Returns:
   * - 'skip': Object already exists with exact match, skip creation
   * - 'merge': Object exists with partial match, merge properties
   * - 'create': No match found, create new object
   *
   * @param entity - Extracted entity
   * @param projectId - Project scope
   * @param strategy - Linking strategy
   * @returns Merge decision
   */
  async decideMergeAction(
    entity: ExtractedEntity,
    projectId: string,
    strategy: 'key_match' | 'vector_similarity' | 'always_new'
  ): Promise<{
    action: 'skip' | 'merge' | 'create';
    existingObjectId?: string;
  }> {
    if (strategy === 'always_new') {
      return { action: 'create' };
    }

    const existingObjectId = await this.findSimilarObject(
      entity,
      projectId,
      strategy
    );

    if (!existingObjectId) {
      return { action: 'create' };
    }

    // Found existing object - get its properties to decide merge vs skip
    let existingObject;
    try {
      existingObject = await this.graphService.getObject(existingObjectId);
    } catch (error) {
      // Object was deleted between find and get
      this.logger.warn(
        `Object ${existingObjectId} not found (may have been deleted)`
      );
      return { action: 'create' };
    }

    const overlap = this.calculatePropertyOverlap(
      entity,
      existingObject.properties || {}
    );

    // If high overlap (>90%), skip creation (already exists)
    if (overlap > 0.9) {
      this.logger.debug(
        `Skipping entity ${entity.name}: high overlap (${(
          overlap * 100
        ).toFixed(0)}%) ` + `with existing object ${existingObjectId}`
      );
      return { action: 'skip', existingObjectId };
    }

    // Otherwise, merge new information into existing object
    this.logger.debug(
      `Merging entity ${entity.name}: partial overlap (${(
        overlap * 100
      ).toFixed(0)}%) ` + `with existing object ${existingObjectId}`
    );
    return { action: 'merge', existingObjectId };
  }
}
