/**
 * Object Refinement Types
 *
 * Types for the object refinement chat feature, including suggestion structures
 * and context assembly.
 */

/**
 * Types of changes that can be suggested for an object
 */
export type RefinementSuggestionType =
  | 'property_change'
  | 'relationship_add'
  | 'relationship_remove'
  | 'rename';

/**
 * Base interface for all refinement suggestions
 */
export interface BaseRefinementSuggestion {
  type: RefinementSuggestionType;
  explanation: string;
}

/**
 * Suggestion to change a property value
 */
export interface PropertyChangeSuggestion extends BaseRefinementSuggestion {
  type: 'property_change';
  propertyKey: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Suggestion to add a relationship
 */
export interface RelationshipAddSuggestion extends BaseRefinementSuggestion {
  type: 'relationship_add';
  relationshipType: string;
  targetObjectId: string;
  targetObjectName: string;
  targetObjectType: string;
  properties?: Record<string, unknown>;
}

/**
 * Suggestion to remove a relationship
 */
export interface RelationshipRemoveSuggestion extends BaseRefinementSuggestion {
  type: 'relationship_remove';
  relationshipId: string;
  relationshipType: string;
  targetObjectId: string;
  targetObjectName: string;
}

/**
 * Suggestion to rename an object
 */
export interface RenameSuggestion extends BaseRefinementSuggestion {
  type: 'rename';
  oldName: string;
  newName: string;
}

/**
 * Union type for all suggestion types
 */
export type RefinementSuggestion =
  | PropertyChangeSuggestion
  | RelationshipAddSuggestion
  | RelationshipRemoveSuggestion
  | RenameSuggestion;

/**
 * Status of a suggestion after user review
 */
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

/**
 * A suggestion with its review status
 */
export interface ReviewedSuggestion {
  index: number;
  suggestion: RefinementSuggestion;
  status: SuggestionStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
}

/**
 * Context assembled for the LLM to make refinement suggestions
 */
export interface RefinementContext {
  /** The object being refined */
  object: ObjectContext;
  /** All relationships (incoming and outgoing) with full target/source details */
  relationships: RelationshipContext[];
  /** Source chunks the object was extracted from */
  sourceChunks: ChunkContext[];
  /** Schema for the object type (if available) */
  schema?: ObjectTypeSchema;
}

/**
 * Object details for context
 */
export interface ObjectContext {
  id: string;
  type: string;
  key: string | null;
  properties: Record<string, unknown>;
  labels: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Relationship with full object details for context
 */
export interface RelationshipContext {
  id: string;
  type: string;
  direction: 'outgoing' | 'incoming';
  properties: Record<string, unknown>;
  /** The related object (target for outgoing, source for incoming) */
  relatedObject: ObjectContext;
}

/**
 * Chunk details for context
 */
export interface ChunkContext {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  text: string;
}

/**
 * Object type schema from template pack
 */
export interface ObjectTypeSchema {
  type: string;
  description?: string;
  properties: Record<string, PropertySchema>;
  relationshipTypes?: string[];
}

/**
 * Property schema definition
 * Follows JSON Schema draft-07 conventions with additional extraction hints.
 */
export interface PropertySchema {
  type: string;
  description?: string;
  required?: boolean;
  enum?: string[];
  /**
   * Example values for this property.
   * Examples must match the property type:
   * - string properties: string[]
   * - number/integer properties: number[]
   * - boolean properties: boolean[]
   * - array properties: array of example arrays
   */
  examples?: unknown[];
  /** Format hint for string types (e.g., 'date', 'date-time', 'email', 'uri') */
  format?: string;
  /** For array types, schema of items */
  items?: PropertySchema | { type: string };
  /** Minimum value for number/integer types */
  minimum?: number;
  /** Maximum value for number/integer types */
  maximum?: number;
  /** Maximum length for string types */
  maxLength?: number;
  /** Default value */
  default?: unknown;
}

/**
 * Result of applying a suggestion
 */
export interface ApplySuggestionResult {
  success: boolean;
  error?: string;
  /** New version number after applying */
  newVersion?: number;
  /** ID of affected entity (object or relationship) */
  affectedId?: string;
}

/**
 * Conversation with object reference
 */
export interface ObjectConversation {
  id: string;
  objectId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}
