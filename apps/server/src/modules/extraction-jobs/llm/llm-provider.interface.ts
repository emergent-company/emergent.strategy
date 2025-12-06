/**
 * LLM Provider Interface
 *
 * Abstracts LLM interactions for entity extraction. Supports multiple providers
 * (Google Vertex AI, OpenAI, etc.) through a common interface.
 */

/**
 * Extracted entity from document processing
 */
export interface ExtractedEntity {
  /** Type name (e.g., "Application Component", "Business Process") */
  type_name: string;

  /** Human-readable name of the entity */
  name: string;

  /** Detailed description */
  description: string;

  /** Business key for entity linking (optional) */
  business_key?: string;

  /** Arbitrary properties as key-value pairs */
  properties?: Record<string, any>;

  /** Confidence score 0.0-1.0 indicating extraction quality */
  confidence?: number;
}

/**
 * Reference to an entity endpoint in a relationship.
 * - For NEW entities (just extracted): use `name` only
 * - For EXISTING entities (from context): use `id` (UUID)
 */
export interface EntityReference {
  /** Entity name - used for newly extracted entities or as display label */
  name?: string;

  /** Entity UUID - used when referencing existing entities from context */
  id?: string;
}

/**
 * Extracted relationship between entities from document processing.
 * Endpoints can be referenced by name (new) or UUID (existing).
 */
export interface ExtractedRelationship {
  /** Source entity reference (name for new, id for existing) */
  source: EntityReference;

  /** Target entity reference (name for new, id for existing) */
  target: EntityReference;

  /** Relationship type name (e.g., "PARENT_OF", "WROTE", "BELONGS_TO") */
  relationship_type: string;

  /** Optional description of this specific relationship instance */
  description?: string;

  /** Confidence score 0.0-1.0 indicating extraction quality */
  confidence?: number;
}

/**
 * Result of entity extraction from a document
 */
export interface ExtractionResult {
  /** Successfully extracted entities */
  entities: ExtractedEntity[];

  /** Extracted relationships between entities (name-based, not yet resolved) */
  relationships: ExtractedRelationship[];

  /** Types discovered in the document (for dynamic type discovery) */
  discovered_types?: string[];

  /** Token usage for cost tracking */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };

  /** Raw LLM response for debugging */
  raw_response?: any;
}

/**
 * Relationship context for an existing entity (one level deep).
 */
export interface EntityRelationshipContext {
  /** Relationship type (e.g., "BELONGS_TO", "CREATED_BY") */
  type: string;

  /** Direction: "outgoing" = this entity -> target, "incoming" = source -> this entity */
  direction: 'outgoing' | 'incoming';

  /** The related entity's name */
  related_entity_name: string;

  /** The related entity's type */
  related_entity_type: string;
}

/**
 * Existing entity passed as context to the LLM.
 * LLM can reference these by UUID when creating relationships.
 */
export interface ExistingEntityContext {
  /** Entity UUID - LLM should use this when referencing in relationships */
  id: string;

  /** Entity name for display/matching */
  name: string;

  /** Entity type name */
  type_name: string;

  /** Optional description for context */
  description?: string;

  /** All properties of the entity (excluding internal fields) */
  properties?: Record<string, any>;

  /** Relationships to/from this entity (one level deep) */
  relationships?: EntityRelationshipContext[];
}

/**
 * Options for entity extraction
 */
export interface ExtractionOptions {
  /** Object type schemas from template pack (JSON Schema format) */
  objectSchemas: Record<string, any>;

  /** Relationship type schemas from template pack */
  relationshipSchemas?: Record<string, any>;

  /** Optional list of allowed entity types */
  allowedTypes?: string[];

  /** Optional list of existing tags to prefer for consistency */
  availableTags?: string[];

  /** Existing entities in the project that can be referenced by UUID */
  existingEntities?: ExistingEntityContext[];

  /** Job context for monitoring (jobId, projectId, traceId) */
  context?: { jobId: string; projectId: string; traceId?: string };
}

/**
 * LLM Provider interface for entity extraction
 */
export interface ILLMProvider {
  /**
   * Extract entities and relationships from document content using LLM
   *
   * @param documentContent - Full document text
   * @param extractionPrompt - System prompt with extraction instructions
   * @param options - Extraction options including schemas and context
   * @returns Extraction result with entities, relationships, and metadata
   */
  extractEntities(
    documentContent: string,
    extractionPrompt: string,
    options: ExtractionOptions
  ): Promise<ExtractionResult>;

  /**
   * Validate provider configuration
   * @returns true if configured correctly, false otherwise
   */
  isConfigured(): boolean;

  /**
   * Get provider name for logging/debugging
   */
  getName(): string;
}
