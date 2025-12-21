/**
 * Unified suggestion types for all chat implementations
 *
 * This file consolidates suggestion types from:
 * - Object refinement chat (property_change, relationship_add, etc.)
 * - Merge chat (keep_source, keep_target, combine, etc.)
 * - Template studio chat (add_object_type, modify_object_type, etc.)
 */

// ============================================================================
// Base Types
// ============================================================================

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'outdated';

// ============================================================================
// Refinement Suggestion Types (Object Refinement Chat)
// ============================================================================

export type RefinementSuggestionType =
  | 'property_change'
  | 'relationship_add'
  | 'relationship_remove'
  | 'rename';

export interface RefinementSuggestionDetails {
  propertyKey?: string;
  oldValue?: unknown;
  newValue?: unknown;
  relationshipType?: string;
  targetObjectId?: string;
  targetObjectName?: string;
  relationshipId?: string;
  oldName?: string;
  newName?: string;
  properties?: Record<string, unknown>;
  typeLabel?: string; // Custom label override
}

// ============================================================================
// Merge Suggestion Types (Merge Chat)
// ============================================================================

export type MergeSuggestionType =
  | 'property_merge'
  | 'keep_source'
  | 'keep_target'
  | 'combine'
  | 'new_value'
  | 'drop_property';

export interface MergeSuggestionDetails {
  propertyKey: string;
  sourceValue?: unknown;
  targetValue?: unknown;
  suggestedValue?: unknown;
}

// ============================================================================
// Schema Suggestion Types (Template Studio Chat)
// ============================================================================

export type SchemaSuggestionType =
  | 'add_object_type'
  | 'modify_object_type'
  | 'remove_object_type'
  | 'add_relationship_type'
  | 'modify_relationship_type'
  | 'remove_relationship_type'
  | 'update_ui_config'
  | 'update_extraction_prompt';

export interface SchemaSuggestionDetails {
  target_type: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// ============================================================================
// Unified Suggestion Type
// ============================================================================

export type AnySuggestionType =
  | RefinementSuggestionType
  | MergeSuggestionType
  | SchemaSuggestionType;

/**
 * Unified suggestion interface that can represent any suggestion type
 */
export interface UnifiedSuggestion {
  /** Unique identifier or index */
  id?: string;
  index?: number;

  /** The type of suggestion - determines how it's rendered */
  type: AnySuggestionType;

  /** Human-readable explanation of the suggestion */
  explanation?: string;
  description?: string; // Alias used by schema suggestions

  /** Current status */
  status: SuggestionStatus;

  /** Type-specific details */
  details?: Record<string, unknown>;

  // Merge-specific fields (flattened for convenience)
  propertyKey?: string;
  sourceValue?: unknown;
  targetValue?: unknown;
  suggestedValue?: unknown;

  // Schema-specific fields (flattened for convenience)
  target_type?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// ============================================================================
// Type Category Detection
// ============================================================================

export const REFINEMENT_TYPES: RefinementSuggestionType[] = [
  'property_change',
  'relationship_add',
  'relationship_remove',
  'rename',
];

export const MERGE_TYPES: MergeSuggestionType[] = [
  'property_merge',
  'keep_source',
  'keep_target',
  'combine',
  'new_value',
  'drop_property',
];

export const SCHEMA_TYPES: SchemaSuggestionType[] = [
  'add_object_type',
  'modify_object_type',
  'remove_object_type',
  'add_relationship_type',
  'modify_relationship_type',
  'remove_relationship_type',
  'update_ui_config',
  'update_extraction_prompt',
];

export function isRefinementType(
  type: AnySuggestionType
): type is RefinementSuggestionType {
  return REFINEMENT_TYPES.includes(type as RefinementSuggestionType);
}

export function isMergeType(
  type: AnySuggestionType
): type is MergeSuggestionType {
  return MERGE_TYPES.includes(type as MergeSuggestionType);
}

export function isSchemaType(
  type: AnySuggestionType
): type is SchemaSuggestionType {
  return SCHEMA_TYPES.includes(type as SchemaSuggestionType);
}

/**
 * Get the category of a suggestion type
 */
export function getSuggestionCategory(
  type: AnySuggestionType
): 'refinement' | 'merge' | 'schema' | 'unknown' {
  if (isRefinementType(type)) return 'refinement';
  if (isMergeType(type)) return 'merge';
  if (isSchemaType(type)) return 'schema';
  return 'unknown';
}
