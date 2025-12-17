/**
 * AI Prompts Configuration
 *
 * Defines all prompts that can be managed via the AI Prompts settings page.
 * Each prompt has a Langfuse name and a default/fallback value.
 */

export interface PromptDefinition {
  /** Unique identifier used in Langfuse and routing */
  id: string;
  /** Display name for the UI */
  name: string;
  /** Short description of what this prompt does */
  description: string;
  /** Category for grouping in the sidebar */
  category: 'chat' | 'extraction' | 'studio' | 'agents';
  /** Icon for the sidebar (iconify format) */
  icon: string;
  /** Default/fallback prompt content */
  defaultValue: string;
  /** Optional placeholders that must be present in the prompt */
  requiredPlaceholders?: string[];
  /** Whether this is a chat prompt (array of messages) vs text prompt */
  type: 'text' | 'chat';
}

// ============================================================================
// Default Prompt Values
// ============================================================================

const CHAT_SYSTEM_DEFAULT = `You are a helpful assistant. Answer the user question using only the provided CONTEXT. Cite sources inline using bracketed numbers like [1], [2], matching the provided context order. If the answer can't be derived from the CONTEXT, say you don't know rather than hallucinating.`;

const CHAT_USER_TEMPLATE_DEFAULT = `Question:
{question}

CONTEXT (citations in order):
{context}

Provide a concise, well-structured answer.`;

const EXTRACTION_BASE_DEFAULT = `You are an expert entity extraction system. Your task is to analyze the provided document and extract structured entities according to the schema definitions that follow.

Extract entities that match the defined types. For each entity:
- Provide a clear, descriptive name
- Include all relevant properties from the schema
- Assign appropriate confidence scores (0.0-1.0)
- Identify relationships between entities

Return your response as a valid JSON array matching the expected schema format.`;

const TEMPLATE_STUDIO_DEFAULT = `You are an expert JSON Schema designer helping users create and refine template packs for a knowledge graph system.

## Your Role
You help users define object types and relationship types using JSON Schema. Each type has:
- A JSON Schema defining its properties
- UI configuration (icon, color)
- Optional extraction prompts for AI-assisted data extraction

## JSON Schema Best Practices
When creating schemas:
1. Use descriptive property names in camelCase
2. Add "description" fields to explain the purpose of properties
3. Use appropriate types: string, number, integer, boolean, array, object
4. Use "enum" for fixed value sets
5. Mark required properties appropriately
6. Use "format" for special strings (date, date-time, email, uri)
7. Keep schemas focused - one concept per object type
8. Add "examples" arrays to properties to illustrate expected values

## Response Format
When suggesting schema changes, include structured suggestions in your response using the suggestions code block format.

## Guidelines
1. Start by understanding what domain the user wants to model
2. Suggest object types that represent key entities in their domain
3. Suggest relationship types that capture how entities relate
4. Be specific about property types and constraints
5. Explain why each suggestion improves the template pack
6. If the user's request is unclear, ask clarifying questions first`;

const ENTITY_EXTRACTOR_JSON_DEFAULT = `You are an expert entity extraction system. Extract entities from the following document according to the provided schema definitions.

## Document
{{documentText}}

## Entity Types to Extract
{{schemaDefinitions}}

## Allowed Types
Only extract entities of these types: {{allowedTypes}}

## Instructions
1. Identify all entities in the document matching the allowed types
2. For each entity, provide:
   - name: A clear, descriptive name
   - type: One of the allowed types
   - properties: All relevant properties from the schema
   - confidence: Score from 0.0-1.0
3. Return a JSON array of entities

## Output Format
Return ONLY valid JSON array, no additional text.`;

const ENTITY_EXTRACTOR_FN_DEFAULT = `Extract entities from the provided document according to the schema definitions.

Document to analyze:
{{documentText}}

Entity type schemas:
{{schemaDefinitions}}

Only extract these types: {{allowedTypes}}

For each entity found, call the extract_entity function with the entity details.`;

const RELATIONSHIP_BUILDER_JSON_DEFAULT = `You are an expert relationship builder. Analyze the extracted entities and identify relationships between them based on the document context.

## Document Context
{{documentText}}

## Extracted Entities
{{entities}}

## Relationship Types
{{relationshipTypes}}

## Instructions
1. Analyze the entities and document to find relationships
2. For each relationship, identify:
   - sourceEntityId: ID of the source entity
   - targetEntityId: ID of the target entity
   - type: Relationship type from the allowed types
   - confidence: Score from 0.0-1.0
   - properties: Any additional relationship properties

## Output Format
Return ONLY valid JSON array of relationships, no additional text.`;

const RELATIONSHIP_BUILDER_FN_DEFAULT = `Analyze the extracted entities and identify relationships between them.

Document context:
{{documentText}}

Entities to analyze:
{{entities}}

Relationship types to use:
{{relationshipTypes}}

For each relationship found, call the create_relationship function.`;

const IDENTITY_RESOLVER_DEFAULT = `You are an entity identity resolver. Analyze the provided entities and identify which ones refer to the same real-world entity.

## Entities to Analyze
{{entities}}

## Existing Entities (if any)
{{existingEntities}}

## Instructions
1. Compare entities by name, properties, and context
2. Group entities that refer to the same real-world entity
3. For each group, identify the canonical representation
4. Return merge suggestions with confidence scores

## Output Format
Return JSON with merge groups and confidence scores.`;

