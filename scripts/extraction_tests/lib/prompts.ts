/**
 * Shared prompts, schemas, and test documents for extraction tests
 */

import { z } from 'zod';

// ============================================================================
// Test Documents
// ============================================================================

export const TEST_DOCUMENTS = {
  iiJohn: `# II John

## Chapter 1

1. The elder to the elect lady and her children, whom I love in truth, and not only I, but also all who know the truth,
2. because of the truth that abides in us and will be with us forever :
3. Grace, mercy, and peace will be with us, from God the Father and from Jesus Christ the Father's Son, in truth and love.
4. I rejoiced greatly to find some of your children walking in the truth, just as we were commanded by the Father.
5. And now I ask you, dear lady — not as though I were writing you a new commandment, but the one we have had from the beginning — that we love one another.
6. And this is love, that we walk according to his commandments; this is the commandment, just as you have heard from the beginning, so that you should walk in it.
7. For many deceivers have gone out into the world, those who do not confess the coming of Jesus Christ in the flesh. Such a one is the deceiver and the antichrist.`,

  projectMeeting: `Project Status Meeting Notes - Q4 Planning

Attendees: John Smith (Project Manager), Sarah Chen (Tech Lead), Mike Johnson (Developer), Lisa Wong (QA Lead)

Discussion Points:

1. John opened the meeting discussing the timeline for the new authentication system. He emphasized the importance of meeting the December 15th deadline.

2. Sarah presented the technical architecture, proposing microservices with OAuth 2.0. She raised concerns about the legacy system integration.

3. Mike volunteered to handle the API development. He estimated 3 weeks for the core functionality.

4. Lisa outlined the testing strategy, including automated E2E tests. She requested additional test environments.

Action Items:
- John: Finalize budget by Friday
- Sarah: Complete architecture document
- Mike: Set up development environment
- Lisa: Prepare test plan

Next meeting scheduled for Monday.`,
} as const;

export type TestDocumentKey = keyof typeof TEST_DOCUMENTS;

// ============================================================================
// JSON Schemas (for JSON prompting)
// ============================================================================

export const JSON_SCHEMAS = {
  person: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', description: 'Full name of the person' },
      role: { type: 'string', description: 'Position, title, or role' },
      significance: { type: 'string', description: 'Why important' },
      source_references: {
        type: 'array',
        items: { type: 'string' },
        description: 'References where mentioned',
      },
    },
  },

  task: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', description: 'Task name or description' },
      assignee: { type: 'string', description: 'Person assigned' },
      deadline: { type: 'string', description: 'Due date if mentioned' },
      status: { type: 'string', description: 'Current status' },
    },
  },

  concept: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', description: 'Name of the concept' },
      definition: { type: 'string', description: 'What it means' },
      category: { type: 'string', description: 'Type or category' },
    },
  },
} as const;

export type SchemaKey = keyof typeof JSON_SCHEMAS;

// ============================================================================
// Zod Schemas (for withStructuredOutput)
// ============================================================================

export const ZOD_SCHEMAS = {
  entity: z.object({
    name: z.string().describe('Name of the entity'),
    type: z.string().describe('Type of entity'),
    description: z.string().optional().describe('Brief description'),
  }),

  person: z.object({
    name: z.string().describe('Full name of the person'),
    role: z.string().optional().describe('Position, title, or role'),
    significance: z.string().optional().describe('Why important'),
    source_references: z.array(z.string()).optional().describe('References'),
  }),

  extractionResponse: z.object({
    entities: z.array(
      z.object({
        name: z.string().describe('Name of the entity'),
        type: z.string().describe('Type of entity'),
        description: z.string().optional().describe('Brief description'),
      })
    ),
  }),

  personExtractionResponse: z.object({
    entities: z.array(
      z.object({
        name: z.string().describe('Full name of the person'),
        role: z.string().optional().describe('Position, title, or role'),
        significance: z.string().optional().describe('Why important'),
        source_references: z
          .array(z.string())
          .optional()
          .describe('References'),
      })
    ),
  }),
};

// ============================================================================
// Prompt Templates
// ============================================================================

export interface EntityTypeDefinition {
  name: string;
  description: string;
  properties?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description: string;
  }>;
}

/**
 * Generate extraction prompt for JSON prompting method
 */
export function createJsonExtractionPrompt(
  documentContent: string,
  entityType: EntityTypeDefinition,
  jsonSchema: object
): string {
  const propertyDocs = entityType.properties
    ?.map(
      (p) =>
        `  - ${p.name}${p.required ? ' (required)' : ''} [${p.type}]: ${
          p.description
        }`
    )
    .join('\n');

  return `You are an expert entity extraction system. Extract all ${
    entityType.name
  } entities from this document.

**Entity Type to Extract:** ${entityType.name}

**Schema Definition:**
${entityType.description}

Properties:
${propertyDocs || '  (No specific properties defined)'}

**Document Content:**

${documentContent}

**JSON Schema for Response:**
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

Return ONLY a valid JSON object matching this schema. No explanation or markdown.`;
}

/**
 * Generate extraction prompt for structured output method
 */
export function createStructuredExtractionPrompt(
  documentContent: string,
  entityTypes: string[]
): string {
  return `You are an expert entity extraction system. Extract all relevant entities from the following document.

Entity types to extract: ${entityTypes.join(', ')}

**Document Content:**

${documentContent}

Extract all entities you can find. For each entity, provide:
- name: The entity's name
- type: The type of entity (${entityTypes.join(' or ')})
- description: A brief description of why this entity is relevant

Be thorough and extract all entities mentioned or implied.`;
}

/**
 * Default entity type definitions
 */
export const ENTITY_TYPES: Record<string, EntityTypeDefinition> = {
  Person: {
    name: 'Person',
    description:
      'A human individual mentioned in the document, including their roles and significance.',
    properties: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Full name of the person',
      },
      {
        name: 'role',
        type: 'string',
        required: false,
        description: 'Position, title, or role',
      },
      {
        name: 'significance',
        type: 'string',
        required: false,
        description: 'Why this person is important',
      },
      {
        name: 'source_references',
        type: 'array',
        required: false,
        description: 'References where mentioned',
      },
    ],
  },

  Task: {
    name: 'Task',
    description:
      'An action item or task mentioned in the document with assignment and deadline.',
    properties: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Task name or description',
      },
      {
        name: 'assignee',
        type: 'string',
        required: false,
        description: 'Person assigned',
      },
      {
        name: 'deadline',
        type: 'string',
        required: false,
        description: 'Due date if mentioned',
      },
      {
        name: 'status',
        type: 'string',
        required: false,
        description: 'Current status',
      },
    ],
  },

  Concept: {
    name: 'Concept',
    description:
      'An abstract idea, principle, or theological concept mentioned in the document.',
    properties: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'Name of the concept',
      },
      {
        name: 'definition',
        type: 'string',
        required: false,
        description: 'What it means',
      },
      {
        name: 'category',
        type: 'string',
        required: false,
        description: 'Type or category',
      },
    ],
  },
};

/**
 * Create a wrapper response schema for entity array
 */
export function createResponseSchema(entitySchema: object): object {
  return {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: entitySchema,
      },
    },
    required: ['entities'],
  };
}
