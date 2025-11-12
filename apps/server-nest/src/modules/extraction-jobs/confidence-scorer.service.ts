import { Injectable, Logger } from '@nestjs/common';
import { ExtractedEntity } from './llm/llm-provider.interface';

/**
 * Confidence Scorer Service
 *
 * Calculates multi-factor confidence scores for extracted entities.
 * Considers:
 * - LLM-provided confidence (if available)
 * - Schema completeness (required fields populated)
 * - Evidence quality (description detail, property richness)
 * - Property value quality (length, format, specificity)
 *
 * Score Range: 0.0 - 1.0
 * - 0.0-0.3: Low confidence (likely reject)
 * - 0.3-0.7: Medium confidence (needs review)
 * - 0.7-1.0: High confidence (auto-create)
 */
@Injectable()
export class ConfidenceScorerService {
  private readonly logger = new Logger(ConfidenceScorerService.name);

  // Scoring weights (must sum to 1.0)
  private readonly WEIGHTS = {
    llmConfidence: 0.35, // LLM's own confidence
    schemaCompleteness: 0.25, // Required fields present
    evidenceQuality: 0.2, // Description and property richness
    propertyQuality: 0.2, // Property value quality
  };

  // Quality thresholds
  private readonly MIN_DESCRIPTION_LENGTH = 20;
  private readonly GOOD_DESCRIPTION_LENGTH = 100;
  private readonly MIN_PROPERTY_COUNT = 3;
  private readonly GOOD_PROPERTY_COUNT = 8;

  /**
   * Calculate confidence score for an extracted entity
   *
   * @param entity - The extracted entity
   * @param allowedTypes - Optional list of allowed types (for validation)
   * @returns Confidence score 0.0-1.0
   */
  calculateConfidence(
    entity: ExtractedEntity,
    allowedTypes?: string[]
  ): number {
    try {
      const llmScore = this.scoreLLMConfidence(entity);
      const schemaScore = this.scoreSchemaCompleteness(entity, allowedTypes);
      const evidenceScore = this.scoreEvidenceQuality(entity);
      const propertyScore = this.scorePropertyQuality(entity);

      const totalScore =
        llmScore * this.WEIGHTS.llmConfidence +
        schemaScore * this.WEIGHTS.schemaCompleteness +
        evidenceScore * this.WEIGHTS.evidenceQuality +
        propertyScore * this.WEIGHTS.propertyQuality;

      // Clamp to [0, 1]
      const finalScore = Math.max(0, Math.min(1, totalScore));

      this.logger.debug(
        `Confidence for ${entity.name}: ${finalScore.toFixed(3)} ` +
          `(LLM: ${llmScore.toFixed(2)}, Schema: ${schemaScore.toFixed(2)}, ` +
          `Evidence: ${evidenceScore.toFixed(
            2
          )}, Property: ${propertyScore.toFixed(2)})`
      );

      return finalScore;
    } catch (error) {
      this.logger.warn(
        `Failed to calculate confidence for ${entity.name}`,
        error
      );
      // Return conservative low score on error
      return 0.3;
    }
  }

  /**
   * Score based on LLM-provided confidence
   *
   * @param entity - The extracted entity
   * @returns Score 0.0-1.0
   */
  private scoreLLMConfidence(entity: ExtractedEntity): number {
    // If LLM provides confidence, use it directly
    if (typeof entity.confidence === 'number') {
      return Math.max(0, Math.min(1, entity.confidence));
    }

    // No LLM confidence provided - neutral score
    return 0.5;
  }

  /**
   * Score based on schema completeness (required fields)
   *
   * @param entity - The extracted entity
   * @param allowedTypes - Optional list of allowed types
   * @returns Score 0.0-1.0
   */
  private scoreSchemaCompleteness(
    entity: ExtractedEntity,
    allowedTypes?: string[]
  ): number {
    let score = 1.0;

    // Required fields check
    if (!entity.type_name || entity.type_name.trim().length === 0) {
      score -= 0.4; // Type is critical
    }

    if (!entity.name || entity.name.trim().length === 0) {
      score -= 0.4; // Name is critical
    }

    if (!entity.description || entity.description.trim().length === 0) {
      score -= 0.2; // Description is important but not critical
    }

    // Type validation (if allowed types specified)
    if (allowedTypes && allowedTypes.length > 0) {
      const typeValid = allowedTypes.includes(entity.type_name);
      if (!typeValid) {
        score -= 0.3; // Type mismatch is significant
      }
    }

    return Math.max(0, score);
  }

