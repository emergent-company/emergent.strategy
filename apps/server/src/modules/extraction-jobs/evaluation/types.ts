/**
 * Type definitions for LangFuse Extraction Evaluation
 *
 * These types define the schema for evaluation datasets, experiment runs,
 * and scoring metrics used to evaluate the LangGraph extraction pipeline.
 */

// =============================================================================
// Dataset Schema Types
// =============================================================================

/**
 * Entity definition for expected output in evaluation datasets.
 * Simplified compared to InternalEntity - no temp_id or confidence needed.
 */
export interface ExpectedEntity {
  /** Human-readable name of the entity */
  name: string;
  /** Entity type (e.g., "Person", "Organization", "Location") */
  type: string;
  /** Optional description of the entity */
  description?: string;
  /** Optional additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Relationship definition for expected output in evaluation datasets.
 * Uses entity names instead of temp_ids for easier human authoring.
 */
export interface ExpectedRelationship {
  /** Name of the source entity */
  source_name: string;
  /** Name of the target entity */
  target_name: string;
  /** Relationship type (e.g., "WORKS_FOR", "LOCATED_IN") */
  relationship_type: string;
  /** Optional description */
  description?: string;
}

/**
 * Input structure for extraction evaluation dataset items.
 * Contains all the information needed to run an extraction.
 */
export interface ExtractionDatasetInput {
  /** The document text to extract from */
  document_text: string;
  /** Object schemas from template pack (entity type definitions) */
  object_schemas: Record<string, unknown>;
  /** Relationship schemas from template pack */
  relationship_schemas?: Record<string, unknown>;
  /** Optional filter for allowed entity types */
  allowed_types?: string[];
  /** Optional available tags for consistency */
  available_tags?: string[];
}

/**
 * Expected output for extraction evaluation.
 * This is what we compare the actual extraction results against.
 */
export interface ExtractionExpectedOutput {
  /** Expected entities to be extracted */
  entities: ExpectedEntity[];
  /** Expected relationships between entities */
  relationships: ExpectedRelationship[];
}

/**
 * Metadata for a dataset item, useful for filtering and analysis.
 */
export interface ExtractionDatasetMetadata {
  /** Optional source trace ID if created from a real extraction */
  source_trace_id?: string;
  /** Document category (narrative, legal, technical, other) */
  document_category?: 'narrative' | 'legal' | 'technical' | 'other';
  /** Difficulty rating for analysis */
  difficulty?: 'easy' | 'medium' | 'hard';
  /** Human notes about this dataset item */
  notes?: string;
  /** Tags for filtering */
  tags?: string[];
}

/**
 * Complete dataset item for extraction evaluation.
 * This is stored in LangFuse as a dataset item.
 */
export interface ExtractionDatasetItem {
  /** Unique identifier (assigned by LangFuse or provided) */
  id?: string;
  /** Input for the extraction pipeline */
  input: ExtractionDatasetInput;
  /** Expected output to compare against */
  expected_output: ExtractionExpectedOutput;
  /** Optional metadata */
  metadata?: ExtractionDatasetMetadata;
}

// =============================================================================
// Evaluation Score Types
// =============================================================================

/**
 * Types of scores computed during extraction evaluation.
 */
export type ExtractionScoreType =
  | 'entity_precision'
  | 'entity_recall'
  | 'entity_f1'
  | 'relationship_precision'
  | 'relationship_recall'
  | 'relationship_f1'
  | 'type_accuracy'
  | 'overall_quality';

/**
 * A single evaluation score.
 */
export interface EvaluationScore {
  /** Name of the score metric */
  name: ExtractionScoreType;
  /** Score value (0.0 to 1.0) */
  value: number;
  /** Optional comment explaining the score */
  comment?: string;
  /** Data type for LangFuse */
  dataType?: 'NUMERIC' | 'BOOLEAN';
}

/**
 * Complete evaluation result for a single extraction.
 */
export interface ExtractionEvaluationResult {
  /** All computed scores */
  scores: EvaluationScore[];
  /** Matched entities (name pairs) */
  matched_entities: Array<{
    expected: string;
    extracted: string;
    similarity: number;
  }>;
  /** Entities that were expected but not found */
  missing_entities: string[];
  /** Entities that were extracted but not expected (false positives) */
  extra_entities: string[];
  /** Matched relationships */
  matched_relationships: Array<{
    expected: string;
    extracted: string;
  }>;
  /** Relationships that were expected but not found */
  missing_relationships: string[];
  /** Relationships that were extracted but not expected */
  extra_relationships: string[];
}

// =============================================================================
// Experiment Configuration Types
// =============================================================================

/**
 * Configuration for running an extraction experiment.
 */
export interface ExperimentConfig {
  /** Unique name for this experiment run */
  name: string;
  /** Dataset name in LangFuse */
  datasetName: string;
  /** Model to use for extraction */
  model?: string;
  /** Prompt label/version to use */
  promptLabel?: string;
  /** Additional metadata to attach to traces */
  metadata?: Record<string, unknown>;
  /** Whether to run in dry-run mode (no actual extraction) */
  dryRun?: boolean;
  /** Environment label for LangFuse traces (default: 'test') */
  environment?: string;
}

/**
 * Result summary for an experiment run.
 */
export interface ExperimentRunSummary {
  /** Experiment name */
  name: string;
  /** Number of dataset items processed */
  itemCount: number;
  /** Aggregated scores across all items */
  aggregatedScores: Record<
    ExtractionScoreType,
    {
      mean: number;
      min: number;
      max: number;
      stdDev: number;
    }
  >;
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt: Date;
  /** Any errors encountered */
  errors: Array<{
    itemId: string;
    error: string;
  }>;
}

// =============================================================================
// Entity Matching Types
// =============================================================================

/**
 * Result of matching a single entity.
 */
export interface EntityMatchResult {
  /** The expected entity */
  expected: ExpectedEntity;
  /** The matched extracted entity, if found */
  matched?: {
    name: string;
    type: string;
    description?: string;
    properties?: Record<string, unknown>;
  };
  /** Similarity score (0.0 to 1.0) */
  similarity: number;
  /** Whether the types also match */
  typeMatch: boolean;
}

/**
 * Result of matching all entities.
 */
export interface EntityMatchingResult {
  /** All match results */
  matches: EntityMatchResult[];
  /** Precision: matched / extracted */
  precision: number;
  /** Recall: matched / expected */
  recall: number;
  /** F1 score: harmonic mean of precision and recall */
  f1: number;
  /** Type accuracy: entities with correct type / total matched */
  typeAccuracy: number;
}

/**
 * Result of matching a single relationship.
 */
export interface RelationshipMatchResult {
  /** The expected relationship as a formatted string */
  expected: string;
  /** The matched extracted relationship, if found */
  matched?: string;
  /** Whether this relationship was matched */
  isMatch: boolean;
  /** Type of match: 'exact', 'fuzzy', 'inverse', 'inverse-fuzzy', or 'none' */
  matchType?: 'exact' | 'fuzzy' | 'inverse' | 'inverse-fuzzy' | 'none';
}

/**
 * Result of matching all relationships.
 */
export interface RelationshipMatchingResult {
  /** All match results */
  matches: RelationshipMatchResult[];
  /** Precision: matched / extracted */
  precision: number;
  /** Recall: matched / expected */
  recall: number;
  /** F1 score */
  f1: number;
}

// =============================================================================
// LangFuse Integration Types
// =============================================================================

/**
 * Score input for LangFuse scoring API.
 */
export interface LangfuseScoreInput {
  /** Trace ID to score */
  traceId: string;
  /** Score name */
  name: string;
  /** Score value */
  value: number;
  /** Optional comment */
  comment?: string;
  /** Data type */
  dataType?: 'NUMERIC' | 'BOOLEAN';
}

/**
 * Dataset item input for LangFuse dataset API.
 */
export interface LangfuseDatasetItemInput {
  /** Input data (JSON-serializable) */
  input: unknown;
  /** Expected output (JSON-serializable) */
  expectedOutput?: unknown;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}
