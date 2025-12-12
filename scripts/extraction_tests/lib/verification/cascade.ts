/**
 * Verification Cascade Orchestrator
 *
 * Orchestrates the 3-tier verification cascade:
 * 1. Tier 1: Exact/Fuzzy Match (Levenshtein) - Always tried first, $0 cost
 * 2. Tier 2: NLI (DeBERTa) - Used if Tier 1 fails, self-hosted
 * 3. Tier 3: LLM Judge (Gemini) - Used only if NLI is uncertain or unavailable
 *
 * The cascade minimizes cost by:
 * - Starting with free exact match
 * - Using self-hosted NLI (~$0) for semantic verification
 * - Only escalating to paid LLM (~$0.001/entity) when necessary
 *
 * Langfuse Integration:
 * - All verification jobs are traced for observability
 * - Self-hosted NLI model calls are tracked as generations
 * - LLM Judge calls are tracked with token/cost metrics
 */

import type {
  BatchVerificationRequest,
  BatchVerificationResponse,
  EntityToVerify,
  EntityVerificationResult,
  PropertyVerificationResult,
  VerificationConfig,
  VerificationContext,
  VerificationStatus,
  VerificationTier,
} from './types';
import { DEFAULT_VERIFICATION_CONFIG } from './types';

// Tier 1: Exact Match
import { verifyEntityName, verifyPropertyValue } from './exact-match';

// Tier 2: NLI
import {
  checkNLIAvailability,
  verifyEntityWithNLI,
  verifyPropertyWithNLI,
} from './nli-verifier';

// Tier 3: LLM Judge
import { verifyEntityWithLLM, verifyPropertyWithLLM } from './llm-judge';

// Langfuse observability
import {
  createVerificationTrace,
  createTierSpan,
  updateTierSpan,
  scoreVerification,
  shutdownLangfuse,
  type VerificationTraceContext,
} from './langfuse-client';

/**
 * Create verification context with NLI availability check
 */
export async function createVerificationContext(
  sourceText: string,
  config: Partial<VerificationConfig> = {}
): Promise<VerificationContext> {
  const fullConfig = { ...DEFAULT_VERIFICATION_CONFIG, ...config };

  // Check NLI availability
  const nliAvailable = await checkNLIAvailability(fullConfig);

  return {
    sourceText,
    config: fullConfig,
    nliAvailable,
  };
}

/**
 * Verify a single property through the cascade
 */
async function verifyPropertyCascade(
  entityName: string,
  propertyName: string,
  propertyValue: string,
  context: VerificationContext
): Promise<PropertyVerificationResult> {
  const { sourceText, config, nliAvailable } = context;

  // Tier 1: Exact Match
  const exactResult = verifyPropertyValue(propertyValue, sourceText, config);
  if (exactResult.passed) {
    return {
      propertyName,
      propertyValue,
      verified: true,
      status: 'verified',
      verificationTier: 1,
      confidence: exactResult.similarity,
      reason: `Exact match found: "${exactResult.matchedText}"`,
    };
  }

  // Tier 2: NLI (if available)
  if (nliAvailable) {
    const nliResult = await verifyPropertyWithNLI(
      entityName,
      propertyName,
      propertyValue,
      sourceText,
      config
    );

    if (nliResult.passed) {
      return {
        propertyName,
        propertyValue,
        verified: true,
        status: 'verified',
        verificationTier: 2,
        confidence: nliResult.prediction.entailment,
        reason: `NLI entailment: ${(
          nliResult.prediction.entailment * 100
        ).toFixed(1)}%`,
      };
    }

    if (nliResult.rejected) {
      return {
        propertyName,
        propertyValue,
        verified: false,
        status: 'rejected',
        verificationTier: 2,
        confidence: 1 - nliResult.prediction.contradiction,
        reason: `NLI contradiction: ${(
          nliResult.prediction.contradiction * 100
        ).toFixed(1)}%`,
      };
    }

    // If NLI is uncertain, escalate to Tier 3
    if (!nliResult.uncertain) {
      // NLI gave a clear non-entailment, non-contradiction result
      return {
        propertyName,
        propertyValue,
        verified: false,
        status: 'rejected',
        verificationTier: 2,
        confidence: nliResult.prediction.entailment,
        reason: `NLI did not entail: ${(
          nliResult.prediction.entailment * 100
        ).toFixed(1)}%`,
      };
    }
  }

  // Tier 3: LLM Judge (when NLI unavailable or uncertain)
  const llmResult = await verifyPropertyWithLLM(
    entityName,
    propertyName,
    propertyValue,
    sourceText,
    config
  );

  return {
    propertyName,
    propertyValue,
    verified: llmResult.verified,
    status: llmResult.verified ? 'verified' : 'rejected',
    verificationTier: 3,
    confidence: llmResult.confidence,
    reason: llmResult.explanation,
  };
}

