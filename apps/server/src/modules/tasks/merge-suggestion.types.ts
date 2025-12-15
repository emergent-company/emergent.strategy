/**
 * Merge Suggestion Types
 *
 * Types for LLM-powered merge suggestions when reviewing duplicate objects.
 */

/**
 * Context for a single object being considered for merge
 */
export interface MergeObjectContext {
  id: string;
  type: string;
  key: string | null;
  properties: Record<string, unknown>;
  labels: string[];
  version: number;
}

/**
 * Context assembled for the LLM to suggest merged property values
 */
export interface MergeSuggestionContext {
  /** Source object (will be merged into target) */
  sourceObject: MergeObjectContext;
  /** Target object (will receive merged properties) */
  targetObject: MergeObjectContext;
  /** Similarity percentage between the objects */
  similarityPercent: number;
}

/**
 * LLM's suggestion for a single property merge
 */
export interface PropertyMergeSuggestion {
  /** Property key */
  key: string;
  /** Value from source object (may be undefined if not present) */
  sourceValue: unknown;
  /** Value from target object (may be undefined if not present) */
  targetValue: unknown;
  /** Suggested merged value */
  suggestedValue: unknown;
  /** Explanation of why this value was chosen */
  explanation: string;
  /** Whether the property values differ */
  hasDifference: boolean;
  /** Action taken: 'keep_source', 'keep_target', 'combine', 'new_value' */
  action: 'keep_source' | 'keep_target' | 'combine' | 'new_value';
}

/**
 * Complete LLM merge suggestion result
 */
export interface MergeSuggestionResult {
  /** Suggested merged properties */
  suggestedProperties: Record<string, unknown>;
  /** Per-property explanations and suggestions */
  propertyMergeSuggestions: PropertyMergeSuggestion[];
  /** Overall explanation of the merge suggestion */
  overallExplanation: string;
  /** Confidence score (0-1) in the merge suggestion */
  confidence: number;
  /** Any warnings or notes about the merge */
  warnings: string[];
}

/**
 * Response from the merge suggestion endpoint
 */
export interface MergeSuggestionResponse {
  success: boolean;
  data?: MergeSuggestionResult;
  error?: string;
}
