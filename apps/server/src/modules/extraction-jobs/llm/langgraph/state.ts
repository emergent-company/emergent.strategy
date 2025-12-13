/**
 * LangGraph State Definition for Entity Extraction Pipeline
 *
 * This file defines the shared state that flows through the graph nodes,
 * as well as Zod schemas for validation and type annotations for LangGraph.
 */

import { z } from 'zod';
import { Annotation } from '@langchain/langgraph';
import type { ExistingEntityContext } from '../llm-provider.interface';

// =============================================================================
// Zod Schemas for Internal Models
// =============================================================================

/**
 * Action types for context-aware extraction.
 * - 'create': New entity not in existing context (default)
 * - 'enrich': Entity matches existing context, add/update information
 * - 'reference': Pure reference to existing entity (for relationships only)
 */
export const EntityActionSchema = z.enum(['create', 'enrich', 'reference']);
export type EntityAction = z.infer<typeof EntityActionSchema>;

/**
 * Verification status for entities and relationships.
 * Set by the verification nodes based on confidence thresholds.
 */
export const VerificationStatusSchema = z.enum([
  'pending', // Not yet verified
  'verified', // Confidence >= auto_accept_threshold
  'needs_review', // Confidence >= confidence_threshold but < auto_accept_threshold
  'rejected', // Confidence < confidence_threshold
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * Simplified schema for LLM extraction output.
 * This schema is optimized for LLM performance:
 * - No validators (minLength, min/max) that slow down function calling
 * - No temp_id (generated in post-processing)
 * - Properties are extracted as key-value pairs based on type-specific schemas
 *
 * The LLM extracts: name, type, description, properties, and optionally action
 */
export const LLMEntitySchema = z.object({
  /** Human-readable name of the entity */
  name: z.string(),
  /** Entity type (e.g., "Person", "Organization", "Location") */
  type: z.string(),
  /** Description of the entity (optional) */
  description: z.string().optional(),
  /**
   * Type-specific properties extracted from the document.
   * Keys and expected values depend on the entity type schema.
   * Example: { "author": "John Smith", "publication_date": "2024-01-15" }
   */
  properties: z.record(z.any()).optional(),
  /**
   * Action to take for this entity (optional, defaults to 'create'):
   * - 'create': New entity not found in existing context
   * - 'enrich': Matches existing entity, merge new information
   * - 'reference': Pure reference to existing entity (for relationships only)
   */
  action: EntityActionSchema.optional(),
  /**
   * ID of existing entity this references (when action is 'enrich' or 'reference').
   * Should match an id from the existing_entities context.
   */
  existing_entity_id: z.string().optional(),
});

export type LLMEntity = z.infer<typeof LLMEntitySchema>;

/**
 * Verification tier indicating which method was used.
 */
export const VerificationTierSchema = z.enum([
  'exact_match', // Tier 1: Exact string match
  'nli', // Tier 2: DeBERTa NLI model
  'llm_judge', // Tier 3: Gemini LLM judge
  'not_verified', // Verification was skipped or not applicable
]);
export type VerificationTier = z.infer<typeof VerificationTierSchema>;

/**
 * Schema for an extracted entity with internal processing fields.
 * This is used after LLM extraction for internal pipeline processing.
 * temp_id is generated in post-processing, not by the LLM.
 */
export const InternalEntitySchema = z.object({
  /** Unique temporary identifier for internal linking (generated post-LLM) */
  temp_id: z.string(),
  /** Human-readable name of the entity */
  name: z.string(),
  /** Entity type (e.g., "Person", "Organization", "Location") */
  type: z.string(),
  /** Description of the entity */
  description: z.string().optional(),
  /** Type-specific properties extracted from the document */
  properties: z.record(z.any()).optional(),
  /**
   * Action determined by LLM based on existing entity context:
   * - 'create': New entity (default)
   * - 'enrich': Update existing entity with new information
   * - 'reference': Pure reference, don't create new object
   */
  action: EntityActionSchema.optional(),
  /**
   * ID of existing entity this references (when action is 'enrich' or 'reference').
   * Used to bypass entity linking search and directly use the known UUID.
   */
  existing_entity_id: z.string().optional(),

  // --- Verification fields (set by entity-verification node) ---

  /**
   * Weighted confidence score (0.0-1.0) from verification.
   * Calculated as: 40% name + 30% description + 30% properties
   */
  confidence: z.number().min(0).max(1).optional(),
  /**
   * Verification status based on confidence thresholds.
   * Set by the entity-verification node.
   */
  verification_status: VerificationStatusSchema.optional(),
  /**
   * Which verification tier was primarily used.
   */
  verification_tier: VerificationTierSchema.optional(),
  /**
   * Human-readable reason for the verification decision.
   */
  verification_reason: z.string().optional(),
});

export type InternalEntity = z.infer<typeof InternalEntitySchema>;

/**
 * Schema for a relationship between entities.
 * Uses temp_ids for references which are resolved to UUIDs later.
 * Simplified: no validators to improve LLM performance.
 */
export const InternalRelationshipSchema = z.object({
  /** Source entity reference (temp_id) */
  source_ref: z.string(),
  /** Target entity reference (temp_id) */
  target_ref: z.string(),
  /** Relationship type (e.g., "WORKS_FOR", "LOCATED_IN", "PARENT_OF") */
  type: z.string(),
  /** Optional description of the relationship */
  description: z.string().optional(),

  // --- Verification fields (set by relationship-verification node) ---

  /**
   * Confidence score (0.0-1.0) from verification.
   * Calculated as: 70% existence+type + 30% description
   */
  confidence: z.number().min(0).max(1).optional(),
  /**
   * Verification status based on confidence thresholds.
   * Set by the relationship-verification node.
   */
  verification_status: VerificationStatusSchema.optional(),
  /**
   * Which verification tier was primarily used.
   */
  verification_tier: VerificationTierSchema.optional(),
  /**
   * Human-readable reason for the verification decision.
   */
  verification_reason: z.string().optional(),
});

export type InternalRelationship = z.infer<typeof InternalRelationshipSchema>;

/**
 * Document category for routing to specialized extraction prompts
 */
export const DocumentCategorySchema = z.enum([
  'narrative',
  'legal',
  'technical',
  'other',
]);

export type DocumentCategory = z.infer<typeof DocumentCategorySchema>;

/**
 * Schema for router output
 */
export const RouterOutputSchema = z.object({
  category: DocumentCategorySchema,
  reasoning: z.string().optional(),
});

export type RouterOutput = z.infer<typeof RouterOutputSchema>;

/**
 * Schema for LLM entity extractor output.
 * Uses the simplified LLMEntitySchema for better LLM performance.
 */
export const EntityExtractorOutputSchema = z.object({
  entities: z.array(LLMEntitySchema),
});

export type EntityExtractorOutput = z.infer<typeof EntityExtractorOutputSchema>;

/**
 * Schema for relationship builder output
 */
export const RelationshipBuilderOutputSchema = z.object({
  relationships: z.array(InternalRelationshipSchema),
});

export type RelationshipBuilderOutput = z.infer<
  typeof RelationshipBuilderOutputSchema
>;

// =============================================================================
// LangGraph State Annotation
// =============================================================================

/**
 * LangGraph state annotation defining the shared state structure.
 *
 * Uses Annotation.Root to define the state shape with proper reducers
 * for array fields that need to be accumulated across nodes.
 */
export const ExtractionGraphState = Annotation.Root({
  // --- Inputs (set once at start) ---

  /** Original document text to extract from (used if chunks not provided) */
  original_text: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  /**
   * Pre-chunked document text for efficient LLM processing.
   * If provided, entity extraction will process these chunks in batches
   * instead of the full original_text, improving performance on large documents.
   */
  document_chunks: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** File metadata for context */
  file_metadata: Annotation<Record<string, any>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),

  /** Existing entities from the project for identity resolution */
  existing_entities: Annotation<ExistingEntityContext[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Object schemas from template pack */
  object_schemas: Annotation<Record<string, any>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),

  /** Relationship schemas from template pack */
  relationship_schemas: Annotation<Record<string, any>>({
    reducer: (_, next) => next,
    default: () => ({}),
  }),

  /** Allowed entity types filter */
  allowed_types: Annotation<string[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  /** Available tags for consistency */
  available_tags: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // --- Tracing Context ---

  /** Langfuse trace ID for observability */
  trace_id: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  /** Parent observation ID for hierarchical nesting in Langfuse */
  parent_observation_id: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  /** Langfuse prompt label to use (e.g., 'tuned-v1', 'production') */
  prompt_label: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  /**
   * LLM extraction method to use.
   * - 'responseSchema': Uses Gemini's structured output with JSON schema (most reliable structure)
   * - 'function_calling': Uses Gemini's function/tool calling API
   * - 'json_freeform': Uses JSON mode without schema (best for property population)
   *
   * Default is 'json_freeform' because testing shows it produces 100% property population
   * vs 0% for function_calling and responseSchema with Gemini Flash Lite.
   */
  extraction_method: Annotation<
    'responseSchema' | 'function_calling' | 'json_freeform'
  >({
    reducer: (_, next) => next,
    default: () => 'json_freeform',
  }),

  /**
   * Per-LLM-call timeout in milliseconds.
   * Default: 180000 (3 minutes) based on xlarge performance testing.
   */
  timeout_ms: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 180000,
  }),

  /**
   * Maximum batch size in characters for chunking document text.
   * Default: 30000 (30KB) - this is the chunk size for extraction.
   */
  batch_size_chars: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 30000,
  }),

  /**
   * Similarity threshold for entity identity resolution (0.0-1.0).
   * Higher values require closer name matches to link entities together.
   * Default: 0.7 (configurable per-project via auto_extract_config.entity_similarity_threshold)
   */
  similarity_threshold: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0.7,
  }),

  // --- Verification Configuration ---

  /**
   * Configuration for the verification cascade.
   * Set at graph initialization from options or config defaults.
   */
  verification_config: Annotation<{
    enabled: boolean;
    confidence_threshold: number;
    auto_accept_threshold: number;
  }>({
    reducer: (_, next) => next,
    default: () => ({
      enabled: true,
      confidence_threshold: 0.7,
      auto_accept_threshold: 0.9,
    }),
  }),

  // --- Internal Processing State ---

  /** Document category determined by router */
  doc_category: Annotation<DocumentCategory>({
    reducer: (_, next) => next,
    default: () => 'other',
  }),

  /** Entities extracted by EntityExtractor node */
  extracted_entities: Annotation<InternalEntity[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Map of temp_id -> resolved UUID (existing or new) */
  resolved_uuid_map: Annotation<Record<string, string>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  /** Relationships built by RelationshipBuilder node */
  final_relationships: Annotation<InternalRelationship[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /**
   * Summary of verification results from the verification nodes.
   * Populated by entity-verification and relationship-verification nodes.
   */
  verification_summary: Annotation<
    | {
        entities_verified: number;
        entities_accepted: number;
        entities_needs_review: number;
        entities_rejected: number;
        relationships_verified: number;
        relationships_accepted: number;
        relationships_needs_review: number;
        relationships_rejected: number;
        avg_entity_confidence: number;
        avg_relationship_confidence: number;
        verification_tiers_used: Record<string, number>;
      }
    | undefined
  >({
    reducer: (prev, next) => (next ? { ...prev, ...next } : prev),
    default: () => undefined,
  }),

  // --- Control Flow State ---

  /** Whether quality check passed */
  quality_check_passed: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  /** Number of retry attempts for relationship building */
  retry_count: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  /** Maximum retry attempts allowed */
  max_retries: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 3,
  }),

  /** Feedback messages for retry loops */
  feedback_log: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  /** Orphan entity temp_ids from last quality check */
  orphan_entities: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // --- Entity Extraction Retry State ---

  /** Number of retry attempts for entity extraction */
  entity_retry_count: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  /** Maximum retry attempts for entity extraction */
  max_entity_retries: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 2,
  }),

  /** Whether entity extraction succeeded (false = 0 entities or error) */
  entity_extraction_passed: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => true,
  }),

  // --- Token Usage Tracking ---

  /** Accumulated token usage across all LLM calls */
  total_prompt_tokens: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  total_completion_tokens: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  /** Raw responses from each node for debugging */
  node_responses: Annotation<Record<string, any>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  /** Discovered types during extraction */
  discovered_types: Annotation<string[]>({
    reducer: (prev, next) => [...new Set([...prev, ...next])],
    default: () => [],
  }),
});