const QUALITY_AUDITOR_DEFAULT = `You are a quality auditor for knowledge graph extraction. Review the extracted entities and relationships for accuracy and completeness.

## Original Document
{{documentText}}

## Extracted Entities
{{entities}}

## Extracted Relationships
{{relationships}}

## Instructions
1. Verify entity extractions match the document
2. Check relationships are valid and supported by text
3. Identify missing entities or relationships
4. Flag potential errors or inconsistencies
5. Provide an overall quality score

## Output Format
Return JSON with quality assessment and recommendations.`;

// ============================================================================
// Prompt Definitions
// ============================================================================

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
  // Chat prompts
  {
    id: 'chat-system',
    name: 'Chat System Prompt',
    description:
      'System instructions for the chat assistant when answering questions with retrieved context.',
    category: 'chat',
    icon: 'lucide--shield',
    defaultValue: CHAT_SYSTEM_DEFAULT,
    type: 'text',
  },
  {
    id: 'chat-user-template',
    name: 'Chat User Template',
    description:
      'Template for formatting user questions with retrieved context. Use {question} and {context} placeholders.',
    category: 'chat',
    icon: 'lucide--user',
    defaultValue: CHAT_USER_TEMPLATE_DEFAULT,
    requiredPlaceholders: ['{question}', '{context}'],
    type: 'text',
  },

  // Extraction prompts
  {
    id: 'extraction-base',
    name: 'Extraction Base Prompt',
    description:
      'Base instructions for entity extraction. Schema-specific details are appended automatically.',
    category: 'extraction',
    icon: 'lucide--scan-search',
    defaultValue: EXTRACTION_BASE_DEFAULT,
    type: 'text',
  },
  {
    id: 'entity-extractor-json',
    name: 'Entity Extractor (JSON)',
    description:
      'Entity extraction prompt for JSON freeform method. Uses {{documentText}}, {{schemaDefinitions}}, {{allowedTypes}}.',
    category: 'extraction',
    icon: 'lucide--file-json',
    defaultValue: ENTITY_EXTRACTOR_JSON_DEFAULT,
    type: 'text',
  },
  {
    id: 'entity-extractor-fn',
    name: 'Entity Extractor (Function)',
    description:
      'Entity extraction prompt for function calling method. Uses {{documentText}}, {{schemaDefinitions}}, {{allowedTypes}}.',
    category: 'extraction',
    icon: 'lucide--function-square',
    defaultValue: ENTITY_EXTRACTOR_FN_DEFAULT,
    type: 'text',
  },
  {
    id: 'relationship-builder-json',
    name: 'Relationship Builder (JSON)',
    description:
      'Relationship building prompt for JSON method. Uses {{documentText}}, {{entities}}, {{relationshipTypes}}.',
    category: 'extraction',
    icon: 'lucide--git-branch',
    defaultValue: RELATIONSHIP_BUILDER_JSON_DEFAULT,
    type: 'text',
  },
  {
    id: 'relationship-builder-fn',
    name: 'Relationship Builder (Function)',
    description:
      'Relationship building prompt for function calling method. Uses {{documentText}}, {{entities}}, {{relationshipTypes}}.',
    category: 'extraction',
    icon: 'lucide--git-merge',
    defaultValue: RELATIONSHIP_BUILDER_FN_DEFAULT,
    type: 'text',
  },
  {
    id: 'identity-resolver',
    name: 'Identity Resolver',
    description:
      'Prompt for entity deduplication and identity resolution. Uses {{entities}}, {{existingEntities}}.',
    category: 'extraction',
    icon: 'lucide--fingerprint',
    defaultValue: IDENTITY_RESOLVER_DEFAULT,
    type: 'text',
  },
  {
    id: 'quality-auditor',
    name: 'Quality Auditor',
    description:
      'Prompt for auditing extraction quality. Uses {{documentText}}, {{entities}}, {{relationships}}.',
    category: 'extraction',
    icon: 'lucide--shield-check',
    defaultValue: QUALITY_AUDITOR_DEFAULT,
    type: 'text',
  },

  // Studio prompts
  {
    id: 'template-studio-system',
    name: 'Template Studio System',
    description:
      'System prompt for the Template Pack Studio AI assistant that helps design schemas.',
    category: 'studio',
    icon: 'lucide--layout-template',
    defaultValue: TEMPLATE_STUDIO_DEFAULT,
    type: 'text',
  },
];

// Group prompts by category for sidebar display
export const PROMPT_CATEGORIES = [
  {
    id: 'chat',
    name: 'Chat',
    icon: 'lucide--message-square',
  },
  {
    id: 'extraction',
    name: 'Extraction',
    icon: 'lucide--scan-search',
  },
  {
    id: 'studio',
    name: 'Studio',
    icon: 'lucide--layout-template',
  },
  {
    id: 'agents',
    name: 'Agents',
    icon: 'lucide--bot',
  },
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number]['id'];

// Helper to get prompt by ID
export function getPromptDefinition(id: string): PromptDefinition | undefined {
  return PROMPT_DEFINITIONS.find((p) => p.id === id);
}

// Helper to get prompts by category
export function getPromptsByCategory(
  category: PromptCategory
): PromptDefinition[] {
  return PROMPT_DEFINITIONS.filter((p) => p.category === category);
}
