/**
 * Relationship Builder Prompts
 *
 * General, schema-driven prompts for building relationships between extracted entities.
 * Uses temp_ids for internal linking before UUID resolution.
 */

import { InternalEntity, InternalRelationship } from '../state';
import type { ExistingEntityContext } from '../../llm-provider.interface';

/** Extraction method type */
export type ExtractionMethod =
  | 'responseSchema'
  | 'function_calling'
  | 'json_freeform';

// =============================================================================
// Constants for Document Context
// =============================================================================

/** Maximum characters for document context in relationship prompts */
export const DEFAULT_CONTEXT_MAX_CHARS = 16000;

/** Reserved characters for prompt overhead (schemas, entities, instructions) */
export const PROMPT_OVERHEAD_CHARS = 4000;

/** Maximum size for any single chunk (must fit with prompt overhead) */
export const MAX_SINGLE_CHUNK_CHARS =
  DEFAULT_CONTEXT_MAX_CHARS - PROMPT_OVERHEAD_CHARS;

// =============================================================================
// Chunk Combination Utilities
// =============================================================================

/**
 * Combine semantic chunks into document context, respecting boundaries.
 * Joins complete chunks until the character limit is reached.
 * Never cuts a chunk in the middle.
 *
 * @param chunks - Semantically chunked document text (required)
 * @param maxChars - Maximum total chars for combined context
 * @returns Combined text with chunk statistics
 * @throws Error if chunks array is empty
 * @throws Error if any single chunk exceeds MAX_SINGLE_CHUNK_CHARS
 */
export function combineChunksForContext(
  chunks: string[],
  maxChars: number = DEFAULT_CONTEXT_MAX_CHARS
): { text: string; includedChunks: number; totalChunks: number } {
  if (!chunks || chunks.length === 0) {
    throw new Error(
      'No document chunks provided for relationship building. ' +
        'Ensure document is chunked before extraction.'
    );
  }

  let combined = '';
  let includedChunks = 0;
  const maxSingleChunk = maxChars - PROMPT_OVERHEAD_CHARS;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Validate: single chunk must fit with prompt overhead
    if (chunk.length > maxSingleChunk) {
      throw new Error(
        `Chunk ${i} is too large: ${chunk.length} chars. ` +
          `Maximum allowed: ${maxSingleChunk} chars ` +
          `(context limit ${maxChars} - prompt overhead ${PROMPT_OVERHEAD_CHARS}). ` +
          `Reduce chunk size in chunking configuration.`
      );
    }

    const separator = combined ? '\n\n---\n\n' : '';
    const newLength = combined.length + separator.length + chunk.length;

    // Stop if adding this chunk would exceed limit
    if (combined.length > 0 && newLength > maxChars) {
      break;
    }

    combined = combined + separator + chunk;
    includedChunks++;
  }

  return { text: combined, includedChunks, totalChunks: chunks.length };
}

/**
 * System prompt for relationship extraction - general purpose
 */
export const RELATIONSHIP_BUILDER_SYSTEM_PROMPT = `You are an expert at finding connections in knowledge graphs. Your job is to identify ALL meaningful relationships between entities.

For EACH relationship you find:
1. Identify the source entity (by temp_id)
2. Identify the target entity (by temp_id)
3. Choose a relationship type from the "Available Relationship Types" section below
4. Provide a description of this specific relationship instance

## CRITICAL RULES

### Completeness is Key
- EVERY entity should have at least one relationship (no orphans!)
- Use the EXACT temp_ids from the entity list
- Create MULTIPLE relationships for the same entity pair if there are different relationship types

### Group Actions Apply to ALL Members
- When text says "they went to Moab" and "they" refers to a family, create TRAVELS_TO for EACH person
- When text says "They were Ephrathites" about a family, create MEMBER_OF for EACH family member
- When text says "a man of Bethlehem... he and his wife and his two sons", ALL of them are from Bethlehem

### Type Constraints
- Check the source/target type constraints for each relationship type
- If a relationship type says "Person → Place", the source must be a Person and target must be a Place

## RELATIONSHIP DISCOVERY
1. **Family**: "his two sons were X and Y" → parent-child relationships for BOTH parents
2. **Marriage**: "his wife X", "took wives" → spousal relationships  
3. **Travel**: "went to X" → journey/travel relationships
4. **Residence**: "from Bethlehem", "lived there" → residence relationships
5. **Membership**: "They were Ephrathites" → group membership for each person
6. **Geography**: "Bethlehem in Judah" → geographic containment (Place in Place)`;

