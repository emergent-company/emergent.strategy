import { Injectable } from '@nestjs/common';
import {
  MergeSuggestionContext,
  MergeObjectContext,
} from './merge-suggestion.types';

/**
 * Service for building prompts for merge suggestion LLM calls
 */
@Injectable()
export class MergeSuggestionPromptBuilder {
  /**
   * Build the system prompt for merge suggestion
   */
  buildSystemPrompt(context: MergeSuggestionContext): string {
    const parts: string[] = [];

    // Introduction
    parts.push(`You are an expert data merge assistant. Your task is to analyze two similar objects that have been identified as potential duplicates and suggest the best merged result.

When merging properties:
1. For text fields (descriptions, notes, summaries): Combine information from both sources to create a comprehensive merged value
2. For names/titles: Choose the most accurate, complete, or canonical version
3. For structured data (dates, numbers, enums): Choose the most accurate or recent value
4. For arrays/lists: Combine and deduplicate values
5. Preserve all unique information from both objects when possible
6. If one object has a value and the other doesn't, keep the existing value`);

    // Source object context
    parts.push(this.formatObjectSection(context.sourceObject, 'Source'));

    // Target object context
    parts.push(this.formatObjectSection(context.targetObject, 'Target'));

    // Similarity info
    parts.push(`## Similarity
These objects have been identified as ${context.similarityPercent}% similar based on their embeddings.`);

    // Output format instructions
    parts.push(this.getOutputFormatInstructions());

    return parts.join('\n\n');
  }

  /**
   * Format an object section
   */
  private formatObjectSection(
    object: MergeObjectContext,
    label: string
  ): string {
    const name = (object.properties.name as string) || object.key || object.id;

    return `## ${label} Object

**Name:** ${name}
**Type:** ${object.type}
**Version:** ${object.version}
**Labels:** ${object.labels.length > 0 ? object.labels.join(', ') : 'None'}

**Properties:**
\`\`\`json
${JSON.stringify(this.filterSystemProperties(object.properties), null, 2)}
\`\`\``;
  }

  /**
   * Filter out system/internal properties for cleaner display.
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
   * Get output format instructions
   */
  private getOutputFormatInstructions(): string {
    return `## Response Format

You MUST respond with a JSON object in the following format. Wrap your response in a code block:

\`\`\`json
{
  "suggestedProperties": {
    "name": "The suggested merged name",
    "description": "The suggested merged description combining both sources",
    ... other properties ...
  },
  "propertyMergeSuggestions": [
    {
      "key": "name",
      "sourceValue": "value from source",
      "targetValue": "value from target",
      "suggestedValue": "your suggested merged value",
      "explanation": "Why you chose this value",
      "hasDifference": true,
      "action": "keep_target"
    },
    {
      "key": "description",
      "sourceValue": "source description text",
      "targetValue": "target description text",
      "suggestedValue": "Combined description incorporating both sources",
      "explanation": "Combined descriptions to preserve all information",
      "hasDifference": true,
      "action": "combine"
    }
  ],
  "overallExplanation": "Brief explanation of the overall merge strategy used",
  "confidence": 0.85,
  "warnings": ["Any concerns about the merge, e.g., 'Names are quite different, verify these are actually duplicates'"]
}
\`\`\`

**Action types:**
- \`keep_source\`: Use the source object's value
- \`keep_target\`: Use the target object's value  
- \`combine\`: Combine text/content from both (for descriptions, notes, etc.)
- \`new_value\`: Create a new synthesized value different from both

**Important:**
- Include ALL properties from both objects in suggestedProperties
- For every property with differing values, include an entry in propertyMergeSuggestions
- **Order propertyMergeSuggestions by confidence/importance**: Start with properties where you are most confident about the merge (close to 100% certainty), then list properties with lower confidence scores last
- confidence should be between 0 and 1
- Only include warnings if there are genuine concerns
- Exclude system properties (those starting with _)`;
  }
}
