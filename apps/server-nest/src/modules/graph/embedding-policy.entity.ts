/**
 * Embedding Policy Entity
 *
 * Defines rules for selective embedding of graph objects.
 * Allows fine-grained control over which objects get embeddings based on:
 * - Object type
 * - Property size
 * - Labels
 * - Specific property paths (for sensitive data masking)
 */

export interface EmbeddingPolicy {
  id: string;
  projectId: string;
  objectType: string;
  enabled: boolean;
  maxPropertySize: number | null;
  requiredLabels: string[];
  excludedLabels: string[];
  relevantPaths: string[];
  excludedStatuses: string[]; // NEW: Status values to exclude (e.g., ['draft'])
  createdAt: Date;
  updatedAt: Date;
}

export interface EmbeddingPolicyRow {
  id: string;
  project_id: string;
  object_type: string;
  enabled: boolean;
  max_property_size: number | null;
  required_labels: string[];
  excluded_labels: string[];
  relevant_paths: string[];
  excluded_statuses: string[]; // NEW: Status values to exclude
  created_at: Date;
  updated_at: Date;
}

/**
 * Convert database row to entity
 */
export function toEmbeddingPolicy(row: EmbeddingPolicyRow): EmbeddingPolicy {
  return {
    id: row.id,
    projectId: row.project_id,
    objectType: row.object_type,
    enabled: row.enabled,
    maxPropertySize: row.max_property_size,
    requiredLabels: row.required_labels || [],
    excludedLabels: row.excluded_labels || [],
    relevantPaths: row.relevant_paths || [],
    excludedStatuses: row.excluded_statuses || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
