/**
 * Verification Module - Public API
 *
 * 3-tier extraction verification cascade:
 * - Tier 1: Exact/Fuzzy Match (Levenshtein)
 * - Tier 2: NLI Entailment (DeBERTa)
 * - Tier 3: LLM Judge (Gemini)
 */

// Module
export { VerificationModule } from './verification.module';

// Main service
export { VerificationService } from './verification.service';

// Individual tier services (for direct access if needed)
export { ExactMatchService } from './exact-match.service';
export { NLIVerifierService } from './nli-verifier.service';
export { LLMJudgeService } from './llm-judge.service';

// Types
export type {
  VerificationConfig,
  VerificationTier,
  VerificationStatus,
  EntityVerificationResult,
  PropertyVerificationResult,
  EntityToVerify,
  BatchVerificationRequest,
  BatchVerificationResponse,
  VerificationHealthResult,
  NLIPrediction,
  ExactMatchResult,
  NLIVerificationResult,
  LLMJudgeResult,
  VerificationContext,
} from './types';

export { DEFAULT_VERIFICATION_CONFIG } from './types';