/**
 * Type for the extraction graph state
 */
export type ExtractionGraphStateType = typeof ExtractionGraphState.State;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique temp_id for an entity based on its name and type.
 * Format: {type_slug}_{sequence}
 */
export function generateTempId(
  name: string,
  type: string,
  existingIds: Set<string>
): string {
  const typeSlug = type.toLowerCase().replace(/\s+/g, '_').slice(0, 20);
  const nameSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 20);

  let baseId = `${typeSlug}_${nameSlug}`;
  let id = baseId;
  let counter = 1;

  while (existingIds.has(id)) {
    id = `${baseId}_${counter}`;
    counter++;
  }

  return id;
}

/**
 * Calculate orphan rate: percentage of entities not in any relationship
 */
export function calculateOrphanRate(
  entities: InternalEntity[],
  relationships: InternalRelationship[]
): number {
  if (entities.length === 0) return 0;

  const connectedIds = new Set<string>();
  for (const rel of relationships) {
    connectedIds.add(rel.source_ref);
    connectedIds.add(rel.target_ref);
  }

  const orphanCount = entities.filter(
    (e) => !connectedIds.has(e.temp_id)
  ).length;
  return orphanCount / entities.length;
}

/**
 * Get list of orphan entity temp_ids
 */
export function getOrphanEntities(
  entities: InternalEntity[],
  relationships: InternalRelationship[]
): string[] {
  const connectedIds = new Set<string>();
  for (const rel of relationships) {
    connectedIds.add(rel.source_ref);
    connectedIds.add(rel.target_ref);
  }

  return entities
    .filter((e) => !connectedIds.has(e.temp_id))
    .map((e) => e.temp_id);
}