/**
 * Verify a single entity through the cascade
 */
export async function verifyEntityCascade(
  entity: EntityToVerify,
  context: VerificationContext
): Promise<EntityVerificationResult> {
  const { sourceText, config, nliAvailable } = context;
  const { id, name, type, properties } = entity;

  let entityVerified = false;
  let entityStatus: VerificationStatus = 'rejected';
  let entityVerificationTier: VerificationTier = 1;
  let entityConfidence = 0;
  let entityReason: string | undefined;

  // === Verify Entity Name ===

  // Tier 1: Exact Match for entity name
  const exactResult = verifyEntityName(name, sourceText, config);
  if (exactResult.passed) {
    entityVerified = true;
    entityStatus = 'verified';
    entityVerificationTier = 1;
    entityConfidence = exactResult.similarity;
    entityReason = `Exact match found: "${exactResult.matchedText}"`;
  } else {
    // Tier 2: NLI (if available)
    if (nliAvailable) {
      const nliResult = await verifyEntityWithNLI(
        name,
        type,
        sourceText,
        config
      );

      if (nliResult.passed) {
        entityVerified = true;
        entityStatus = 'verified';
        entityVerificationTier = 2;
        entityConfidence = nliResult.prediction.entailment;
        entityReason = `NLI entailment: ${(
          nliResult.prediction.entailment * 100
        ).toFixed(1)}%`;
      } else if (nliResult.rejected) {
        entityVerified = false;
        entityStatus = 'rejected';
        entityVerificationTier = 2;
        entityConfidence = 1 - nliResult.prediction.contradiction;
        entityReason = `NLI contradiction: ${(
          nliResult.prediction.contradiction * 100
        ).toFixed(1)}%`;
      } else if (!nliResult.uncertain) {
        // NLI gave a clear result (soft rejection)
        entityVerified = false;
        entityStatus = 'rejected';
        entityVerificationTier = 2;
        entityConfidence = nliResult.prediction.entailment;
        entityReason = `NLI did not entail: ${(
          nliResult.prediction.entailment * 100
        ).toFixed(1)}%`;
      }
      // If uncertain, fall through to Tier 3
    }

    // Tier 3: LLM Judge (if still not verified and NLI was uncertain/unavailable)
    if (!entityVerified && entityStatus !== 'rejected') {
      const llmResult = await verifyEntityWithLLM(
        name,
        type,
        sourceText,
        config
      );
      entityVerified = llmResult.verified;
      entityStatus = llmResult.verified ? 'verified' : 'rejected';
      entityVerificationTier = 3;
      entityConfidence = llmResult.confidence;
      entityReason = llmResult.explanation;
    }
  }

  // === Verify Properties ===
  const propertyResults: PropertyVerificationResult[] = [];

  if (config.verifyProperties && properties && entityVerified) {
    const propertyEntries = Object.entries(properties).slice(
      0,
      config.maxPropertiesPerEntity
    );

    for (const [propName, propValue] of propertyEntries) {
      if (propValue) {
        const propResult = await verifyPropertyCascade(
          name,
          propName,
          propValue,
          context
        );
        propertyResults.push(propResult);
      }
    }
  }

  // Calculate overall confidence (min of entity + property confidences)
  const allConfidences = [
    entityConfidence,
    ...propertyResults.map((p) => p.confidence),
  ];
  const overallConfidence = Math.min(...allConfidences);

  return {
    entityId: id,
    entityName: name,
    entityType: type,
    entityVerified,
    entityStatus,
    entityVerificationTier,
    entityConfidence,
    entityReason,
    properties: propertyResults,
    overallConfidence,
    sourceExcerpt:
      sourceText.length > 200
        ? sourceText.substring(0, 200) + '...'
        : sourceText,
  };
}

/**
 * Verify multiple entities in batch
 */
