/**
 * Relationship Verification Node
 *
 * Verifies extracted relationships using the 3-tier verification cascade:
 * - Tier 1: Exact/Fuzzy Match (Levenshtein) - Check both entities exist in source
 * - Tier 2: NLI Entailment (DeBERTa) - Semantic relationship verification
 * - Tier 3: LLM Judge (Gemini) - Final arbiter for uncertain cases
 *
 * Confidence Weighting:
 * - 70% existence + type verification
 * - 30% description verification (if present)
 *
 * Verification Status:
 * - verified: confidence >= auto_accept_threshold (default 0.9)
 * - needs_review: confidence >= confidence_threshold (default 0.7)
 * - rejected: confidence < confidence_threshold
 */

import { Logger } from '@nestjs/common';
import {
  ExtractionGraphState,
  InternalRelationship,
  VerificationStatus,
  VerificationTier,
} from '../state';
import { VerificationService } from '../../../../verification/verification.service';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import { createNodeSpan } from '../tracing';

const logger = new Logger('RelationshipVerificationNode');

/**
 * Node configuration
 */
export interface RelationshipVerificationNodeConfig {
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
 * Convert verification status to VerificationStatus enum based on thresholds
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
 * Get entity name from temp_id by looking up in extracted entities
 */
function getEntityNameByTempId(
  tempId: string,
  entities: Array<{ temp_id: string; name: string }>
): string {
  const entity = entities.find((e) => e.temp_id === tempId);
  return entity?.name || tempId;
}

/**
 * Create the relationship verification node function
 */
export function createRelationshipVerificationNode(
  config: RelationshipVerificationNodeConfig
) {
  const { verificationService, langfuseService } = config;

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<typeof ExtractionGraphState.State>> => {
    const spanHelper = createNodeSpan(
      langfuseService || null,
      state,
      'relationship_verification',
      {
        relationshipCount: state.final_relationships.length,
        verificationEnabled: state.verification_config?.enabled ?? true,
      }
    );

    const startTime = Date.now();

    try {
      // Check if verification is enabled
      if (!state.verification_config?.enabled) {
        logger.log('Verification disabled, skipping relationship verification');

        // Mark all relationships as not verified
        const relationshipsWithStatus = state.final_relationships.map(
          (rel) => ({
            ...rel,
            confidence: undefined,
            verification_status: 'pending' as VerificationStatus,
            verification_tier: 'not_verified' as VerificationTier,
            verification_reason: 'Verification disabled',
          })
        );

        spanHelper.end({
          status: 'skipped',
          reason: 'Verification disabled',
          relationship_count: relationshipsWithStatus.length,
          duration_ms: Date.now() - startTime,
        });

        return {
          final_relationships: relationshipsWithStatus,
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
        logger.warn('No source text available for relationship verification');
        spanHelper.endWithError('No source text');

        return {
          final_relationships: state.final_relationships.map((rel) => ({
            ...rel,
            verification_status: 'pending' as VerificationStatus,
            verification_tier: 'not_verified' as VerificationTier,
            verification_reason: 'No source text available',
          })),
        };
      }

      logger.log(
        `Verifying ${state.final_relationships.length} relationships against ${sourceText.length} chars`
      );

      // Verify each relationship
      const verifiedRelationships: InternalRelationship[] = [];
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

      for (const relationship of state.final_relationships) {
        // Get entity names from temp_ids
        const sourceName = getEntityNameByTempId(
          relationship.source_ref,
          state.extracted_entities
        );
        const targetName = getEntityNameByTempId(
          relationship.target_ref,
          state.extracted_entities
        );

        // Get relationship schema from template pack if available
        const relationshipSchema =
          state.relationship_schemas?.[relationship.type];

        // Verify relationship through the cascade
        // Note: verificationService.verifyRelationship uses DEFAULT_VERIFICATION_CONFIG
        // and we pass the schema separately for prompt enrichment
        const relResult = await verificationService.verifyRelationship(
          sourceName,
          targetName,
          relationship.type,
          sourceText,
          relationship.description,
          undefined, // use default config
          relationshipSchema
        );

        // Use overall confidence from verification result
        const confidence = relResult.overallConfidence;

        // Determine verification status
        const verificationStatus = statusToEnum(
          confidence,
          confidence_threshold,
          auto_accept_threshold
        );

        // Determine primary verification tier (use highest tier used)
        const highestTier = Math.max(
          relResult.existenceVerificationTier,
          relResult.typeVerificationTier,
          relResult.descriptionResult?.verificationTier || 1
        ) as 1 | 2 | 3;
        const verificationTier = tierToEnum(highestTier);

        // Build reason
        const reasons: string[] = [];
        reasons.push(
          `Existence: ${relResult.existenceVerified ? 'yes' : 'no'} (${(
            relResult.existenceConfidence * 100
          ).toFixed(1)}%)`
        );
        reasons.push(
          `Type: ${relResult.typeVerified ? 'yes' : 'no'} (${(
            relResult.typeConfidence * 100
          ).toFixed(1)}%)`
        );
        if (relResult.descriptionResult) {
          reasons.push(
            `Description: ${(
              relResult.descriptionResult.confidence * 100
            ).toFixed(1)}%`
          );
        }

        const verifiedRelationship: InternalRelationship = {
          ...relationship,
          confidence,
          verification_status: verificationStatus,
          verification_tier: verificationTier,
          verification_reason: reasons.join('; '),
        };

        verifiedRelationships.push(verifiedRelationship);

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
        verifiedRelationships.length > 0
          ? totalConfidence / verifiedRelationships.length
          : 0;

      logger.log(
        `Relationship verification complete: ${acceptedCount} verified, ${needsReviewCount} needs_review, ` +
          `${rejectedCount} rejected (avg confidence: ${(
            avgConfidence * 100
          ).toFixed(1)}%)`
      );

      // Update verification summary with relationship stats
      // Merge with existing entity summary (from entity-verification node)
      const existingSummary = state.verification_summary;
      const updatedSummary = {
        entities_verified: existingSummary?.entities_verified ?? 0,
        entities_accepted: existingSummary?.entities_accepted ?? 0,
        entities_needs_review: existingSummary?.entities_needs_review ?? 0,
        entities_rejected: existingSummary?.entities_rejected ?? 0,
        relationships_verified: verifiedRelationships.length,
        relationships_accepted: acceptedCount,
        relationships_needs_review: needsReviewCount,
        relationships_rejected: rejectedCount,
        avg_entity_confidence: existingSummary?.avg_entity_confidence ?? 0,
        avg_relationship_confidence: avgConfidence,
        verification_tiers_used: {
          ...(existingSummary?.verification_tiers_used || {}),
          ...Object.fromEntries(
            Object.entries(tierUsage).map(([k, v]) => [`rel_${k}`, v])
          ),
        },
      };

      // Build detailed output for Langfuse span
      const spanOutput = {
        summary: {
          total_relationships: verifiedRelationships.length,
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
        relationships: verifiedRelationships.map((r) => ({
          type: r.type,
          source: getEntityNameByTempId(r.source_ref, state.extracted_entities),
          target: getEntityNameByTempId(r.target_ref, state.extracted_entities),
          status: r.verification_status,
          confidence: `${((r.confidence || 0) * 100).toFixed(1)}%`,
          tier: r.verification_tier,
          reason: r.verification_reason,
        })),
        duration_ms: Date.now() - startTime,
      };

      spanHelper.end(spanOutput);

      return {
        final_relationships: verifiedRelationships,
        verification_summary: updatedSummary,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Relationship verification failed: ${errorMessage}`);

      spanHelper.endWithError(errorMessage);

      // On error, return relationships with pending status
      return {
        final_relationships: state.final_relationships.map((rel) => ({
          ...rel,
          verification_status: 'pending' as VerificationStatus,
          verification_tier: 'not_verified' as VerificationTier,
          verification_reason: `Verification error: ${errorMessage}`,
        })),
        feedback_log: [`Relationship verification error: ${errorMessage}`],
      };
    }
  };
}
