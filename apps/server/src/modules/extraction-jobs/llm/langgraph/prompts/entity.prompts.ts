/**
 * Entity Extraction Prompts
 *
 * Schema-driven prompts for extracting entities with their type-specific properties.
 * The prompts guide the LLM to extract name, type, description, and properties.
 */

import { InternalEntity } from '../state';
import { ExistingEntityContext } from '../../llm-provider.interface';

/** Extraction method type */
export type ExtractionMethod =
  | 'responseSchema'
  | 'function_calling'
  | 'json_freeform';

/**
 * Base system prompt for entity extraction - includes property extraction
 */
export const ENTITY_EXTRACTOR_SYSTEM_PROMPT = `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, you MUST provide these four fields:
1. name: Clear, descriptive name of the entity (REQUIRED, top-level field)
2. type: Entity type from the allowed list (REQUIRED, top-level field)
3. description: Brief description of what this entity represents (top-level field)
4. properties: An object containing type-specific attributes (CRITICAL - see below)

CRITICAL INSTRUCTIONS FOR PROPERTIES:
- The "properties" field is an object that MUST contain type-specific attributes extracted from the document
- For Person entities: include role, occupation, title, father, mother, tribe, age, significance, etc.
- For Location entities: include region, country, location_type, significance, etc.
- For Event entities: include date, location, participants, outcome, etc.
- For Organization entities: include type, purpose, members, location, etc.
- NEVER return an empty properties object {} if there is ANY relevant information in the document
- Extract ALL attributes mentioned or implied in the text for each entity
- The properties object should NOT contain name, type, or description - those are top-level fields

RULES:
- Extract ALL entities that match the allowed types
- Be thorough - don't miss important entities
- Use consistent naming
- Keep descriptions concise but informative
- Only include properties that are explicitly mentioned or clearly implied in the document
- Do NOT guess or fabricate property values`;

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
 * Build a schema-driven entity extraction prompt
 *
 * This prompt includes type-specific property schemas so the LLM knows
 * what properties to look for when extracting each entity type.
 *
 * @param documentText - The document text to extract entities from
 * @param objectSchemas - Schema definitions for allowed entity types
 * @param allowedTypes - Optional subset of types to extract
 * @param existingEntities - Optional existing entities for context-aware extraction
 * @param extractionMethod - The extraction method being used
 */
