import { Injectable } from '@nestjs/common';
import {
  RefinementContext,
  ObjectContext,
  RelationshipContext,
  ChunkContext,
  ObjectTypeSchema,
} from './object-refinement.types';

/**
 * Service for building prompts for object refinement LLM calls
 */
@Injectable()
export class RefinementPromptBuilder {
  /**
   * Build the system prompt for refinement chat
   */
  buildSystemPrompt(context: RefinementContext): string {
    const parts: string[] = [];

    // Introduction
    parts.push(`You are an expert knowledge graph analyst helping to refine and improve object data.
Your role is to analyze the object, its relationships, and source context to suggest improvements.

When suggesting changes, always:
1. Be specific about what to change and why
2. Reference source chunks when they support your suggestions
3. Consider the object type schema constraints
4. Preserve important existing data unless there's a clear reason to change it`);

    // Object context
    parts.push(this.formatObjectSection(context.object));

    // Schema section (if available)
    if (context.schema) {
      parts.push(this.formatSchemaSection(context.schema));
    }

    // Relationships section
    if (context.relationships.length > 0) {
      parts.push(this.formatRelationshipsSection(context.relationships));
    }

    // Source chunks section
    if (context.sourceChunks.length > 0) {
      parts.push(this.formatChunksSection(context.sourceChunks));
    }

    // Output format instructions
    parts.push(this.getOutputFormatInstructions());

    return parts.join('\n\n');
  }

  /**
   * Format the object details section
   */
  private formatObjectSection(object: ObjectContext): string {
    const name = (object.properties.name as string) || object.key || object.id;

    return `## Current Object

**Name:** ${name}
**Type:** ${object.type}
**Version:** ${object.version}

**Properties:**
\`\`\`json
${JSON.stringify(this.filterSystemProperties(object.properties), null, 2)}
\`\`\`

**Labels:** ${object.labels.length > 0 ? object.labels.join(', ') : 'None'}`;
  }

  /**
   * Format the schema section
   */
  private formatSchemaSection(schema: ObjectTypeSchema): string {
    let section = `## Object Type Schema: ${schema.type}`;

    if (schema.description) {
      section += `\n\n${schema.description}`;
    }

    if (Object.keys(schema.properties).length > 0) {
      section += `\n\n**Expected Properties:**\n`;
      for (const [key, prop] of Object.entries(schema.properties)) {
        const required = prop.required ? ' (required)' : '';
        const enumVals = prop.enum ? ` - values: ${prop.enum.join(', ')}` : '';
        section += `- **${key}**: ${prop.type}${required}${enumVals}`;
        if (prop.description) {
          section += ` - ${prop.description}`;
        }
        section += '\n';
      }
    }

    if (schema.relationshipTypes && schema.relationshipTypes.length > 0) {
      section += `\n**Valid Relationship Types:** ${schema.relationshipTypes.join(
        ', '
      )}`;
    }

    return section;
  }

  /**
   * Format the relationships section
   */
  private formatRelationshipsSection(
    relationships: RelationshipContext[]
  ): string {
    const outgoing = relationships.filter((r) => r.direction === 'outgoing');
    const incoming = relationships.filter((r) => r.direction === 'incoming');

    let section = `## Relationships (${relationships.length} total)`;

    if (outgoing.length > 0) {
      section += `\n\n### Outgoing Relationships (this object → others):\n`;
      for (const rel of outgoing) {
        const targetName =
          (rel.relatedObject.properties.name as string) ||
          rel.relatedObject.key ||
          rel.relatedObject.id;
        section += `\n**[${rel.type}]** → ${targetName} (${rel.relatedObject.type})`;
        section += `\n  ID: ${rel.id}`;
        section += `\n  Target: ${JSON.stringify(
          this.filterSystemProperties(rel.relatedObject.properties)
        )}`;
        if (Object.keys(rel.properties).length > 0) {
          section += `\n  Relationship Properties: ${JSON.stringify(
            rel.properties
          )}`;
        }
        section += '\n';
      }
    }

    if (incoming.length > 0) {
      section += `\n\n### Incoming Relationships (others → this object):\n`;
      for (const rel of incoming) {
        const sourceName =
          (rel.relatedObject.properties.name as string) ||
          rel.relatedObject.key ||
          rel.relatedObject.id;
        section += `\n**[${rel.type}]** ← ${sourceName} (${rel.relatedObject.type})`;
        section += `\n  ID: ${rel.id}`;
        section += `\n  Source: ${JSON.stringify(
          this.filterSystemProperties(rel.relatedObject.properties)
        )}`;
        if (Object.keys(rel.properties).length > 0) {
          section += `\n  Relationship Properties: ${JSON.stringify(
            rel.properties
          )}`;
        }
        section += '\n';
      }
    }

    return section;
  }