/**
 * Build the relationship extraction prompt - general, schema-driven.
 * Uses semantic chunks for document context to avoid mid-text truncation.
 *
 * @param entities - Extracted entities to build relationships between
 * @param relationshipSchemas - Available relationship type definitions
 * @param documentChunks - Semantically chunked document text (required)
 * @param existingEntities - Existing entities from project for reference
 * @param orphanTempIds - Entity temp_ids that need relationships (for retry focus)
 * @param extractionMethod - The extraction method being used
 * @returns Complete prompt string for relationship extraction
 * @throws Error if documentChunks is empty or contains oversized chunks
 */
export function buildRelationshipPrompt(
  entities: InternalEntity[],
  relationshipSchemas: Record<string, any>,
  documentChunks: string[],
  existingEntities?: ExistingEntityContext[],
  orphanTempIds?: string[],
  extractionMethod: ExtractionMethod = 'json_freeform'
): string {
  // Combine chunks respecting semantic boundaries
  const {
    text: documentContext,
    includedChunks,
    totalChunks,
  } = combineChunksForContext(documentChunks);

  const truncationNote =
    includedChunks < totalChunks
      ? `\n...(showing ${includedChunks} of ${totalChunks} chunks)`
      : '';

  let prompt = `${RELATIONSHIP_BUILDER_SYSTEM_PROMPT}

## Available Relationship Types

`;

  // Add relationship type definitions from schemas
  for (const [typeName, schema] of Object.entries(relationshipSchemas)) {
    const schemaObj = schema as Record<string, any>;
    prompt += `### ${typeName}\n`;

    // Add description
    if (schemaObj.description) {
      prompt += `${schemaObj.description}\n\n`;
    }

    // Add source/target type constraints
    const sourceTypes = schemaObj.source_types || schemaObj.fromTypes || [];
    const targetTypes = schemaObj.target_types || schemaObj.toTypes || [];
    if (sourceTypes.length > 0 || targetTypes.length > 0) {
      prompt += `**Valid entity types:** ${
        sourceTypes.join(' or ') || 'any'
      } → ${targetTypes.join(' or ') || 'any'}\n\n`;
    }

    // Add extraction guidelines if available (from enhanced schemas)
    if (schemaObj.extraction_guidelines) {
      prompt += `**Guidelines:**\n${schemaObj.extraction_guidelines}\n\n`;
    }

    // Add examples if available (from enhanced schemas)
    if (
      schemaObj.examples &&
      Array.isArray(schemaObj.examples) &&
      schemaObj.examples.length > 0
    ) {
      prompt += `**Examples:**\n`;
      for (const example of schemaObj.examples.slice(0, 2)) {
        if (example.source && example.target) {
          prompt += `- ${example.source} → ${example.target}`;
          if (example.evidence) {
            prompt += ` (${example.evidence})`;
          }
          prompt += '\n';
        }
      }
      prompt += '\n';
    }
  }

  // Add extracted entities
  prompt += `## Entities to Connect (use these temp_ids)

`;
  for (const entity of entities) {
    prompt += `- **${entity.temp_id}** [${entity.type}]: ${entity.name}\n`;
    if (entity.description) {
      prompt += `  Description: ${entity.description.slice(0, 200)}${
        entity.description.length > 200 ? '...' : ''
      }\n`;
    }
  }
  prompt += '\n';

  // Add existing entities if any (for UUID references)
  if (existingEntities && existingEntities.length > 0) {
    prompt += `## Existing Entities in Knowledge Graph (reference by id)

`;
    for (const entity of existingEntities.slice(0, 20)) {
      prompt += `- **${entity.id}** [${entity.type_name}]: ${entity.name}\n`;
    }
    if (existingEntities.length > 20) {
      prompt += `... and ${existingEntities.length - 20} more\n`;
    }
    prompt += '\n';
  }

  // Highlight orphans if this is a retry
  if (orphanTempIds && orphanTempIds.length > 0) {
    prompt += `## PRIORITY: Connect These Orphan Entities

The following entities have NO relationships. You MUST find at least one connection for each:

`;
    for (const id of orphanTempIds) {
      const entity = entities.find((e) => e.temp_id === id);
      if (entity) {
        prompt += `- **${id}**: ${entity.name} - ${
          entity.description?.slice(0, 100) || 'No description'
        }\n`;
      }
    }
    prompt += `

Think creatively:
- Is there a spatial relationship? (LOCATED_IN, NEAR)
- Is there a temporal relationship? (PRECEDES, DURING)
- Is there a conceptual relationship? (RELATED_TO, SYMBOLIZES)
- Is there a hierarchical relationship? (PART_OF, BELONGS_TO)

`;
  }

  // Add document for context
  prompt += `## Document Context

${documentContext}${truncationNote}

## Your Task

Create relationships between the entities. For each relationship provide:
- source_ref: temp_id of source entity (or UUID if referencing existing entity)
- target_ref: temp_id of target entity (or UUID if referencing existing entity)
- type: One of the types from "Available Relationship Types" above
- description: Specific details about this relationship instance

IMPORTANT: For family/group actions mentioned in text, create relationships for ALL members involved.

GOAL: ZERO ORPHANS - every entity should have at least one relationship.

`;

  // Add method-specific output instructions
  if (extractionMethod === 'function_calling') {
    prompt += `Call the build_relationships function with all the relationships you identify.`;
  } else {
    prompt += `## REQUIRED OUTPUT FORMAT

You MUST return a JSON object with a "relationships" array:

\`\`\`json
{"relationships": [{"source_ref": "...", "target_ref": "...", "type": "...", "description": "..."}]}
\`\`\`

WRONG output formats (DO NOT USE):
- \`[...]\` (raw array without wrapper)
- \`{"result": [...]}\` (wrong key name)
- \`{"data": [...]}\` (wrong key name)

Remember: return \`{"relationships": [...]}\` format exactly.`;
  }

  return prompt;
}

