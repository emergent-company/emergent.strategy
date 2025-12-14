/**
 * Entity Verification Node
 *
 * Verifies extracted entities using the 3-tier verification cascade:
 * - Tier 1: Exact/Fuzzy Match (Levenshtein) - Fast, cheap, good for names
 * - Tier 2: NLI Entailment (DeBERTa) - Semantic verification
 * - Tier 3: LLM Judge (Gemini) - Final arbiter for uncertain cases
 *
 * Confidence Weighting:
 * - 80% name verification (primary identifier, most reliable signal)
 * - 15% description verification
 * - 5% property verification
 *
 * Verification Status:
 * - verified: confidence >= auto_accept_threshold (default 0.9)
 * - needs_review: confidence >= confidence_threshold (default 0.7)
 * - rejected: confidence < confidence_threshold
 */

import { Logger } from '@nestjs/common';
import {
  ExtractionGraphState,
  InternalEntity,
  VerificationStatus,
  VerificationTier,
} from '../state';
import { VerificationService } from '../../../../verification/verification.service';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import { createNodeSpan } from '../tracing';
import { PropertyVerificationResult } from '../../../../verification/types';

const logger = new Logger('EntityVerificationNode');

/**
 * Node configuration
 */
export interface EntityVerificationNodeConfig {
  /** VerificationService instance for cascade verification */
  verificationService: VerificationService;
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeoutMs?: number;
  /** Optional LangfuseService for tracing */
  langfuseService?: LangfuseService | null;
}

/**
 * Convert numeric tier to VerificationTier enum
 */
function tierToEnum(tier: 1 | 2 | 3): VerificationTier {
  switch (tier) {
    case 1:
      return 'exact_match';
    case 2:
      return 'nli';
    case 3:
      return 'llm_judge';
  }
}

/**
 * Convert verification status to VerificationStatus enum
 */
function statusToEnum(
  confidence: number,
  confidenceThreshold: number,
  autoAcceptThreshold: number
): VerificationStatus {
  if (confidence >= autoAcceptThreshold) {
    return 'verified';
  } else if (confidence >= confidenceThreshold) {
    return 'needs_review';
  } else {
    return 'rejected';
  }
}

/**
 * Calculate weighted entity confidence score
 * - 80% name
 * - 15% description
 * - 5% properties
 *
 * Name is heavily weighted because entity names are the primary identifier
 * and most reliable signal from extraction. Description and properties
 * provide supporting evidence but are often generated or incomplete.
 */
function calculateEntityConfidence(
  nameConfidence: number,
  descriptionConfidence: number | undefined,
  propertyConfidence: number | undefined
): number {
  const nameWeight = 0.8;
  const descWeight = 0.15;
  const propWeight = 0.05;

  // If description is missing, redistribute weight to name and properties
  if (descriptionConfidence === undefined && propertyConfidence === undefined) {
    return nameConfidence;
  }

  if (descriptionConfidence === undefined) {
    // Redistribute description weight proportionally: 94% name (0.8/0.85), 6% properties (0.05/0.85)
    return nameConfidence * 0.94 + (propertyConfidence || 0) * 0.06;
  }

  if (propertyConfidence === undefined) {
    // Redistribute property weight proportionally: 84% name (0.8/0.95), 16% description (0.15/0.95)
    return nameConfidence * 0.84 + descriptionConfidence * 0.16;
  }

  return (
    nameConfidence * nameWeight +
    descriptionConfidence * descWeight +
    propertyConfidence * propWeight
  );
}

/**
 * Create the entity verification node function
 */