export function buildEntityExtractionPrompt(
  documentText: string,
  objectSchemas: Record<string, any>,
  allowedTypes?: string[],
  existingEntities?: ExistingEntityContext[],
  extractionMethod: ExtractionMethod = 'json_freeform'
): string {
  const typesToExtract = allowedTypes || Object.keys(objectSchemas);

  let prompt = `${ENTITY_EXTRACTOR_SYSTEM_PROMPT}

## Entity Types and Their Properties

Extract ONLY these types: ${typesToExtract.join(', ')}

`;

  // Fields that are top-level in the entity structure, NOT in properties
  const TOP_LEVEL_FIELDS = ['name', 'description', 'type'];

  // Add type descriptions WITH property schemas
  for (const typeName of typesToExtract) {
    const schema = objectSchemas[typeName];
    if (schema) {
      prompt += `### ${typeName}\n`;
      if (schema.description) {
        prompt += `${schema.description}\n`;
      }

      // Include property definitions if available (excluding top-level fields)
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        const additionalProps = Object.entries(
          schema.properties as Record<string, any>
        ).filter(
          ([propName]) =>
            !TOP_LEVEL_FIELDS.includes(propName) && !propName.startsWith('_')
        );

        if (additionalProps.length > 0) {
          prompt += `**Additional Properties** (stored in \`properties\` object):\n`;
          for (const [propName, propDef] of additionalProps) {
            const propType = propDef.type || 'string';
            const propDesc = propDef.description || '';
            const required = schema.required?.includes(propName)
              ? ' (required)'
              : '';
            prompt += `- \`${propName}\` (${propType})${required}: ${propDesc}\n`;
          }
        }
      }
      prompt += '\n';
    } else {
      prompt += `### ${typeName}\n\n`;
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
    // Function calling method - schema is defined by the function, include JSON example for clarity
    if (hasExistingEntities) {
      prompt += `## Instructions

Call the extract_entities function with the entities you find. For each entity:
- name: Entity name (REQUIRED top-level field, use exact names from existing entities when matching)
- type: One of the allowed types above (REQUIRED top-level field)
- description: Brief description (top-level field)
- properties: Object with type-specific attributes (CRITICAL - must not be empty if attributes exist)
- action: "create" (new entity), "enrich" (update existing), or "reference" (just a reference)
- existing_entity_id: UUID of existing entity when action is "enrich" or "reference"

CRITICAL: The "properties" object MUST contain type-specific attributes extracted from the document.
- For Person: include role, occupation, father, mother, tribe, age, significance, etc.
- For Location: include region, country, location_type, significance, etc.
- For Event: include date, location, participants, outcome, etc.
- NEVER return empty properties {} if the document mentions ANY attributes for the entity.

Example of what each entity should look like:
{
  "name": "Moses",
  "type": "Person",
  "description": "Leader who brought the Israelites out of Egypt",
  "properties": {
    "role": "prophet and leader",
    "tribe": "Levi",
    "significance": "Received the Ten Commandments"
  },
  "action": "create"
}

Extract all entities now by calling the extract_entities function.`;
    } else {
      prompt += `## Instructions

Call the extract_entities function with the entities you find. For each entity:
- name: Entity name (REQUIRED top-level field)
- type: One of the allowed types above (REQUIRED top-level field)
- description: Brief description (top-level field)
- properties: Object with type-specific attributes (CRITICAL - must not be empty if attributes exist)

CRITICAL: The "properties" object MUST contain type-specific attributes extracted from the document.
- For Person: include role, occupation, father, mother, tribe, age, significance, etc.
- For Location: include region, country, location_type, significance, etc.
- For Event: include date, location, participants, outcome, etc.
- NEVER return empty properties {} if the document mentions ANY attributes for the entity.

Example of what each entity should look like:
{
  "name": "Moses",
  "type": "Person",
  "description": "Leader who brought the Israelites out of Egypt",
  "properties": {
    "role": "prophet and leader",
    "tribe": "Levi",
    "significance": "Received the Ten Commandments"
  }
}

Extract all entities now by calling the extract_entities function.`;
    }
  } else {
    // Response schema method - provide JSON format examples
    if (hasExistingEntities) {
      prompt += `## Output Format

You MUST return a JSON object with an "entities" key containing an array of entities.

DO NOT return a bare array. DO NOT use "result" as the key. The key MUST be "entities".

Each entity in the array must have:
- name (string): Entity name (top-level, NOT in properties)
- type (string): One of the allowed types above (top-level, NOT in properties)
- description (string, optional): Brief description (top-level, NOT in properties)
- properties (object, optional): Type-specific attributes found in the document (e.g., role, tribe, location)
- action (string, optional): "create" (new entity), "enrich" (update existing), or "reference" (just a reference)
- existing_entity_id (string, optional): UUID of existing entity when action is "enrich" or "reference"

IMPORTANT: The "properties" object contains ONLY type-specific attributes - NOT name, type, or description.

CORRECT output format with context-aware extraction:
\`\`\`json
{
  "entities": [
    {
      "name": "John the Apostle",
      "type": "Person",
      "description": "One of the twelve apostles, author of the Gospel of John",
      "properties": {
        "role": "apostle",
        "occupation": "fisherman",
        "father": "Zebedee",
        "significance": "Wrote the Gospel of John and three epistles"
      },
      "action": "create"
    },
    {
      "name": "Jerusalem",
      "type": "Place",
      "description": "Holy city and center of Jewish worship",
      "properties": {
        "region": "Judea",
        "significance": "Capital of Israel, location of the Temple"
      },
      "action": "enrich",
      "existing_entity_id": "abc-123-uuid"
    },
    {
      "name": "Paul",
      "type": "Person",
      "action": "reference",
      "existing_entity_id": "def-456-uuid"
    }
  ]
}
\`\`\`

WRONG output formats (DO NOT USE):
- \`[...]\` (bare array without "entities" key)
- \`{"result": [...]}\` (wrong key name)
- \`{"data": [...]}\` (wrong key name)

Extract all entities now. Remember: return {"entities": [...]} format.`;
    } else {
      prompt += `## Output Format

You MUST return a JSON object with an "entities" key containing an array of entities.

DO NOT return a bare array. DO NOT use "result" as the key. The key MUST be "entities".

Each entity in the array must have:
- name (string): Entity name (top-level, NOT in properties)
- type (string): One of the allowed types above (top-level, NOT in properties)
- description (string, optional): Brief description (top-level, NOT in properties)
- properties (object, optional): Type-specific attributes found in the document (e.g., role, tribe, location)

IMPORTANT: The "properties" object contains ONLY type-specific attributes - NOT name, type, or description.

CORRECT output format:
\`\`\`json
{
  "entities": [
    {
      "name": "John the Apostle",
      "type": "Person",
      "description": "One of the twelve apostles, author of the Gospel of John",
      "properties": {
        "role": "apostle",
        "occupation": "fisherman",
        "father": "Zebedee"
      }
    },
    {
      "name": "Jerusalem",
      "type": "Place",
      "description": "Holy city and center of Jewish worship",
      "properties": {
        "region": "Judea",
        "significance": "Capital of Israel, location of the Temple"
      }
    }
  ]
}
\`\`\`

WRONG output formats (DO NOT USE):
- \`[...]\` (bare array without "entities" key)
- \`{"result": [...]}\` (wrong key name)
- \`{"data": [...]}\` (wrong key name)

Extract all entities now. Remember: return {"entities": [...]} format.`;
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

/**
 * Build a retry partial for entity extraction.
 *
 * This is a header that gets prepended to the main prompt on retry attempts.
 * It provides context about the retry without duplicating the entire prompt.
 *
 * @param retryCount - Current retry attempt number
 * @param currentEntityCount - Number of entities found so far
 * @param feedback - Feedback from previous attempt
 * @param previousEntities - Previously extracted entities for reference
 */
export function buildEntityRetryPartial(
  retryCount: number,
  currentEntityCount: number,
  feedback: string,
  previousEntities: InternalEntity[]
): string {
  const entitiesList = previousEntities
    .slice(0, 20)
    .map((e) => `- ${e.name} [${e.type}]`)
    .join('\n');

  const moreCount =
    previousEntities.length > 20 ? previousEntities.length - 20 : 0;
  const moreNote = moreCount > 0 ? `\n... and ${moreCount} more` : '';

  return `## RETRY ATTEMPT ${retryCount}: Additional Entities Needed

The previous extraction found ${currentEntityCount} entities, but some may be missing.

### Feedback from Previous Attempt
${feedback}

### Previously Extracted Entities
${entitiesList}${moreNote}

### IMPORTANT
- Look for entities that may have been overlooked
- Check for implicit entities (groups, places mentioned in passing)
- Ensure ALL named individuals are captured
- Verify relationships mention entities that should exist

---

`;
}