/**
 * Build a retry prompt for relationship extraction.
 * Uses semantic chunks for document context to avoid mid-text truncation.
 *
 * @param entities - All extracted entities
 * @param currentRelationships - Relationships found so far
 * @param documentChunks - Semantically chunked document text (required)
 * @param orphanTempIds - Entity temp_ids that have no relationships
 * @param retryCount - Current retry attempt number
 * @param feedback - Feedback from previous attempt
 * @param extractionMethod - The extraction method being used
 * @returns Complete retry prompt string
 * @throws Error if documentChunks is empty or contains oversized chunks
 */
export function buildRelationshipRetryPrompt(
  entities: InternalEntity[],
  currentRelationships: InternalRelationship[],
  documentChunks: string[],
  orphanTempIds: string[],
  retryCount: number,
  feedback: string,
  extractionMethod: ExtractionMethod = 'json_freeform'
): string {
  // Combine chunks respecting semantic boundaries (same limit as main prompt)
  const {
    text: documentContext,
    includedChunks,
    totalChunks,
  } = combineChunksForContext(documentChunks);

  const truncationNote =
    includedChunks < totalChunks
      ? `\n...(showing ${includedChunks} of ${totalChunks} chunks)`
      : '';

  const orphanList = orphanTempIds
    .map((id) => {
      const entity = entities.find((e) => e.temp_id === id);
      return entity ? `  - ${id}: ${entity.name}` : `  - ${id}`;
    })
    .join('\n');

  // Build method-specific output instruction
  const outputInstruction =
    extractionMethod === 'function_calling'
      ? 'Call the build_relationships function with ONLY NEW relationships that connect the orphan entities.'
      : `Return ONLY NEW relationships that connect the orphan entities.

## REQUIRED OUTPUT FORMAT

You MUST return a JSON object with a "relationships" array:

\`\`\`json
{"relationships": [{"source_ref": "...", "target_ref": "...", "type": "...", "description": "..."}]}
\`\`\`

WRONG output formats (DO NOT USE):
- \`[...]\` (raw array without wrapper)
- \`{"result": [...]}\` (wrong key name)
- \`{"data": [...]}\` (wrong key name)

Remember: return \`{"relationships": [...]}\` format exactly.`;

  return `## Retry ${retryCount}: Fix Orphan Entities

CRITICAL: The following ${
    orphanTempIds.length
  } entities have NO relationships and are ORPHANS:

${orphanList}

These entities are mentioned in the document but are not connected to the knowledge graph.
This is a problem because orphan entities cannot be discovered through graph traversal.

## Current Relationships (${currentRelationships.length} total)
${currentRelationships
  .slice(0, 20)
  .map((r) => `  ${r.source_ref} --[${r.type}]--> ${r.target_ref}`)
  .join('\n')}
${
  currentRelationships.length > 20
    ? `  ... and ${currentRelationships.length - 20} more`
    : ''
}

## Feedback
${feedback}

## Your Task
Find relationships that connect the ORPHAN entities to the rest of the graph.

Think about:
1. Re-read the entity descriptions - they often mention other entities
2. Consider indirect relationships (A relates to B through shared context)
3. Use general relationship types like RELATED_TO or MENTIONED_IN if specific types don't fit
4. Look at the document again for implicit connections

## Document
${documentContext}${truncationNote}

## All Entities
${entities.map((e) => `- ${e.temp_id} [${e.type}]: ${e.name}`).join('\n')}

${outputInstruction}`;
}

/**
 * Validate that relationships reference valid temp_ids
 */