  /**
   * Score based on evidence quality (description, property richness)
   *
   * @param entity - The extracted entity
   * @returns Score 0.0-1.0
   */
  private scoreEvidenceQuality(entity: ExtractedEntity): number {
    let score = 0;

    // Description quality (0-0.5 points)
    const descLength = entity.description?.trim().length || 0;
    if (descLength >= this.GOOD_DESCRIPTION_LENGTH) {
      score += 0.5;
    } else if (descLength >= this.MIN_DESCRIPTION_LENGTH) {
      // Linear interpolation between MIN and GOOD
      const ratio =
        (descLength - this.MIN_DESCRIPTION_LENGTH) /
        (this.GOOD_DESCRIPTION_LENGTH - this.MIN_DESCRIPTION_LENGTH);
      score += 0.25 + ratio * 0.25;
    }

    // Property count (0-0.5 points)
    const propertyCount = entity.properties
      ? Object.keys(entity.properties).length
      : 0;
    if (propertyCount >= this.GOOD_PROPERTY_COUNT) {
      score += 0.5;
    } else if (propertyCount >= this.MIN_PROPERTY_COUNT) {
      // Linear interpolation
      const ratio =
        (propertyCount - this.MIN_PROPERTY_COUNT) /
        (this.GOOD_PROPERTY_COUNT - this.MIN_PROPERTY_COUNT);
      score += 0.25 + ratio * 0.25;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Score based on property value quality
   *
   * @param entity - The extracted entity
   * @returns Score 0.0-1.0
   */
  private scorePropertyQuality(entity: ExtractedEntity): number {
    if (!entity.properties || Object.keys(entity.properties).length === 0) {
      return 0.3; // Some baseline quality if no properties
    }

    let totalScore = 0;
    let count = 0;

    for (const [key, value] of Object.entries(entity.properties)) {
      count++;

      // Skip null/undefined
      if (value === null || value === undefined) {
        totalScore += 0.2;
        continue;
      }

      // Check value type and quality
      if (typeof value === 'string') {
        const strValue = value.trim();
        if (strValue.length === 0) {
          totalScore += 0.2; // Empty string
        } else if (strValue.length < 3) {
          totalScore += 0.4; // Very short (e.g., "N/A")
        } else if (strValue.length < 20) {
          totalScore += 0.7; // Short but reasonable
        } else {
          totalScore += 1.0; // Good detail
        }
      } else if (typeof value === 'number') {
        // Numbers are generally good
        totalScore += 0.9;
      } else if (typeof value === 'boolean') {
        // Booleans are specific
        totalScore += 0.8;
      } else if (Array.isArray(value)) {
        // Arrays - check length
        totalScore += value.length > 0 ? 0.9 : 0.3;
      } else if (typeof value === 'object') {
        // Objects - check if non-empty
        totalScore += Object.keys(value).length > 0 ? 0.9 : 0.3;
      } else {
        // Other types - neutral
        totalScore += 0.5;
      }
    }

    return count > 0 ? totalScore / count : 0.5;
  }

  /**
   * Get detailed confidence breakdown for debugging
   *
   * @param entity - The extracted entity
   * @param allowedTypes - Optional list of allowed types
   * @returns Breakdown object with component scores
   */
  getConfidenceBreakdown(
    entity: ExtractedEntity,
    allowedTypes?: string[]
  ): {
    total: number;
    components: {
      llmConfidence: number;
      schemaCompleteness: number;
      evidenceQuality: number;
      propertyQuality: number;
    };
    weights: {
      llmConfidence: number;
      schemaCompleteness: number;
      evidenceQuality: number;
      propertyQuality: number;
    };
  } {
    const llmScore = this.scoreLLMConfidence(entity);
    const schemaScore = this.scoreSchemaCompleteness(entity, allowedTypes);
    const evidenceScore = this.scoreEvidenceQuality(entity);
    const propertyScore = this.scorePropertyQuality(entity);

    const totalScore =
      llmScore * this.WEIGHTS.llmConfidence +
      schemaScore * this.WEIGHTS.schemaCompleteness +
      evidenceScore * this.WEIGHTS.evidenceQuality +
      propertyScore * this.WEIGHTS.propertyQuality;

    return {
      total: Math.max(0, Math.min(1, totalScore)),
      components: {
        llmConfidence: llmScore,
        schemaCompleteness: schemaScore,
        evidenceQuality: evidenceScore,
        propertyQuality: propertyScore,
      },
      weights: this.WEIGHTS,
    };
  }
}
