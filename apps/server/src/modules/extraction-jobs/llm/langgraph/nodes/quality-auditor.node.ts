/**
 * Quality Auditor Node
 *
 * CODE-BASED node (no LLM) that checks extraction quality and decides
 * whether to retry the relationship building.
 *
 * Quality checks:
 * 1. Orphan rate: percentage of entities with no relationships
 * 2. Relationship density: average relationships per entity
 * 3. Coverage: are important entity types connected?
 *
 * If quality is below threshold and retries remain, triggers another
 * relationship building pass with orphan feedback.
 */

import { Logger } from '@nestjs/common';
import {
  ExtractionGraphState,
  ExtractionGraphStateType,
  calculateOrphanRate,
  getOrphanEntities,
} from '../state';
import { LangfuseService } from '../../../../langfuse/langfuse.service';
import { createNodeSpan } from '../tracing';

const logger = new Logger('QualityAuditorNode');

/**
 * Quality audit configuration
 */
export interface QualityAuditorConfig {
  /** Maximum acceptable orphan rate (0.0-1.0). Default: 0.2 (20%) */
  maxOrphanRate?: number;
  /** Minimum acceptable relationship density. Default: 0.5 */
  minRelationshipDensity?: number;
  /** Minimum entities required for density check. Default: 3 */
  minEntitiesForDensityCheck?: number;
  /** Optional LangfuseService for tracing */
  langfuseService?: LangfuseService | null;
}

/**
 * Result of quality audit
 */
export interface QualityAuditResult {
  passed: boolean;
  orphanRate: number;
  relationshipDensity: number;
  orphanCount: number;
  totalEntities: number;
  totalRelationships: number;
  issues: string[];
  recommendations: string[];
}

/**
 * Perform a quality audit on the extraction results
 */
function auditQuality(
  entities: { temp_id: string; type: string; name: string }[],
  relationships: { source_ref: string; target_ref: string; type: string }[],
  config: QualityAuditorConfig
): QualityAuditResult {
  const {
    maxOrphanRate = 0.2,
    minRelationshipDensity = 0.5,
    minEntitiesForDensityCheck = 3,
  } = config;

  const issues: string[] = [];
  const recommendations: string[] = [];

  // Calculate orphan rate
  const orphanRate = calculateOrphanRate(entities as any, relationships as any);
  const orphanTempIds = getOrphanEntities(
    entities as any,
    relationships as any
  );
  const orphanCount = orphanTempIds.length;

  // Calculate relationship density
  const relationshipDensity =
    entities.length > 0 ? relationships.length / entities.length : 0;

  // Check orphan rate
  let passed = true;

  if (orphanRate > maxOrphanRate) {
    passed = false;
    issues.push(
      `High orphan rate: ${(orphanRate * 100).toFixed(1)}% ` +
        `(${orphanCount}/${entities.length} entities have no relationships)`
    );

    // Add recommendations based on orphan types
    const orphansByType: Record<string, string[]> = {};
    for (const tempId of orphanTempIds) {
      const entity = entities.find((e) => e.temp_id === tempId);
      if (entity) {
        const type = entity.type;
        orphansByType[type] = orphansByType[type] || [];
        orphansByType[type].push(entity.name);
      }
    }

    for (const [type, names] of Object.entries(orphansByType)) {
      if (names.length > 3) {
        recommendations.push(
          `Connect ${names.length} orphan ${type} entities: ${names
            .slice(0, 3)
            .join(', ')}...`
        );
      } else {
        recommendations.push(
          `Connect orphan ${type} entities: ${names.join(', ')}`
        );
      }
    }
  }

  // Check relationship density (only if we have enough entities)
  if (
    entities.length >= minEntitiesForDensityCheck &&
    relationshipDensity < minRelationshipDensity
  ) {
    // Don't fail on density alone if orphan rate is acceptable
    if (passed) {
      issues.push(
        `Low relationship density: ${relationshipDensity.toFixed(2)} ` +
          `(expected at least ${minRelationshipDensity})`
      );
      recommendations.push(
        'Consider looking for implicit relationships in entity descriptions'
      );
    }
  }

  // If only 1-2 entities, relationships might not be applicable
  if (
    entities.length < minEntitiesForDensityCheck &&
    relationships.length === 0
  ) {
    // Special case: few entities, no relationships is acceptable
    passed = true;
    issues.length = 0; // Clear any issues
  }

  return {
    passed,
    orphanRate,
    relationshipDensity,
    orphanCount,
    totalEntities: entities.length,
    totalRelationships: relationships.length,
    issues,
    recommendations,
  };
}