export function validateRelationshipRefs(
  relationships: InternalRelationship[],
  validTempIds: Set<string>,
  existingEntityIds?: Set<string>
): { valid: InternalRelationship[]; invalid: InternalRelationship[] } {
  const valid: InternalRelationship[] = [];
  const invalid: InternalRelationship[] = [];

  for (const rel of relationships) {
    const sourceValid =
      validTempIds.has(rel.source_ref) ||
      existingEntityIds?.has(rel.source_ref);
    const targetValid =
      validTempIds.has(rel.target_ref) ||
      existingEntityIds?.has(rel.target_ref);

    if (sourceValid && targetValid) {
      valid.push(rel);
    } else {
      invalid.push(rel);
    }
  }

  return { valid, invalid };
}

/**
 * Validate that relationships respect type constraints from schemas.
 * Filters out relationships where source or target entity types don't match
 * the allowed fromTypes/toTypes defined in the relationship schema.
 *
 * @param relationships - Relationships to validate
 * @param entityTypeMap - Map of temp_id/UUID -> entity type name
 * @param relationshipSchemas - Relationship schemas with type constraints
 * @returns Object with valid and invalid relationships
 */
export function validateRelationshipTypeConstraints(
  relationships: InternalRelationship[],
  entityTypeMap: Map<string, string>,
  relationshipSchemas: Record<string, any>
): { valid: InternalRelationship[]; invalid: InternalRelationship[] } {
  const valid: InternalRelationship[] = [];
  const invalid: InternalRelationship[] = [];

  for (const rel of relationships) {
    const schema = relationshipSchemas[rel.type];

    // If no schema exists for this type, allow it (might be a generic type)
    if (!schema) {
      valid.push(rel);
      continue;
    }

    const sourceTypes: string[] = schema.source_types || schema.fromTypes || [];
    const targetTypes: string[] = schema.target_types || schema.toTypes || [];

    // If no type constraints defined, allow it
    if (sourceTypes.length === 0 && targetTypes.length === 0) {
      valid.push(rel);
      continue;
    }

    const sourceEntityType = entityTypeMap.get(rel.source_ref);
    const targetEntityType = entityTypeMap.get(rel.target_ref);

    // Check source type constraint
    const sourceValid =
      sourceTypes.length === 0 ||
      (sourceEntityType && sourceTypes.includes(sourceEntityType));

    // Check target type constraint
    const targetValid =
      targetTypes.length === 0 ||
      (targetEntityType && targetTypes.includes(targetEntityType));

    if (sourceValid && targetValid) {
      valid.push(rel);
    } else {
      invalid.push(rel);
    }
  }

  return { valid, invalid };
}

/**
 * Build a retry partial for relationship building.
 *
 * This is a header that gets prepended to the main prompt on retry attempts.
 * It provides context about orphan entities without duplicating the entire prompt.
 *
 * @param retryCount - Current retry attempt number
 * @param orphanTempIds - Entity temp_ids that have no relationships
 * @param entities - All extracted entities (for looking up orphan names)
 * @param currentRelationships - Relationships found so far
 * @param feedback - Feedback from previous attempt
 */
export function buildRelationshipRetryPartial(
  retryCount: number,
  orphanTempIds: string[],
  entities: InternalEntity[],
  currentRelationships: InternalRelationship[],
  feedback: string
): string {
  const orphanList = orphanTempIds
    .map((id) => {
      const entity = entities.find((e) => e.temp_id === id);
      return entity ? `- ${id}: ${entity.name} [${entity.type}]` : `- ${id}`;
    })
    .join('\n');

  const relationshipsList = currentRelationships
    .slice(0, 20)
    .map((r) => `- ${r.source_ref} --[${r.type}]--> ${r.target_ref}`)
    .join('\n');

  const moreCount =
    currentRelationships.length > 20 ? currentRelationships.length - 20 : 0;
  const moreNote = moreCount > 0 ? `\n... and ${moreCount} more` : '';

  return `## RETRY ATTEMPT ${retryCount}: Fix Orphan Entities

CRITICAL: The following ${orphanTempIds.length} entities have NO relationships and are ORPHANS:

${orphanList}

These entities are mentioned in the document but are not connected to the knowledge graph.
This is a problem because orphan entities cannot be discovered through graph traversal.

### Current Relationships (${currentRelationships.length} total)
${relationshipsList}${moreNote}

### Feedback
${feedback}

### Your Task
Find relationships that connect the ORPHAN entities to the rest of the graph.

Think about:
1. Re-read the entity descriptions - they often mention other entities
2. Consider indirect relationships (A relates to B through shared context)
3. Use general relationship types like RELATED_TO or MENTIONED_IN if specific types don't fit
4. Look at the document again for implicit connections

---

`;
}
