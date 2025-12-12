/**
 * Verification Cascade Library
 *
 * 3-tier verification system for extracted entities and properties:
 *
 * Tier 1: Exact/Fuzzy Match (Levenshtein)
 * - Fastest and free ($0)
 * - Checks if extracted text appears verbatim in source
 * - Uses Levenshtein similarity with configurable threshold
 *
 * Tier 2: NLI (Natural Language Inference)
 * - Self-hosted DeBERTa-v3-small model (~$0)
 * - Semantic entailment verification
 * - Handles paraphrasing, synonyms, implied information
 *
 * Tier 3: LLM Judge (Gemini)
 * - Paid API calls (~$0.001/entity)
 * - Used only when NLI is uncertain (0.4-0.6 range) or unavailable
 * - Most flexible but most expensive
 *
 * @example
 * ```typescript
 * import { verifyClaim, verifyEntitiesBatch } from './verification';
 *
 * // Simple single claim verification
 * const result = await verifyClaim('John Smith', documentText, {
 *   entityType: 'person',
 *   properties: { title: 'CEO', company: 'Acme Corp' }
 * });
 *
 * // Batch verification
 * const batchResult = await verifyEntitiesBatch({
 *   sourceText: documentText,
 *   entities: [
 *     { id: '1', name: 'John Smith', type: 'person', properties: { title: 'CEO' } },
 *     { id: '2', name: 'Acme Corp', type: 'organization' }
 *   ]
 * });
 * ```
 */

// Types
export type {
  BatchVerificationRequest,
  BatchVerificationResponse,
  EntityToVerify,
  EntityVerificationResult,
  ExactMatchResult,
  LLMJudgeResult,
  NLIPrediction,
  NLIVerificationResult,
  PropertyVerificationResult,
  VerificationConfig,
  VerificationContext,
  VerificationStatus,
  VerificationTier,
} from './types';

export { DEFAULT_VERIFICATION_CONFIG } from './types';

// Tier 1: Exact/Fuzzy Match
export {
  findBestMatch,
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeText,
  verifyDate,
  verifyEntityName,
  verifyExactMatch,
  verifyNumber,
  verifyPropertyValue,
} from './exact-match';

// Tier 2: NLI
export {
  callNLIService,
  callNLIServiceBatch,
  checkNLIAvailability,
  createEntityHypothesis,
  createPropertyHypothesis,
  interpretNLIPrediction,
  truncatePremise,
  verifyEntityWithNLI,
  verifyPropertyWithNLI,
  verifyWithNLI,
} from './nli-verifier';

// Tier 3: LLM Judge
export {
  verifyBatchWithLLM,
  verifyEntityWithLLM,
  verifyPropertyWithLLM,
} from './llm-judge';

// Cascade Orchestrator
export {
  checkVerificationHealth,
  createVerificationContext,
  verifyClaim,
  verifyClaimWithTracing,
  verifyEntitiesBatch,
  verifyEntityCascade,
} from './cascade';

// Langfuse Observability
export {
  createVerificationTrace,
  createTierSpan,
  updateTierSpan,
  createNLIGeneration,
  updateNLIGeneration,
  createLLMJudgeGeneration,
  updateLLMJudgeGeneration,
  logVerificationEvent,
  scoreVerification,
  shutdownLangfuse,
  getLangfuseClient,
  getLangfuseConfig,
  type VerificationTraceContext,
  type LangfuseConfig,
} from './langfuse-client';