export async function verifyEntitiesBatch(
  request: BatchVerificationRequest,
  options?: { enableTracing?: boolean; jobId?: string }
): Promise<BatchVerificationResponse> {
  const startTime = Date.now();
  const enableTracing = options?.enableTracing ?? true;
  const jobId = options?.jobId ?? crypto.randomUUID();

  // Create Langfuse trace for this verification batch
  let traceContext: VerificationTraceContext | null = null;
  if (enableTracing) {
    traceContext = createVerificationTrace(jobId, {
      entityCount: request.entities.length,
      sourceTextLength: request.sourceText.length,
    });
  }

  // Create verification context (includes NLI availability check)
  const context = await createVerificationContext(
    request.sourceText,
    request.config
  );

  // Verify all entities
  const results: EntityVerificationResult[] = [];
  for (const entity of request.entities) {
    const result = await verifyEntityCascade(entity, context);
    results.push(result);
  }

  // Calculate summary statistics
  const tierUsage: Record<VerificationTier, number> = { 1: 0, 2: 0, 3: 0 };
  let verified = 0;
  let rejected = 0;
  let uncertain = 0;
  let totalConfidence = 0;

  for (const result of results) {
    tierUsage[result.entityVerificationTier]++;

    switch (result.entityStatus) {
      case 'verified':
        verified++;
        break;
      case 'rejected':
        rejected++;
        break;
      case 'uncertain':
        uncertain++;
        break;
    }

    totalConfidence += result.overallConfidence;
  }

  const processingTimeMs = Date.now() - startTime;

  // Score the verification in Langfuse
  if (traceContext) {
    const verificationRate = results.length > 0 ? verified / results.length : 0;
    scoreVerification(
      traceContext,
      'verification_rate',
      verificationRate,
      `${verified}/${results.length} entities verified`
    );
    scoreVerification(
      traceContext,
      'average_confidence',
      results.length > 0 ? totalConfidence / results.length : 0
    );
    scoreVerification(
      traceContext,
      'tier1_usage',
      tierUsage[1] / Math.max(results.length, 1)
    );
    scoreVerification(
      traceContext,
      'tier2_usage',
      tierUsage[2] / Math.max(results.length, 1)
    );
    scoreVerification(
      traceContext,
      'tier3_usage',
      tierUsage[3] / Math.max(results.length, 1)
    );
  }

  return {
    results,
    summary: {
      total: results.length,
      verified,
      rejected,
      uncertain,
      averageConfidence:
        results.length > 0 ? totalConfidence / results.length : 0,
      tierUsage,
    },
    processingTimeMs,
  };
}

/**
 * Quick verification of a single claim (entity + optional properties)
 * Convenience function for simple use cases
 */
export async function verifyClaim(
  entityName: string,
  sourceText: string,
  options: {
    entityType?: string;
    properties?: Record<string, string>;
    config?: Partial<VerificationConfig>;
  } = {}
): Promise<EntityVerificationResult> {
  const context = await createVerificationContext(sourceText, options.config);

  return verifyEntityCascade(
    {
      id: 'single',
      name: entityName,
      type: options.entityType,
      properties: options.properties,
    },
    context
  );
}

/**
 * Verify a claim with Langfuse tracing enabled
 * Returns the result plus a cleanup function to flush traces
 */
export async function verifyClaimWithTracing(
  entityName: string,
  sourceText: string,
  options: {
    entityType?: string;
    properties?: Record<string, string>;
    config?: Partial<VerificationConfig>;
    jobId?: string;
  } = {}
): Promise<{ result: EntityVerificationResult; flush: () => Promise<void> }> {
  const jobId = options.jobId ?? crypto.randomUUID();

  // Create trace
  const traceContext = createVerificationTrace(jobId, {
    entityName,
    entityType: options.entityType,
    sourceTextLength: sourceText.length,
  });

  const context = await createVerificationContext(sourceText, options.config);

  const result = await verifyEntityCascade(
    {
      id: 'single',
      name: entityName,
      type: options.entityType,
      properties: options.properties,
    },
    context
  );

  // Score the result
  if (traceContext) {
    scoreVerification(traceContext, 'verified', result.entityVerified ? 1 : 0);
    scoreVerification(traceContext, 'confidence', result.entityConfidence);
    scoreVerification(traceContext, 'tier_used', result.entityVerificationTier);
  }

  return {
    result,
    flush: async () => {
      await shutdownLangfuse();
    },
  };
}

/**
 * Check if verification infrastructure is healthy
 */
export async function checkVerificationHealth(
  config: Partial<VerificationConfig> = {}
): Promise<{
  tier1Available: boolean;
  tier2Available: boolean;
  tier3Available: boolean;
  message: string;
}> {
  const fullConfig = { ...DEFAULT_VERIFICATION_CONFIG, ...config };

  // Tier 1 is always available (pure JavaScript)
  const tier1Available = true;

  // Check Tier 2 (NLI)
  const tier2Available = await checkNLIAvailability(fullConfig);

  // Check Tier 3 (LLM) - just verify API key exists
  const tier3Available = !!process.env.GOOGLE_API_KEY;

  let message = 'Verification cascade status: ';
  const available: string[] = [];
  const unavailable: string[] = [];

  if (tier1Available) available.push('Tier 1 (Exact Match)');
  else unavailable.push('Tier 1 (Exact Match)');

  if (tier2Available) available.push('Tier 2 (NLI)');
  else unavailable.push('Tier 2 (NLI)');

  if (tier3Available) available.push('Tier 3 (LLM Judge)');
  else unavailable.push('Tier 3 (LLM Judge)');

  if (unavailable.length === 0) {
    message += 'All tiers available';
  } else {
    message += `Available: ${available.join(
      ', '
    )}. Unavailable: ${unavailable.join(', ')}`;
  }

  return {
    tier1Available,
    tier2Available,
    tier3Available,
    message,
  };
}