/**
 * Create the quality auditor node function
 *
 * This is a CODE-BASED node that:
 * 1. Audits the quality of extracted entities and relationships
 * 2. Decides whether to pass (finish) or retry
 * 3. Provides feedback for retry attempts
 */
export function createQualityAuditorNode(config: QualityAuditorConfig = {}) {
  const { langfuseService = null, ...auditConfig } = config;

  return async (
    state: typeof ExtractionGraphState.State
  ): Promise<Partial<ExtractionGraphStateType>> => {
    const startTime = Date.now();

    logger.debug(
      `Auditing quality: ${state.extracted_entities.length} entities, ` +
        `${state.final_relationships.length} relationships`
    );

    // Create tracing span for this node
    const span = createNodeSpan(langfuseService, state, 'quality_auditor', {
      entityCount: state.extracted_entities.length,
      relationshipCount: state.final_relationships.length,
      retryCount: state.retry_count,
      maxRetries: state.max_retries,
    });

    // Perform audit
    const auditResult = auditQuality(
      state.extracted_entities,
      state.final_relationships,
      auditConfig
    );

    // Check if we should retry
    const canRetry = state.retry_count < state.max_retries;
    const shouldRetry = !auditResult.passed && canRetry;

    if (auditResult.passed) {
      logger.log(
        `Quality check PASSED: orphan rate ${(
          auditResult.orphanRate * 100
        ).toFixed(1)}%, ` +
          `density ${auditResult.relationshipDensity.toFixed(2)}`
      );
    } else if (shouldRetry) {
      logger.log(
        `Quality check FAILED (retry ${state.retry_count + 1}/${
          state.max_retries
        }): ` + auditResult.issues.join('; ')
      );
    } else {
      logger.warn(
        `Quality check FAILED (no retries left): ${auditResult.issues.join(
          '; '
        )}`
      );
    }

    // Build feedback for retry
    const feedback = shouldRetry
      ? [
          `Quality audit failed: ${auditResult.issues.join('. ')}`,
          `Recommendations: ${auditResult.recommendations.join('. ')}`,
        ]
      : [];

    // Get orphan temp_ids for retry
    const orphanTempIds = getOrphanEntities(
      state.extracted_entities,
      state.final_relationships
    );

    // End tracing span
    span.end({
      passed: auditResult.passed,
      shouldRetry,
      orphanRate: auditResult.orphanRate,
      relationshipDensity: auditResult.relationshipDensity,
      orphanCount: auditResult.orphanCount,
      issues: auditResult.issues,
    });

    return {
      quality_check_passed: auditResult.passed || !canRetry,
      retry_count: shouldRetry ? state.retry_count + 1 : state.retry_count,
      orphan_entities: orphanTempIds,
      feedback_log: feedback,
      node_responses: {
        quality_auditor: {
          passed: auditResult.passed,
          should_retry: shouldRetry,
          orphan_rate: auditResult.orphanRate,
          relationship_density: auditResult.relationshipDensity,
          orphan_count: auditResult.orphanCount,
          issues: auditResult.issues,
          recommendations: auditResult.recommendations,
          retry_count: state.retry_count,
          max_retries: state.max_retries,
          duration_ms: Date.now() - startTime,
        },
      },
    };
  };
}

/**
 * Conditional edge function for deciding next step after quality audit
 *
 * Returns the name of the next node to execute:
 * - "retry" if quality failed and retries remain
 * - "finish" if quality passed or no retries remain
 */
export function qualityAuditRouter(
  state: typeof ExtractionGraphState.State
): 'retry' | 'finish' {
  // If quality check passed, we're done
  if (state.quality_check_passed) {
    return 'finish';
  }

  // If we have retries left, retry
  if (state.retry_count < state.max_retries) {
    return 'retry';
  }

  // No retries left, finish anyway
  return 'finish';
}
