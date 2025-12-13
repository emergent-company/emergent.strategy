/**
 * LLM Provider Interface
 *
 * Abstracts LLM interactions for entity extraction. Supports multiple providers
 * (Google Vertex AI, OpenAI, etc.) through a common interface.
 */

/**
 * Action types for context-aware extraction.
 * - 'create': New entity not in existing context (default)
 * - 'enrich': Entity matches existing context, add/update information
 * - 'reference': Pure reference to existing entity (for relationships only)
 */
export type EntityAction = 'create' | 'enrich' | 'reference';

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

  /**
   * Action determined by LLM based on existing entity context:
   * - 'create': New entity not in existing context (default)
   * - 'enrich': Matches existing entity, merge new information
   * - 'reference': Pure reference to existing entity (for relationships only)
   */
  action?: EntityAction;

  /**
   * ID of existing entity this references (when action is 'enrich' or 'reference').
   * Used to bypass entity linking search and directly use the known UUID.
   */
  existing_entity_id?: string;

  /**
   * Verification status from the verification cascade (LangGraph pipeline only).
   * - 'verified': confidence >= auto_accept_threshold
   * - 'needs_review': confidence >= confidence_threshold but < auto_accept_threshold
   * - 'rejected': confidence < confidence_threshold
   * - 'pending': not yet verified
   */
  verification_status?: 'verified' | 'needs_review' | 'rejected' | 'pending';
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

  /**
   * Verification status from the verification cascade (LangGraph pipeline only).
   * - 'verified': confidence >= auto_accept_threshold
   * - 'needs_review': confidence >= confidence_threshold but < auto_accept_threshold
   * - 'rejected': confidence < confidence_threshold
   * - 'pending': not yet verified
   */
  verification_status?: 'verified' | 'needs_review' | 'rejected' | 'pending';
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

  /** Similarity score from vector search (0-1, higher = more similar) */
  similarity?: number;
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

  /** Job context for monitoring (jobId, projectId, traceId, parentObservationId) */
  context?: {
    jobId: string;
    projectId: string;
    traceId?: string;
    /** Parent span ID for hierarchical Langfuse nesting */
    parentObservationId?: string;
  };

  /** Langfuse prompt label to use (e.g., 'tuned-v1', 'production') */
  promptLabel?: string;

  /**
   * Pre-chunked document text for efficient LLM processing.
   * If provided, extraction will process these chunks in batches
   * instead of the full document content, improving performance on large documents.
   */
  documentChunks?: string[];

  /**
   * LLM extraction method override.
   * - 'responseSchema': Uses Gemini's structured output with JSON schema (default)
   * - 'function_calling': Uses Gemini's function/tool calling API
   * If not provided, falls back to server default from EXTRACTION_METHOD env var.
   */
  extractionMethod?: 'responseSchema' | 'function_calling';

  /**
   * Per-LLM-call timeout in milliseconds.
   * If not provided, falls back to server default (180000ms = 3 minutes).
   */
  timeoutMs?: number;

  /**
   * Maximum batch size in characters for chunking document text.
   * If not provided, falls back to server default (30000 chars).
   */
  batchSizeChars?: number;

  /**
   * Similarity threshold for entity identity resolution (0.0-1.0).
   * Higher values require closer name matches to link entities together.
   * If not provided, falls back to project default or 0.7.
   */
  similarityThreshold?: number;

  // --- Verification Options ---

  /**
   * Enable/disable verification cascade for extracted entities and relationships.
   * If not provided, falls back to server default (EXTRACTION_VERIFICATION_ENABLED).
   */
  verificationEnabled?: boolean;

  /**
   * Confidence threshold (0.0-1.0) below which entities/relationships are marked needs_review.
   * If not provided, falls back to server default (EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW = 0.7).
   */
  confidenceThreshold?: number;

  /**
   * Auto-accept threshold (0.0-1.0) above which entities/relationships are auto-verified.
   * If not provided, falls back to server default (EXTRACTION_CONFIDENCE_THRESHOLD_AUTO = 0.9).
   */
  autoAcceptThreshold?: number;
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
