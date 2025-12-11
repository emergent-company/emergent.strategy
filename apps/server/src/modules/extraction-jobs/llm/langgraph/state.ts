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
 * Simplified schema for LLM extraction output.
 * This schema is intentionally minimal to maximize LLM performance:
 * - No validators (minLength, min/max) that slow down function calling
 * - No nested objects (properties) that complicate the schema
 * - No temp_id (generated in post-processing)
 *
 * The LLM only needs to extract: name, type, description, and optionally action
 */
export const LLMEntitySchema = z.object({
  /** Human-readable name of the entity */
  name: z.string(),
  /** Entity type (e.g., "Person", "Organization", "Location") */
  type: z.string(),
  /** Description of the entity (optional) */
  description: z.string().optional(),
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
  /** Additional properties as key-value pairs (populated from schema defaults) */
  properties: z.record(z.any()).optional(),
  /** Optional confidence score from extraction (0.0-1.0) */
  confidence: z.number().optional(),
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
  /** Optional confidence score (0.0-1.0) */
  confidence: z.number().optional(),
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
   * - 'responseSchema': Uses Gemini's structured output with JSON schema (default)
   * - 'function_calling': Uses Gemini's function/tool calling API
   */
  extraction_method: Annotation<'responseSchema' | 'function_calling'>({
    reducer: (_, next) => next,
    default: () => 'responseSchema',
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
