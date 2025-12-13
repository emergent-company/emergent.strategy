/**
 * Extraction Tools for LLM-based entity and relationship extraction.
 *
 * Defines the tool schemas that will be passed to bindTools() for
 * structured extraction. The LLM calls these tools and we intercept
 * the tool_calls from the response.
 *
 * NOTE: Confidence scores are NOT extracted by the LLM - they are
 * calculated by the cascade system post-extraction.
 */

import { z } from 'zod';

/**
 * Schema for entity extraction tool.
 * The LLM calls this tool for each entity it identifies in the document.
 */
export const ExtractEntitySchema = z.object({
  name: z.string().describe('Human-readable name of the entity'),
  type_name: z
    .string()
    .describe(
      'Type of entity (e.g., "Requirement", "Decision", "Stakeholder")'
    ),
  description: z.string().describe('Detailed description of the entity'),
  properties: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Additional properties as key-value pairs based on the entity type schema'
    ),
});

/**
 * Schema for relationship extraction tool.
 * The LLM calls this tool for each relationship it identifies.
 *
 * Hybrid reference approach:
 * - source_name/target_name: For entities extracted in this batch
 * - source_id/target_id: For existing entities passed via context (UUID)
 */
export const ExtractRelationshipSchema = z.object({
  source_name: z
    .string()
    .nullish()
    .describe('Name of source entity (for newly extracted entities)'),
  source_id: z
    .string()
    .nullish()
    .describe('UUID of source entity (for existing entities from context)'),
  target_name: z
    .string()
    .nullish()
    .describe('Name of target entity (for newly extracted entities)'),
  target_id: z
    .string()
    .nullish()
    .describe('UUID of target entity (for existing entities from context)'),
  relationship_type: z
    .string()
    .describe(
      'Type of relationship (e.g., "PARENT_OF", "DEPENDS_ON", "OWNED_BY")'
    ),
  description: z
    .string()
    .optional()
    .describe('Optional description of this specific relationship instance'),
});

/**
 * Type for extracted entity from tool call
 */
export type ExtractedEntityToolCall = z.infer<typeof ExtractEntitySchema>;

/**
 * Type for extracted relationship from tool call
 */
export type ExtractedRelationshipToolCall = z.infer<
  typeof ExtractRelationshipSchema
>;

/**
 * Tool definition for extract_entity - used with bindTools()
 */
export const extractEntityToolDef = {
  name: 'extract_entity',
  description:
    'Extract an entity from the document. Call this tool once for each entity you identify. ' +
    'Provide the entity name, type, description, and any type-specific properties.',
  schema: ExtractEntitySchema,
};

/**
 * Tool definition for extract_relationship - used with bindTools()
 */
export const extractRelationshipToolDef = {
  name: 'extract_relationship',
  description:
    'Extract a relationship between two entities. Call this tool for each relationship you identify. ' +
    'Use source_name/target_name for entities you just extracted in this batch. ' +
    'Use source_id/target_id for existing entities that were provided in the context (reference by UUID).',
  schema: ExtractRelationshipSchema,
};

/**
 * All extraction tool definitions bundled together for bindTools()
 */
export const extractionToolDefs = [
  extractEntityToolDef,
  extractRelationshipToolDef,
];