export function createEntityVerificationNode(
  config: EntityVerificationNodeConfig
) {
  const { verificationService, langfuseService } = config;

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<typeof ExtractionGraphState.State>> => {
    const spanHelper = createNodeSpan(
      langfuseService || null,
      state,
      'entity_verification',
      {
        entityCount: state.extracted_entities.length,
        verificationEnabled: state.verification_config?.enabled ?? true,
      }
    );

    const startTime = Date.now();

    try {
      // Check if verification is enabled
      if (!state.verification_config?.enabled) {
        logger.log('Verification disabled, skipping entity verification');

        // Mark all entities as not verified
        const entitiesWithStatus = state.extracted_entities.map((entity) => ({
          ...entity,
          confidence: undefined,
          verification_status: 'pending' as VerificationStatus,
          verification_tier: 'not_verified' as VerificationTier,
          verification_reason: 'Verification disabled',
        }));

        spanHelper.end({
          status: 'skipped',
          reason: 'Verification disabled',
          entity_count: entitiesWithStatus.length,
          duration_ms: Date.now() - startTime,
        });

        return {
          extracted_entities: entitiesWithStatus,
          node_responses: {
            entity_verification: {
              status: 'skipped',
              reason: 'Verification disabled',
              entities_count: entitiesWithStatus.length,
              duration_ms: Date.now() - startTime,
            },
          },
        };
      }

      const { confidence_threshold = 0.7, auto_accept_threshold = 0.9 } =
        state.verification_config;

      // Get the original text for verification
      const sourceText =
        state.document_chunks?.length > 0
          ? state.document_chunks.join('\n\n')
          : state.original_text;

      if (!sourceText) {
        logger.warn('No source text available for verification');
        spanHelper.endWithError('No source text');

        return {
          extracted_entities: state.extracted_entities.map((entity) => ({
            ...entity,
            verification_status: 'pending' as VerificationStatus,
            verification_tier: 'not_verified' as VerificationTier,
            verification_reason: 'No source text available',
          })),
          node_responses: {
            entity_verification: {
              status: 'error',
              reason: 'No source text available',
              entities_count: state.extracted_entities.length,
              duration_ms: Date.now() - startTime,
            },
          },
        };
      }

      logger.log(
        `Verifying ${state.extracted_entities.length} entities against ${sourceText.length} chars`
      );

      // Verify each entity
      const verifiedEntities: InternalEntity[] = [];
      const tierUsage: Record<string, number> = {
        exact_match: 0,
        nli: 0,
        llm_judge: 0,
        not_verified: 0,
      };
      let totalConfidence = 0;
      let acceptedCount = 0;
      let needsReviewCount = 0;
      let rejectedCount = 0;

      for (const entity of state.extracted_entities) {
        // Verify entity through the cascade
        const entityResult = await verificationService.verifyEntity(
          {
            id: entity.temp_id,
            name: entity.name,
            type: entity.type,
            properties: entity.properties as Record<
              string,
              string | number | boolean | null | undefined
            >,
          },
          sourceText
        );

        // Verify description if present
        let descriptionConfidence: number | undefined;
        if (entity.description && entity.description.trim().length > 0) {
          const descResult = await verificationService.verifyDescription(
            entity.description,
            sourceText
          );
          descriptionConfidence = descResult.confidence;
        }

        // Calculate property confidence from entity result
        const propertyConfidence =
          entityResult.properties.length > 0
            ? entityResult.properties.reduce(
                (sum: number, p: PropertyVerificationResult) =>
                  sum + p.confidence,
                0
              ) / entityResult.properties.length
            : undefined;

        // Calculate weighted confidence
        const confidence = calculateEntityConfidence(
          entityResult.entityConfidence,
          descriptionConfidence,
          propertyConfidence
        );

        // Determine verification status
        const verificationStatus = statusToEnum(
          confidence,
          confidence_threshold,
          auto_accept_threshold
        );

        // Determine primary verification tier
        const verificationTier = tierToEnum(
          entityResult.entityVerificationTier
        );

        // Build reason
        const reasons: string[] = [];
        reasons.push(`Name: ${entityResult.entityReason || 'verified'}`);
        if (descriptionConfidence !== undefined) {
          reasons.push(
            `Description: ${(descriptionConfidence * 100).toFixed(1)}%`
          );
        }
        if (propertyConfidence !== undefined) {
          reasons.push(`Properties: ${(propertyConfidence * 100).toFixed(1)}%`);
        }

        const verifiedEntity: InternalEntity = {
          ...entity,
          confidence,
          verification_status: verificationStatus,
          verification_tier: verificationTier,
          verification_reason: reasons.join('; '),
        };

        verifiedEntities.push(verifiedEntity);

        // Update stats
        tierUsage[verificationTier]++;
        totalConfidence += confidence;

        switch (verificationStatus) {
          case 'verified':
            acceptedCount++;
            break;
          case 'needs_review':
            needsReviewCount++;
            break;
          case 'rejected':
            rejectedCount++;
            break;
        }
      }

      const avgConfidence =
        verifiedEntities.length > 0
          ? totalConfidence / verifiedEntities.length
          : 0;

      logger.log(
        `Entity verification complete: ${acceptedCount} verified, ${needsReviewCount} needs_review, ` +
          `${rejectedCount} rejected (avg confidence: ${(
            avgConfidence * 100
          ).toFixed(1)}%)`
      );

      // Create or update verification summary
      const verificationSummary = {
        entities_verified: verifiedEntities.length,
        entities_accepted: acceptedCount,
        entities_needs_review: needsReviewCount,
        entities_rejected: rejectedCount,
        // Relationship fields will be updated by relationship-verification node
        relationships_verified: 0,
        relationships_accepted: 0,
        relationships_needs_review: 0,
        relationships_rejected: 0,
        avg_entity_confidence: avgConfidence,
        avg_relationship_confidence: 0,
        verification_tiers_used: tierUsage,
      };

      // Build detailed output for Langfuse span
      const spanOutput = {
        summary: {
          total_entities: verifiedEntities.length,
          verified: acceptedCount,
          needs_review: needsReviewCount,
          rejected: rejectedCount,
          avg_confidence: `${(avgConfidence * 100).toFixed(1)}%`,
        },
        thresholds: {
          confidence_threshold: `${(confidence_threshold * 100).toFixed(0)}%`,
          auto_accept_threshold: `${(auto_accept_threshold * 100).toFixed(0)}%`,
        },
        tier_usage: tierUsage,
        entities: verifiedEntities.map((e) => ({
          name: e.name,
          type: e.type,
          status: e.verification_status,
          confidence: `${((e.confidence || 0) * 100).toFixed(1)}%`,
          tier: e.verification_tier,
          reason: e.verification_reason,
        })),
        duration_ms: Date.now() - startTime,
      };

      spanHelper.end(spanOutput);

      return {
        extracted_entities: verifiedEntities,
        verification_summary: verificationSummary,
        node_responses: {
          entity_verification: {
            status: 'success',
            entities_verified: verifiedEntities.length,
            entities_accepted: acceptedCount,
            entities_needs_review: needsReviewCount,
            entities_rejected: rejectedCount,
            avg_confidence: avgConfidence,
            confidence_threshold,
            auto_accept_threshold,
            tier_usage: tierUsage,
            duration_ms: Date.now() - startTime,
            // Include per-entity breakdown for debugging
            entity_results: verifiedEntities.map((e) => ({
              temp_id: e.temp_id,
              name: e.name,
              type: e.type,
              confidence: e.confidence,
              status: e.verification_status,
              tier: e.verification_tier,
              reason: e.verification_reason,
            })),
          },
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Entity verification failed: ${errorMessage}`);

      spanHelper.endWithError(errorMessage);

      // On error, return entities with pending status
      return {
        extracted_entities: state.extracted_entities.map((entity) => ({
          ...entity,
          verification_status: 'pending' as VerificationStatus,
          verification_tier: 'not_verified' as VerificationTier,
          verification_reason: `Verification error: ${errorMessage}`,
        })),
        feedback_log: [`Entity verification error: ${errorMessage}`],
        node_responses: {
          entity_verification: {
            status: 'error',
            error: errorMessage,
            entities_count: state.extracted_entities.length,
            duration_ms: Date.now() - startTime,
          },
        },
      };
    }
  };
}