  /**
   * Format the source chunks section
   */
  private formatChunksSection(chunks: ChunkContext[]): string {
    let section = `## Source Context (${chunks.length} chunks from source documents)\n`;
    section += `Use this context to verify and improve the object data.\n`;

    // Group by document
    const byDocument = new Map<string, ChunkContext[]>();
    for (const chunk of chunks) {
      const existing = byDocument.get(chunk.documentId) || [];
      existing.push(chunk);
      byDocument.set(chunk.documentId, existing);
    }

    for (const [, docChunks] of byDocument) {
      const title = docChunks[0].documentTitle;
      section += `\n### Document: ${title}\n`;

      for (const chunk of docChunks) {
        section += `\n**[Chunk ${chunk.chunkIndex}]**\n`;
        section += chunk.text;
        section += '\n';
      }
    }

    return section;
  }

  /**
   * Get output format instructions
   */
  private getOutputFormatInstructions(): string {
    return `## Response Format

When you identify improvements, include structured suggestions in your response using the following JSON format wrapped in a code block:

\`\`\`suggestions
[
  {
    "type": "property_change",
    "propertyKey": "description",
    "oldValue": "current value",
    "newValue": "improved value",
    "explanation": "Why this change improves the data"
  },
  {
    "type": "relationship_add",
    "relationshipType": "RELATES_TO",
    "targetObjectId": "uuid-of-target",
    "targetObjectName": "Target Object Name",
    "targetObjectType": "ObjectType",
    "explanation": "Why this relationship should exist"
  },
  {
    "type": "relationship_remove",
    "relationshipId": "uuid-of-relationship",
    "relationshipType": "WRONG_RELATION",
    "targetObjectId": "uuid",
    "targetObjectName": "Object Name",
    "explanation": "Why this relationship should be removed"
  },
  {
    "type": "rename",
    "oldName": "Current Name",
    "newName": "Better Name",
    "explanation": "Why this name is more accurate"
  }
]
\`\`\`

Suggestion types:
- **property_change**: Modify a property value
- **relationship_add**: Add a new relationship to another object
- **relationship_remove**: Remove an existing relationship
- **rename**: Rename the object (changes properties.name)

Important:
- Only suggest changes that clearly improve data quality
- Reference specific source chunks when they support your suggestion
- If the data looks correct, say so - don't suggest unnecessary changes
- You can have a conversation first and suggest changes later when appropriate`;
  }

  /**
   * Filter out system/internal properties (all underscore-prefixed) for cleaner display.
   * This excludes: _schema_version, _extraction_*, _system_*, _refinement_*, _mergeHistory, etc.
   */
  private filterSystemProperties(
    properties: Record<string, unknown>
  ): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!key.startsWith('_')) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  /**
   * Build a follow-up prompt with conversation history
   */
  buildFollowUpPrompt(userMessage: string, previousContext: string): string {
    return `${previousContext}

User: ${userMessage}

Please respond to the user's question or request. If suggesting changes, use the structured format described above.`;
  }
}
