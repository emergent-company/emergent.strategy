/**
 * Verification Service - Cascade Orchestrator
 *
 * Orchestrates the 3-tier verification cascade:
 * - Tier 1: Exact/Fuzzy Match (Levenshtein) - Fast, cheap, good for names
 * - Tier 2: NLI Entailment (DeBERTa) - Semantic verification
 * - Tier 3: LLM Judge (Gemini) - Final arbiter for uncertain cases
 *
 * The cascade stops as soon as a tier produces a confident result.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ExactMatchService } from './exact-match.service';
import { NLIVerifierService } from './nli-verifier.service';
import { LLMJudgeService } from './llm-judge.service';
import type {
  VerificationConfig,
  EntityVerificationResult,
  PropertyVerificationResult,
  EntityToVerify,
  BatchVerificationRequest,
  BatchVerificationResponse,
  VerificationTier,
  VerificationHealthResult,
  NLIVerificationResult,
  DescriptionVerificationResult,
  RelationshipVerificationResult,
} from './types';
import { DEFAULT_VERIFICATION_CONFIG } from './types';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @Inject(ExactMatchService)
    private readonly exactMatch: ExactMatchService,
    @Inject(NLIVerifierService)
    private readonly nliVerifier: NLIVerifierService,
    @Inject(LLMJudgeService)
    private readonly llmJudge: LLMJudgeService
  ) {}

  /**
   * Check health of all verification tiers
   */
  async checkHealth(
    config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG
  ): Promise<VerificationHealthResult> {
    const tier1Available = true; // Exact match is always available
    const tier2Available = await this.nliVerifier.checkAvailability(config);
    const tier3Available = this.llmJudge.isAvailable();

    const availableCount = [
      tier1Available,
      tier2Available,
      tier3Available,
    ].filter(Boolean).length;

    let message: string;
    if (availableCount === 3) {
      message = 'All verification tiers available';
    } else if (availableCount === 2) {
      message = tier2Available
        ? 'Tier 3 (LLM Judge) unavailable - will use Tier 1 + 2'
        : 'Tier 2 (NLI) unavailable - will use Tier 1 + 3';
    } else if (availableCount === 1) {
      message = 'Only Tier 1 (exact match) available - limited verification';
    } else {
      message = 'No verification tiers available';
    }

    return { tier1Available, tier2Available, tier3Available, message };
  }

  /**
   * Verify a single entity through the cascade
   */
  async verifyEntity(
    entity: EntityToVerify,
    sourceText: string,
    config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG
  ): Promise<EntityVerificationResult> {
    const startTime = Date.now();

    // Initialize result structure
    const result: EntityVerificationResult = {
      entityId: entity.id,
      entityName: entity.name,
      entityType: entity.type,
      entityVerified: false,
      entityStatus: 'uncertain',
      entityVerificationTier: 1,
      entityConfidence: 0,
      properties: [],
      overallConfidence: 0,
    };

    if (!config.enabled) {
      result.entityStatus = 'skipped';
      result.entityReason = 'Verification disabled';
      return result;
    }

    // Tier 1: Exact/Fuzzy Match
    const tier1Result = this.exactMatch.verifyEntityName(
      entity.name,
      sourceText,
      {
        exactMatchThreshold: config.exactMatchThreshold,
      }
    );

    if (tier1Result.passed) {
      result.entityVerified = true;
      result.entityStatus = 'verified';
      result.entityVerificationTier = 1;
      result.entityConfidence = tier1Result.similarity;
      result.entityReason = `Exact match: ${
        tier1Result.matchedText || entity.name
      } (${(tier1Result.similarity * 100).toFixed(1)}%)`;
    } else {
      // Tier 2: NLI Verification
      const nliAvailable = await this.nliVerifier.checkAvailability(config);

      if (nliAvailable) {
        const tier2Result = await this.nliVerifier.verifyEntity(
          entity.name,
          entity.type,
          sourceText,
          config
        );

        if (tier2Result.passed) {
          result.entityVerified = true;
          result.entityStatus = 'verified';
          result.entityVerificationTier = 2;
          result.entityConfidence = tier2Result.prediction.entailment;
          result.entityReason = `NLI verified (entailment: ${(
            tier2Result.prediction.entailment * 100
          ).toFixed(1)}%)`;
        } else if (tier2Result.rejected) {
          result.entityVerified = false;
          result.entityStatus = 'rejected';
          result.entityVerificationTier = 2;
          result.entityConfidence = 1 - tier2Result.prediction.contradiction;
          result.entityReason = `NLI rejected (contradiction: ${(
            tier2Result.prediction.contradiction * 100
          ).toFixed(1)}%)`;
        } else if (tier2Result.uncertain || !tier2Result.available) {
          // Tier 3: LLM Judge
          await this.escalateToTier3Entity(
            entity,
            sourceText,
            config,
            result,
            tier2Result
          );
        }
      } else {
        // NLI unavailable, go directly to Tier 3
        await this.escalateToTier3Entity(entity, sourceText, config, result);
      }
    }

    // Verify properties if entity was verified and properties exist
    if (
      result.entityVerified &&
      config.verifyProperties &&
      entity.properties &&
      Object.keys(entity.properties).length > 0
    ) {
      result.properties = await this.verifyProperties(
        entity,
        sourceText,
        config
      );
    }

    // Calculate overall confidence
    result.overallConfidence = this.calculateOverallConfidence(result);

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      `Verified entity "${entity.name}" in ${elapsed}ms: ${
        result.entityStatus
      } (Tier ${result.entityVerificationTier}, confidence: ${(
        result.overallConfidence * 100
      ).toFixed(1)}%)`
    );

    return result;
  }

  /**
   * Escalate entity verification to Tier 3 (LLM Judge)
   */
  private async escalateToTier3Entity(
    entity: EntityToVerify,
    sourceText: string,
    config: VerificationConfig,
    result: EntityVerificationResult,
    tier2Result?: NLIVerificationResult
  ): Promise<void> {
    if (!this.llmJudge.isAvailable()) {
      // No LLM available, use best available result
      if (tier2Result && !tier2Result.uncertain) {
        result.entityVerified = tier2Result.passed;
        result.entityStatus = tier2Result.passed ? 'verified' : 'uncertain';
        result.entityVerificationTier = 2;
        result.entityConfidence = tier2Result.prediction.entailment;
        result.entityReason = 'NLI result used (LLM unavailable)';
      } else {
        result.entityStatus = 'uncertain';
        result.entityReason =
          'Verification inconclusive (NLI uncertain, LLM unavailable)';
      }
      return;
    }

    const tier3Result = await this.llmJudge.verifyEntity(
      entity.name,
      entity.type,
      sourceText,
      config
    );

    result.entityVerified = tier3Result.verified;
    result.entityStatus = tier3Result.verified
      ? 'verified'
      : tier3Result.confidence < 0.3
      ? 'rejected'
      : 'uncertain';
    result.entityVerificationTier = 3;
    result.entityConfidence = tier3Result.confidence;
    result.entityReason = `LLM Judge: ${tier3Result.explanation}`;
  }

  /**
   * Verify properties of an entity
   */
  private async verifyProperties(
    entity: EntityToVerify,
    sourceText: string,
    config: VerificationConfig
  ): Promise<PropertyVerificationResult[]> {
    if (!entity.properties) return [];

    const propertyEntries = Object.entries(entity.properties)
      .filter(([, value]) => value !== null && value !== undefined)
      .slice(0, config.maxPropertiesPerEntity);

    const results: PropertyVerificationResult[] = [];

    for (const [propertyName, propertyValue] of propertyEntries) {
      const valueStr = String(propertyValue);
      const propResult = await this.verifyProperty(
        entity.name,
        propertyName,
        valueStr,
        sourceText,
        config
      );
      results.push(propResult);
    }

    return results;
  }

  /**
   * Verify a single property through the cascade
   */
  private async verifyProperty(
    entityName: string,
    propertyName: string,
    propertyValue: string,
    sourceText: string,
    config: VerificationConfig
  ): Promise<PropertyVerificationResult> {
    const result: PropertyVerificationResult = {
      propertyName,
      propertyValue,
      verified: false,
      status: 'uncertain',
      verificationTier: 1,
      confidence: 0,
    };

    // Tier 1: Exact match for property value
    const tier1Result = this.exactMatch.verifyPropertyValue(
      propertyValue,
      sourceText,
      {
        exactMatchThreshold: config.exactMatchThreshold,
      }
    );

    if (tier1Result.passed) {
      result.verified = true;
      result.status = 'verified';
      result.verificationTier = 1;
      result.confidence = tier1Result.similarity;
      result.reason = `Exact match found (${(
        tier1Result.similarity * 100
      ).toFixed(1)}%)`;
      return result;
    }

    // Tier 2: NLI Verification
    const nliAvailable = await this.nliVerifier.checkAvailability(config);

    if (nliAvailable) {
      const tier2Result = await this.nliVerifier.verifyProperty(
        entityName,
        propertyName,
        propertyValue,
        sourceText,
        config
      );

      if (tier2Result.passed) {
        result.verified = true;
        result.status = 'verified';
        result.verificationTier = 2;
        result.confidence = tier2Result.prediction.entailment;
        result.reason = `NLI verified (${(
          tier2Result.prediction.entailment * 100
        ).toFixed(1)}%)`;
        return result;
      }

      if (tier2Result.rejected) {
        result.verified = false;
        result.status = 'rejected';
        result.verificationTier = 2;
        result.confidence = 1 - tier2Result.prediction.contradiction;
        result.reason = `NLI rejected (contradiction: ${(
          tier2Result.prediction.contradiction * 100
        ).toFixed(1)}%)`;
        return result;
      }

      // Uncertain - escalate to Tier 3
    }

    // Tier 3: LLM Judge
    if (this.llmJudge.isAvailable()) {
      const tier3Result = await this.llmJudge.verifyProperty(
        entityName,
        propertyName,
        propertyValue,
        sourceText,
        config
      );

      result.verified = tier3Result.verified;
      result.status = tier3Result.verified
        ? 'verified'
        : tier3Result.confidence < 0.3
        ? 'rejected'
        : 'uncertain';
      result.verificationTier = 3;
      result.confidence = tier3Result.confidence;
      result.reason = `LLM Judge: ${tier3Result.explanation}`;
    } else {
      result.status = 'uncertain';
      result.reason = 'Unable to verify (LLM unavailable)';
    }

    return result;
  }

  /**
   * Calculate overall confidence for an entity
   */
  private calculateOverallConfidence(result: EntityVerificationResult): number {
    const confidences = [result.entityConfidence];

    for (const prop of result.properties) {
      confidences.push(prop.confidence);
    }

    // Use weighted average with entity having more weight
    const entityWeight = 2;
    const totalWeight = entityWeight + result.properties.length;

    const weightedSum =
      result.entityConfidence * entityWeight +
      result.properties.reduce((sum, p) => sum + p.confidence, 0);

    return weightedSum / totalWeight;
  }

  /**
   * Batch verify multiple entities
   */
  async verifyBatch(
    request: BatchVerificationRequest
  ): Promise<BatchVerificationResponse> {
    const startTime = Date.now();
    const config = { ...DEFAULT_VERIFICATION_CONFIG, ...request.config };

    const results: EntityVerificationResult[] = [];
    const tierUsage: Record<VerificationTier, number> = { 1: 0, 2: 0, 3: 0 };

    for (const entity of request.entities) {
      const result = await this.verifyEntity(
        entity,
        request.sourceText,
        config
      );
      results.push(result);
      tierUsage[result.entityVerificationTier]++;
    }

    // Calculate summary
    const verified = results.filter(
      (r) => r.entityStatus === 'verified'
    ).length;
    const rejected = results.filter(
      (r) => r.entityStatus === 'rejected'
    ).length;
    const uncertain = results.filter(
      (r) => r.entityStatus === 'uncertain'
    ).length;
    const averageConfidence =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.overallConfidence, 0) /
          results.length
        : 0;

    const processingTimeMs = Date.now() - startTime;

    this.logger.log(
      `Batch verified ${request.entities.length} entities in ${processingTimeMs}ms: ` +
        `${verified} verified, ${rejected} rejected, ${uncertain} uncertain ` +
        `(Tier usage: T1=${tierUsage[1]}, T2=${tierUsage[2]}, T3=${tierUsage[3]})`
    );

    return {
      results,
      summary: {
        total: request.entities.length,
        verified,
        rejected,
        uncertain,
        averageConfidence,
        tierUsage,
      },
      processingTimeMs,
    };
  }

  /**
   * Quick verify - just check if entity name exists in source
   * Useful for pre-filtering before full verification
   */
  quickVerify(
    entityName: string,
    sourceText: string,
    threshold: number = 0.8
  ): boolean {
    const result = this.exactMatch.verifyEntityName(entityName, sourceText, {
      exactMatchThreshold: threshold,
    });
    return result.passed;
  }

  /**
   * Get verification stats for monitoring
   */
  getVerificationStats(): { tier1: string; tier2: string; tier3: string } {
    return {
      tier1: 'Exact Match - Always available',
      tier2: 'NLI Service - Check with checkHealth()',
      tier3: this.llmJudge.isAvailable()
        ? 'LLM Judge - Available'
        : 'LLM Judge - Unavailable',
    };
  }

  /**
   * Verify a description against source text through the cascade.
   * Uses NLI entailment to verify that the description is supported by the source.
   */
  async verifyDescription(
    description: string,
    sourceText: string,
    config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG
  ): Promise<DescriptionVerificationResult> {
    const result: DescriptionVerificationResult = {
      description,
      verified: false,
      status: 'uncertain',
      verificationTier: 1,
      confidence: 0,
    };

    if (!config.enabled || !description || description.trim().length === 0) {
      result.status = 'skipped';
      result.reason = !config.enabled
        ? 'Verification disabled'
        : 'Empty description';
      result.confidence = 0;
      return result;
    }

    // For descriptions, skip Tier 1 (exact match) - descriptions are rarely exact
    // Go directly to Tier 2: NLI Verification
    const nliAvailable = await this.nliVerifier.checkAvailability(config);

    if (nliAvailable) {
      // Use NLI to verify description is entailed by source text
      const tier2Result = await this.nliVerifier.verifyDescription(
        description,
        sourceText,
        config
      );

      if (tier2Result.passed) {
        result.verified = true;
        result.status = 'verified';
        result.verificationTier = 2;
        result.confidence = tier2Result.prediction.entailment;
        result.reason = `NLI verified (entailment: ${(
          tier2Result.prediction.entailment * 100
        ).toFixed(1)}%)`;
        return result;
      }

      if (tier2Result.rejected) {
        result.verified = false;
        result.status = 'rejected';
        result.verificationTier = 2;
        result.confidence = 1 - tier2Result.prediction.contradiction;
        result.reason = `NLI rejected (contradiction: ${(
          tier2Result.prediction.contradiction * 100
        ).toFixed(1)}%)`;
        return result;
      }

      // Uncertain - escalate to Tier 3
    }

    // Tier 3: LLM Judge
    if (this.llmJudge.isAvailable()) {
      const tier3Result = await this.llmJudge.verifyDescription(
        description,
        sourceText,
        config
      );

      result.verified = tier3Result.verified;
      result.status = tier3Result.verified
        ? 'verified'
        : tier3Result.confidence < 0.3
        ? 'rejected'
        : 'uncertain';
      result.verificationTier = 3;
      result.confidence = tier3Result.confidence;
      result.reason = `LLM Judge: ${tier3Result.explanation}`;
    } else {
      result.status = 'uncertain';
      result.reason = 'Unable to verify (LLM unavailable)';
    }

    return result;
  }

  /**
   * Verify a relationship between two entities.
   * Verifies:
   * 1. Existence: Are these two entities mentioned together in a way that implies a relationship?
   * 2. Type: Is the relationship type correct for their connection?
   * 3. Description: Is the description accurate? (optional)
   *
   * @param schema Optional relationship schema from template pack with semantic hints
   */
  async verifyRelationship(
    sourceName: string,
    targetName: string,
    relationshipType: string,
    sourceText: string,
    description?: string,
    config: VerificationConfig = DEFAULT_VERIFICATION_CONFIG,
    schema?: {
      description?: string;
      label?: string;
      inverseLabel?: string;
      fromTypes?: string[];
      toTypes?: string[];
      semanticHints?: string[];
    }
  ): Promise<RelationshipVerificationResult> {
    const result: RelationshipVerificationResult = {
      sourceName,
      targetName,
      relationshipType,
      existenceVerified: false,
      existenceConfidence: 0,
      existenceVerificationTier: 1,
      typeVerified: false,
      typeConfidence: 0,
      typeVerificationTier: 1,
      status: 'uncertain',
      overallConfidence: 0,
    };

    if (!config.enabled) {
      result.status = 'skipped';
      result.reason = 'Verification disabled';
      return result;
    }

    // Step 1: Verify existence - both entities mentioned together
    // Tier 1: Check if both entity names exist in the source text
    const sourceInText = this.exactMatch.verifyEntityName(
      sourceName,
      sourceText,
      { exactMatchThreshold: config.exactMatchThreshold }
    );
    const targetInText = this.exactMatch.verifyEntityName(
      targetName,
      sourceText,
      { exactMatchThreshold: config.exactMatchThreshold }
    );

    if (sourceInText.passed && targetInText.passed) {
      result.existenceVerified = true;
      result.existenceConfidence =
        (sourceInText.similarity + targetInText.similarity) / 2;
      result.existenceVerificationTier = 1;
    } else {
      // Try NLI for existence verification
      const nliAvailable = await this.nliVerifier.checkAvailability(config);
      if (nliAvailable) {
        const existenceHypothesis = `${sourceName} and ${targetName} are mentioned together`;
        const existenceResult = await this.nliVerifier.verifyHypothesis(
          existenceHypothesis,
          sourceText,
          config
        );

        if (existenceResult.passed) {
          result.existenceVerified = true;
          result.existenceConfidence = existenceResult.prediction.entailment;
          result.existenceVerificationTier = 2;
        } else if (existenceResult.rejected) {
          result.existenceVerified = false;
          result.existenceConfidence =
            1 - existenceResult.prediction.contradiction;
          result.existenceVerificationTier = 2;
        }
      }

      // If still not verified, try LLM Judge
      if (!result.existenceVerified && this.llmJudge.isAvailable()) {
        const tier3Result = await this.llmJudge.verifyRelationshipExists(
          sourceName,
          targetName,
          sourceText,
          config
        );
        result.existenceVerified = tier3Result.verified;
        result.existenceConfidence = tier3Result.confidence;
        result.existenceVerificationTier = 3;
      }
    }

    // Step 2: Verify relationship type (only if existence verified)
    if (result.existenceVerified) {
      // Use NLI or LLM to verify the relationship type
      const nliAvailable = await this.nliVerifier.checkAvailability(config);

      if (nliAvailable) {
        const typeHypothesis = `${sourceName} ${this.relationshipTypeToText(
          relationshipType,
          schema
        )} ${targetName}`;
        const typeResult = await this.nliVerifier.verifyHypothesis(
          typeHypothesis,
          sourceText,
          config
        );

        if (typeResult.passed) {
          result.typeVerified = true;
          result.typeConfidence = typeResult.prediction.entailment;
          result.typeVerificationTier = 2;
        } else if (typeResult.rejected) {
          result.typeVerified = false;
          result.typeConfidence = 1 - typeResult.prediction.contradiction;
          result.typeVerificationTier = 2;
        }
      }

      // If type not verified via NLI, try LLM Judge
      if (!result.typeVerified && this.llmJudge.isAvailable()) {
        const tier3Result = await this.llmJudge.verifyRelationshipType(
          sourceName,
          targetName,
          relationshipType,
          sourceText,
          config,
          schema
        );
        result.typeVerified = tier3Result.verified;
        result.typeConfidence = tier3Result.confidence;
        result.typeVerificationTier = 3;
      }
    }

    // Step 3: Verify description (optional)
    if (description && description.trim().length > 0) {
      result.descriptionResult = await this.verifyDescription(
        description,
        sourceText,
        config
      );
    }

    // Calculate overall confidence: 70% existence+type, 30% description
    const existenceTypeConfidence =
      result.existenceVerified && result.typeVerified
        ? (result.existenceConfidence + result.typeConfidence) / 2
        : result.existenceVerified
        ? result.existenceConfidence * 0.5
        : 0;

    const descriptionConfidence = result.descriptionResult?.confidence || 0;

    if (result.descriptionResult) {
      result.overallConfidence =
        existenceTypeConfidence * 0.7 + descriptionConfidence * 0.3;
    } else {
      result.overallConfidence = existenceTypeConfidence;
    }

    // Determine overall status
    if (result.existenceVerified && result.typeVerified) {
      result.status = 'verified';
      result.reason = `Relationship verified (existence: ${(
        result.existenceConfidence * 100
      ).toFixed(1)}%, type: ${(result.typeConfidence * 100).toFixed(1)}%)`;
    } else if (!result.existenceVerified) {
      result.status = 'rejected';
      result.reason = 'Could not verify entities are related';
    } else {
      result.status = 'uncertain';
      result.reason = 'Existence verified but type uncertain';
    }

    return result;
  }

  /**
   * Convert relationship type to natural language for NLI verification.
   * Uses schema information if provided, otherwise falls back to simple conversion.
   */
  private relationshipTypeToText(
    relationshipType: string,
    schema?: { description?: string; label?: string }
  ): string {
    // If schema has a label, use it (e.g., "Parent Of" -> "is parent of")
    if (schema?.label) {
      const label = schema.label.toLowerCase();
      // Convert label to verb phrase if needed
      if (!label.startsWith('is ') && !label.includes(' of')) {
        return `is ${label}`;
      }
      return label;
    }

    // Fallback: convert SNAKE_CASE to "snake case"
    return relationshipType.toLowerCase().replace(/_/g, ' ');
  }
}
