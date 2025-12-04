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
 * Result of entity extraction from a document
 */
export interface ExtractionResult {
  /** Successfully extracted entities */
  entities: ExtractedEntity[];

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
 * LLM Provider interface for entity extraction
 */
export interface ILLMProvider {
  /**
   * Extract entities from document content using LLM
   *
   * @param documentContent - Full document text
   * @param extractionPrompt - System prompt with extraction instructions
   * @param objectSchemas - Object type schemas from template pack (JSON Schema format)
   * @param allowedTypes - Optional list of allowed entity types
   * @param availableTags - Optional list of existing tags to prefer for consistency
   * @param context - Optional job context for monitoring (jobId, projectId, traceId)
   * @returns Extraction result with entities and metadata
   */
  extractEntities(
    documentContent: string,
    extractionPrompt: string,
    objectSchemas: Record<string, any>,
    allowedTypes?: string[],
    availableTags?: string[],
    context?: { jobId: string; projectId: string; traceId?: string }
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
