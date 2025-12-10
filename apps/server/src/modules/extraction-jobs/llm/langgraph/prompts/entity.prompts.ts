/**
 * Entity Extraction Prompts
 *
 * Simplified, schema-driven prompts for extracting entities.
 * The prompts match the simplified LLMEntitySchema (name, type, description only).
 * Complex properties are NOT extracted by the LLM - they're handled in post-processing.
 */

import { InternalEntity } from '../state';
import { ExistingEntityContext } from '../../llm-provider.interface';

/** Extraction method type */
export type ExtractionMethod = 'responseSchema' | 'function_calling';

/**
 * Base system prompt for entity extraction - simplified for performance
 */
export const ENTITY_EXTRACTOR_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, provide:
1. name: Clear, descriptive name of the entity
2. type: Entity type from the allowed list
3. description: Brief description of what this entity represents

RULES:
- Extract ALL entities that match the allowed types
- Be thorough - don't miss important entities
- Use consistent naming
- Keep descriptions concise but informative`;

/**
 * System prompt extension for context-aware extraction
 */
export const CONTEXT_AWARE_EXTRACTION_RULES = `
CONTEXT-AWARE EXTRACTION RULES:
- Below is a list of existing entities already in the knowledge graph
- When you find an entity that MATCHES an existing one, use the SAME NAME and set action="enrich"
- When you find NEW information about an existing entity, include it in the description
- Only extract entities that are mentioned or referenced in THIS document
- Do NOT simply copy existing entities - only include them if the document mentions them
- For each entity, specify an "action":
  - "create" (default): This is a completely NEW entity not in the existing list
  - "enrich": This entity MATCHES an existing entity - new info should be merged
  - "reference": This entity is just a reference to an existing entity (for relationships only, no new info)
- When action is "enrich" or "reference", also provide "existing_entity_id" with the UUID from the existing entity`;

/**
 * Build a simplified entity extraction prompt
 *
 * This prompt matches the simplified LLMEntitySchema (name, type, description only).
 * It lists allowed types with brief descriptions but does NOT include complex property schemas.
 *
 * @param documentText - The document text to extract entities from
 * @param objectSchemas - Schema definitions for allowed entity types
 * @param allowedTypes - Optional subset of types to extract
 * @param existingEntities - Optional existing entities for context-aware extraction
 * @param extractionMethod - The extraction method being used ('responseSchema' or 'function_calling')
 */
export function buildEntityExtractionPrompt(
  documentText: string,
  objectSchemas: Record<string, any>,
  allowedTypes?: string[],
  existingEntities?: ExistingEntityContext[],
  extractionMethod: ExtractionMethod = 'responseSchema'
): string {
  const typesToExtract = allowedTypes || Object.keys(objectSchemas);

  let prompt = `${ENTITY_EXTRACTOR_SYSTEM_PROMPT}

## Allowed Entity Types

Extract ONLY these types: ${typesToExtract.join(', ')}

`;

  // Add brief type descriptions (no complex property schemas)
  for (const typeName of typesToExtract) {
    const schema = objectSchemas[typeName];
    if (schema?.description) {
      prompt += `- **${typeName}**: ${schema.description}\n`;
    } else {
      prompt += `- **${typeName}**\n`;
    }
  }

  // Add existing entity context if provided
  if (existingEntities && existingEntities.length > 0) {
    prompt += `
${CONTEXT_AWARE_EXTRACTION_RULES}

## Existing Entities in Knowledge Graph

These entities already exist. Use their exact names and IDs if the document references them:

`;
    // Group by type for easier reading
    const byType = new Map<string, ExistingEntityContext[]>();
    for (const entity of existingEntities) {
      const list = byType.get(entity.type_name) || [];
      list.push(entity);
      byType.set(entity.type_name, list);
    }

    // Show top entities per type (limit to avoid prompt bloat)
    const MAX_PER_TYPE = 10;
    const MAX_TOTAL = 50;
    let totalShown = 0;

    for (const [typeName, entities] of byType) {
      if (totalShown >= MAX_TOTAL) break;
      if (!typesToExtract.includes(typeName)) continue;

      prompt += `### ${typeName}\n`;
      const toShow = entities.slice(0, MAX_PER_TYPE);
      for (const entity of toShow) {
        if (totalShown >= MAX_TOTAL) break;
        const similarity = entity.similarity
          ? ` (similarity: ${(entity.similarity * 100).toFixed(0)}%)`
          : '';
        const desc = entity.description
          ? ` - ${entity.description.slice(0, 100)}`
          : '';
        // Include the ID so LLM can reference it
        prompt += `- **${entity.name}** [id: ${entity.id}]${similarity}${desc}\n`;
        totalShown++;
      }
      if (entities.length > MAX_PER_TYPE) {
        prompt += `  _(and ${entities.length - MAX_PER_TYPE} more)_\n`;
      }
    }
    prompt += '\n';
  }

  // Generate appropriate output format based on extraction method and existing entities
  const hasExistingEntities = existingEntities && existingEntities.length > 0;

  // Add document section
  prompt += `
## Document

${documentText}

`;

  // Add method-specific output instructions
  if (extractionMethod === 'function_calling') {
    // Function calling method - schema is defined by the function, no JSON examples needed
    if (hasExistingEntities) {
      prompt += `## Instructions

Call the extract_entities function with the entities you find. For each entity:
- name: Entity name (use exact names from existing entities when matching)
- type: One of the allowed types above
- description: Brief description (optional)
- action: "create" (new entity), "enrich" (update existing), or "reference" (just a reference)
- existing_entity_id: UUID of existing entity when action is "enrich" or "reference"

Extract all entities now by calling the extract_entities function.`;
    } else {
      prompt += `## Instructions

Call the extract_entities function with the entities you find. For each entity:
- name: Entity name
- type: One of the allowed types above
- description: Brief description (optional)

Extract all entities now by calling the extract_entities function.`;
    }
  } else {
    // Response schema method - provide JSON format examples
    if (hasExistingEntities) {
      prompt += `## Output Format

Return a JSON object with an "entities" array. Each entity must have:
- name (string): Entity name
- type (string): One of the allowed types above
- description (string, optional): Brief description
- action (string, optional): "create" (new entity), "enrich" (update existing), or "reference" (just a reference)
- existing_entity_id (string, optional): UUID of existing entity when action is "enrich" or "reference"

Example with context-aware extraction:
\`\`\`json
{
  "entities": [
    {"name": "John", "type": "Person", "description": "Author of the letter", "action": "create"},
    {"name": "Jerusalem", "type": "Place", "description": "Holy city mentioned in the text", "action": "enrich", "existing_entity_id": "abc-123-uuid"},
    {"name": "Paul", "type": "Person", "action": "reference", "existing_entity_id": "def-456-uuid"}
  ]
}
\`\`\`

Extract all entities now.`;
    } else {
      prompt += `## Output Format

Return a JSON object with an "entities" array. Each entity must have:
- name (string): Entity name
- type (string): One of the allowed types above
- description (string, optional): Brief description

Example:
\`\`\`json
{
  "entities": [
    {"name": "John", "type": "Person", "description": "Author of the letter"},
    {"name": "Jerusalem", "type": "Place", "description": "Holy city"}
  ]
}
\`\`\`

Extract all entities now.`;
    }
  }

  return prompt;
}

/**
 * Build a retry prompt for entity extraction with orphan feedback
 */
export function buildEntityRetryPrompt(
  documentText: string,
  currentEntities: InternalEntity[],
  orphanTempIds: string[],
  feedback: string
): string {
  const orphanList = orphanTempIds.map((id) => `  - ${id}`).join('\n');

  return `## Retry: Improve Entity Extraction

Previous extraction had issues. The following entities are ORPHANS (not connected to any relationships):

${orphanList}

Feedback:
${feedback}

Please review the document again and consider:
1. Are there entities that should connect to the orphans?
2. Are there implicit relationships we missed?
3. Should any entities be merged or split?

## Current Entities
${JSON.stringify(currentEntities, null, 2)}

## Document
${documentText}

Provide an UPDATED entity list that will result in better connectivity.`;
}

/**
 * Build a retry prompt when entity extraction returned 0 entities or failed
 *
 * @param documentText - The document text to extract entities from
 * @param objectSchemas - Schema definitions for allowed entity types
 * @param allowedTypes - Optional subset of types to extract
 * @param existingEntities - Optional existing entities for context-aware extraction
 * @param extractionMethod - The extraction method being used
 * @param attemptNumber - Current retry attempt number (1-based)
 * @param feedback - Feedback from previous failed attempts
 */
export function buildEntityExtractionRetryPrompt(
  documentText: string,
  objectSchemas: Record<string, any>,
  allowedTypes: string[] | undefined,
  existingEntities: ExistingEntityContext[] | undefined,
  extractionMethod: ExtractionMethod,
  attemptNumber: number,
  feedback: string[]
): string {
  // Get base prompt
  const basePrompt = buildEntityExtractionPrompt(
    documentText,
    objectSchemas,
    allowedTypes,
    existingEntities,
    extractionMethod
  );

  // Add retry context at the beginning
  const retryContext = `## RETRY ATTEMPT ${attemptNumber}

The previous extraction attempt failed or returned 0 entities. This document should contain extractable entities.

Previous issues:
${feedback.map((f) => `- ${f}`).join('\n')}

IMPORTANT: Look carefully for entities. Even if entities are implicit or referenced indirectly, extract them.
Common issues to check:
- Entities mentioned by pronoun (he, she, they) - identify who they refer to
- Organizations, places, or concepts mentioned in passing
- Dates, events, or time periods if they're allowed types
- Names that appear in titles, signatures, or headers

---

`;

  return retryContext + basePrompt;
}
