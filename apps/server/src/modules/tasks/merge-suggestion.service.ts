import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { MergeSuggestionPromptBuilder } from './merge-suggestion-prompt-builder.service';
import {
  MergeSuggestionContext,
  MergeObjectContext,
  MergeSuggestionResult,
  PropertyMergeSuggestion,
} from './merge-suggestion.types';

/**
 * Service for generating LLM-powered merge suggestions
 *
 * Uses the same LangGraph infrastructure as the refinement chat
 * to suggest how to merge two similar objects.
 */
@Injectable()
export class MergeSuggestionService {
  private readonly logger = new Logger(MergeSuggestionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly langGraphService: LangGraphService,
    private readonly promptBuilder: MergeSuggestionPromptBuilder
  ) {}

  /**
   * Generate merge suggestion for two objects
   *
   * @param sourceId - ID of the source object (will be merged into target)
   * @param targetId - ID of the target object (will receive merged properties)
   * @param similarityPercent - Similarity percentage between the objects
   */
  async generateMergeSuggestion(
    sourceId: string,
    targetId: string,
    similarityPercent: number
  ): Promise<MergeSuggestionResult> {
    this.logger.log(
      `Generating merge suggestion: source=${sourceId}, target=${targetId}, similarity=${similarityPercent}%`
    );

    // 1. Fetch both objects
    const [sourceObject, targetObject] = await Promise.all([
      this.fetchObject(sourceId),
      this.fetchObject(targetId),
    ]);

    if (!sourceObject) {
      throw new NotFoundException(`Source object not found: ${sourceId}`);
    }
    if (!targetObject) {
      throw new NotFoundException(`Target object not found: ${targetId}`);
    }

    // 2. Build context
    const context: MergeSuggestionContext = {
      sourceObject,
      targetObject,
      similarityPercent,
    };

    // 3. Build prompt
    const systemPrompt = this.promptBuilder.buildSystemPrompt(context);

    // 4. Call LLM
    const userMessage =
      'Please analyze these two objects and provide a merge suggestion with the combined/merged properties.';

    try {
      const response = await this.langGraphService.generateSimpleResponse(
        `${systemPrompt}\n\nUser: ${userMessage}`
      );

      // 5. Parse the response
      const result = this.parseResponse(response, sourceObject, targetObject);

      this.logger.log(
        `Generated merge suggestion with ${result.propertyMergeSuggestions.length} property suggestions, confidence=${result.confidence}`
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to generate merge suggestion', error);

      // Return a fallback suggestion using simple merge logic
      return this.generateFallbackSuggestion(sourceObject, targetObject);
    }
  }

  /**
   * Fetch object details from database
   */
  private async fetchObject(
    objectId: string
  ): Promise<MergeObjectContext | null> {
    const sql = `
      SELECT 
        id, type, key, properties, labels, version
      FROM kb.graph_objects
      WHERE id = $1
        AND deleted_at IS NULL
    `;

    const result = await this.db.query<{
      id: string;
      type: string;
      key: string | null;
      properties: Record<string, unknown>;
      labels: string[];
      version: number;
    }>(sql, [objectId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      type: row.type,
      key: row.key,
      properties: row.properties || {},
      labels: row.labels || [],
      version: row.version,
    };
  }

  /**
   * Parse LLM response into MergeSuggestionResult
   */
  private parseResponse(
    response: string,
    sourceObject: MergeObjectContext,
    targetObject: MergeObjectContext
  ): MergeSuggestionResult {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      this.logger.warn(
        'Could not find JSON block in LLM response, using fallback'
      );
      return this.generateFallbackSuggestion(sourceObject, targetObject);
    }

    try {
      const parsed = JSON.parse(jsonMatch[1].trim());

      // Validate and extract the response
      const suggestedProperties = parsed.suggestedProperties || {};
      const propertyMergeSuggestions: PropertyMergeSuggestion[] = (
        parsed.propertyMergeSuggestions || []
      ).map((s: any) => ({
        key: s.key || '',
        sourceValue: s.sourceValue,
        targetValue: s.targetValue,
        suggestedValue: s.suggestedValue,
        explanation: s.explanation || '',
        hasDifference: s.hasDifference ?? true,
        action: s.action || 'keep_target',
      }));

      // Sort by confidence - properties with clear actions first
      // 'keep_source' and 'keep_target' are more confident than 'combine' or 'new_value'
      propertyMergeSuggestions.sort((a, b) => {
        const confidenceOrder = {
          keep_target: 1,
          keep_source: 2,
          combine: 3,
          new_value: 4,
        };
        return (
          (confidenceOrder[a.action] || 5) - (confidenceOrder[b.action] || 5)
        );
      });

      return {
        suggestedProperties,
        propertyMergeSuggestions,
        overallExplanation: parsed.overallExplanation || '',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      };
    } catch (error) {
      this.logger.warn('Failed to parse LLM response JSON', error);
      return this.generateFallbackSuggestion(sourceObject, targetObject);
    }
  }

  /**
   * Generate a fallback suggestion using simple merge logic
   * Used when LLM call fails or returns invalid response
   */
  private generateFallbackSuggestion(
    sourceObject: MergeObjectContext,
    targetObject: MergeObjectContext
  ): MergeSuggestionResult {
    const sourceProps = this.filterSystemProperties(sourceObject.properties);
    const targetProps = this.filterSystemProperties(targetObject.properties);

    // Collect all property keys
    const allKeys = new Set<string>([
      ...Object.keys(sourceProps),
      ...Object.keys(targetProps),
    ]);

    const suggestedProperties: Record<string, unknown> = {};
    const propertyMergeSuggestions: PropertyMergeSuggestion[] = [];

    for (const key of allKeys) {
      const sourceValue = sourceProps[key];
      const targetValue = targetProps[key];
      const sourceHas = key in sourceProps;
      const targetHas = key in targetProps;

      let suggestedValue: unknown;
      let action: PropertyMergeSuggestion['action'];
      let explanation: string;
      let hasDifference = false;

      if (!sourceHas && targetHas) {
        // Only in target
        suggestedValue = targetValue;
        action = 'keep_target';
        explanation = 'Property only exists in target object';
      } else if (sourceHas && !targetHas) {
        // Only in source
        suggestedValue = sourceValue;
        action = 'keep_source';
        explanation = 'Property only exists in source object';
        hasDifference = true;
      } else if (JSON.stringify(sourceValue) === JSON.stringify(targetValue)) {
        // Same value
        suggestedValue = targetValue;
        action = 'keep_target';
        explanation = 'Values are identical';
      } else {
        // Different values - try to combine if strings, otherwise keep target
        hasDifference = true;
        if (
          typeof sourceValue === 'string' &&
          typeof targetValue === 'string'
        ) {
          // For text fields, check if one is longer/more complete
          if (sourceValue.length > targetValue.length * 1.5) {
            suggestedValue = sourceValue;
            action = 'keep_source';
            explanation = 'Source value is more complete';
          } else if (targetValue.length > sourceValue.length * 1.5) {
            suggestedValue = targetValue;
            action = 'keep_target';
            explanation = 'Target value is more complete';
          } else {
            // Similar length - keep target but note the difference
            suggestedValue = targetValue;
            action = 'keep_target';
            explanation =
              'Values differ; keeping target value (review recommended)';
          }
        } else {
          // Non-string values - keep target
          suggestedValue = targetValue;
          action = 'keep_target';
          explanation = 'Values differ; keeping target value';
        }
      }

      suggestedProperties[key] = suggestedValue;

      // Only add to suggestions if there's a meaningful difference
      if (hasDifference || action !== 'keep_target') {
        propertyMergeSuggestions.push({
          key,
          sourceValue,
          targetValue,
          suggestedValue,
          explanation,
          hasDifference,
          action,
        });
      }
    }

    // Sort suggestions: differences first, then by key
    propertyMergeSuggestions.sort((a, b) => {
      if (a.hasDifference !== b.hasDifference) {
        return a.hasDifference ? -1 : 1;
      }
      return a.key.localeCompare(b.key);
    });

    return {
      suggestedProperties,
      propertyMergeSuggestions,
      overallExplanation:
        'Fallback merge suggestion: Properties from both objects combined, with target values preferred when different.',
      confidence: 0.6,
      warnings: [
        'This is a fallback suggestion generated without AI assistance. Please review carefully.',
      ],
    };
  }

  /**
   * Filter out system/internal properties
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
}
