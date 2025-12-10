/**
 * Langfuse Prompt Management Types
 *
 * Defines the prompt names and types used by the extraction pipeline.
 * These correspond to prompts stored in Langfuse for centralized management.
 */

/**
 * Prompt names for the extraction pipeline.
 * Each name corresponds to a prompt configured in Langfuse.
 */
export const EXTRACTION_PROMPT_NAMES = {
  /** Main entity extraction prompt */
  ENTITY_EXTRACTOR: 'entity-extractor',
  /** Retry prompt for entity extraction with feedback */
  ENTITY_EXTRACTOR_RETRY: 'entity-extractor-retry',
  /** Relationship building between entities */
  RELATIONSHIP_BUILDER: 'relationship-builder',
  /** Entity identity resolution and deduplication */
  IDENTITY_RESOLVER: 'identity-resolver',
  /** Quality auditing of extracted graph */
  QUALITY_AUDITOR: 'quality-auditor',
} as const;

export type ExtractionPromptName =
  (typeof EXTRACTION_PROMPT_NAMES)[keyof typeof EXTRACTION_PROMPT_NAMES];

/**
 * Variables that can be interpolated into extraction prompts.
 * These match the {{variable}} placeholders in Langfuse prompt templates.
 */
export interface EntityExtractorVariables {
  /** The document text to extract entities from */
  documentText: string;
  /** JSON-formatted schema definitions for entity types */
  schemaDefinitions: string;
  /** Comma-separated list of allowed entity types */
  allowedTypes: string;
}

export interface EntityExtractorRetryVariables
  extends EntityExtractorVariables {
  /** Feedback about orphan entities from previous attempt */
  orphanFeedback: string;
  /** Previous extraction result as JSON */
  previousResult: string;
}

export interface RelationshipBuilderVariables {
  /** The document text for context */
  documentText: string;
  /** JSON array of extracted entities */
  entities: string;
  /** JSON-formatted relationship type definitions */
  relationshipTypes: string;
}

export interface IdentityResolverVariables {
  /** JSON array of entities to resolve */
  entities: string;
  /** JSON array of existing entities to match against (optional) */
  existingEntities?: string;
}

export interface QualityAuditorVariables {
  /** The original document text */
  documentText: string;
  /** JSON representation of extracted entities */
  entities: string;
  /** JSON representation of extracted relationships */
  relationships: string;
}

/**
 * Union type of all prompt variable interfaces
 */
export type PromptVariables =
  | EntityExtractorVariables
  | EntityExtractorRetryVariables
  | RelationshipBuilderVariables
  | IdentityResolverVariables
  | QualityAuditorVariables;

/**
 * Options for fetching prompts from Langfuse
 */
export interface PromptFetchOptions {
  /** Specific version number to fetch (defaults to latest) */
  version?: number;
  /** Label to fetch (e.g., 'production', 'staging') */
  label?: string;
  /** Cache TTL in seconds (defaults to config value) */
  cacheTtlSeconds?: number;
  /** Whether to throw on error or return null */
  throwOnError?: boolean;
}

/**
 * Metadata about a fetched prompt
 */
export interface PromptMetadata {
  /** The prompt name */
  name: string;
  /** Version number */
  version: number;
  /** Labels applied to this version */
  labels: string[];
  /** Whether the prompt was fetched from cache */
  fromCache: boolean;
  /** Prompt type (text or chat) */
  type: 'text' | 'chat';
}

/**
 * Result of fetching and compiling a prompt
 */
export interface CompiledPromptResult {
  /** The compiled prompt text */
  prompt: string;
  /** Metadata about the source prompt */
  metadata: PromptMetadata;
}

/**
 * Chat message structure for chat prompts
 * Mirrors the Langfuse ChatMessage type
 */
export interface LangfuseChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string;
  name?: string;
}

/**
 * Interface representing a prompt client from Langfuse
 * This provides a common interface for both text and chat prompts
 */
export interface LangfusePromptClient {
  readonly name: string;
  readonly version: number;
  readonly config: unknown;
  readonly labels: string[];
  readonly tags: string[];
  readonly isFallback: boolean;
  readonly type: 'text' | 'chat';
  readonly prompt: string | LangfuseChatMessage[];
  compile(
    variables?: Record<string, string>
  ): string | LangfuseChatMessage[] | unknown[];
}
