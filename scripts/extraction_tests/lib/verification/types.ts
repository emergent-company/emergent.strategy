/**
 * Verification Cascade Types
 *
 * Types for the 3-tier extraction verification cascade:
 * - Tier 1: Exact/Fuzzy Match (Levenshtein)
 * - Tier 2: NLI Entailment (DeBERTa)
 * - Tier 3: LLM Judge (Gemini)
 */

/**
 * Verification tier identifier
 */
export type VerificationTier = 1 | 2 | 3;

/**
 * Verification status
 */
export type VerificationStatus =
  | 'verified'
  | 'rejected'
  | 'uncertain'
  | 'skipped';

/**
 * Configuration for the verification cascade
 */
export interface VerificationConfig {
  // Tier 1: Exact/Fuzzy Match
  /** Levenshtein similarity ratio threshold for "exact" match (0-1) */
  exactMatchThreshold: number;

  // Tier 2: NLI
  /** NLI service endpoint URL */
  nliEndpoint: string;
  /** Entailment score threshold for verification (0-1) */
  nliEntailmentThreshold: number;
  /** Contradiction score threshold for rejection (0-1) */
  nliContradictionThreshold: number;
  /** Uncertainty range [min, max] - scores in this range escalate to Tier 3 */
  nliUncertaintyRange: [number, number];
  /** Timeout for NLI service calls in milliseconds */
  nliTimeoutMs: number;

  // Tier 3: LLM Judge
  /** Gemini model to use for LLM judge */
  llmJudgeModel: string;

  // General
  /** Whether to verify individual properties */
  verifyProperties: boolean;
  /** Maximum properties to verify per entity */
  maxPropertiesPerEntity: number;
}

/**
 * Default verification configuration
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  // Tier 1: Exact/Fuzzy Match
  exactMatchThreshold: 0.95,

  // Tier 2: NLI
  nliEndpoint: 'http://localhost:8090/predict',
  nliEntailmentThreshold: 0.9,
  nliContradictionThreshold: 0.7,
  nliUncertaintyRange: [0.4, 0.6],
  nliTimeoutMs: 5000,

  // Tier 3: LLM Judge
  llmJudgeModel: 'gemini-2.5-flash-lite',

  // General
  verifyProperties: true,
  maxPropertiesPerEntity: 20,
};

/**
 * Result of verifying a single property
 */
export interface PropertyVerificationResult {
  /** Property name */
  propertyName: string;
  /** Property value being verified */
  propertyValue: string;
  /** Whether the property was verified */
  verified: boolean;
  /** Verification status */
  status: VerificationStatus;
  /** Which tier produced the result */
  verificationTier: VerificationTier;
  /** Confidence score (0-1) */
  confidence: number;
  /** Optional reason for the verification result */
  reason?: string;
}

/**
 * Result of verifying an entity
 */
export interface EntityVerificationResult {
  /** Entity identifier */
  entityId: string;
  /** Entity name being verified */
  entityName: string;
  /** Entity type */
  entityType?: string;
  /** Whether the entity was verified */
  entityVerified: boolean;
  /** Entity verification status */
  entityStatus: VerificationStatus;
  /** Which tier verified the entity */
  entityVerificationTier: VerificationTier;
  /** Entity confidence score (0-1) */
  entityConfidence: number;
  /** Optional reason for the entity verification */
  entityReason?: string;
  /** Property verification results */
  properties: PropertyVerificationResult[];
  /** Overall confidence (min of entity + all property confidences) */
  overallConfidence: number;
  /** Source text excerpt used for verification */
  sourceExcerpt?: string;
}

/**
 * Entity to verify
 */
export interface EntityToVerify {
  /** Entity identifier */
  id: string;
  /** Entity name */
  name: string;
  /** Entity type */
  type?: string;
  /** Entity properties to verify */
  properties?: Record<string, string>;
}

/**
 * NLI prediction response from the NLI service
 */
export interface NLIPrediction {
  /** Score for hypothesis being true given premise (0-1) */
  entailment: number;
  /** Score for hypothesis being false given premise (0-1) */
  contradiction: number;
  /** Score for hypothesis being neither entailed nor contradicted (0-1) */
  neutral: number;
}

/**
 * Result from exact match verification (Tier 1)
 */
export interface ExactMatchResult {
  /** Whether the text was found */
  found: boolean;
  /** Similarity score (0-1) */
  similarity: number;
  /** Best matching text from source */
  matchedText?: string;
  /** Whether it passed the threshold */
  passed: boolean;
}

/**
 * Result from NLI verification (Tier 2)
 */
export interface NLIVerificationResult {
  /** NLI prediction scores */
  prediction: NLIPrediction;
  /** Whether it passed verification */
  passed: boolean;
  /** Whether it was rejected (contradiction) */
  rejected: boolean;
  /** Whether it's uncertain (needs Tier 3) */
  uncertain: boolean;
  /** Whether NLI service was available */
  available: boolean;
  /** Error message if NLI failed */
  error?: string;
}

/**
 * Result from LLM Judge verification (Tier 3)
 */
export interface LLMJudgeResult {
  /** Whether the claim was verified */
  verified: boolean;
  /** Confidence in the judgment (0-1) */
  confidence: number;
  /** Explanation from the LLM */
  explanation: string;
  /** Raw LLM response */
  rawResponse?: string;
}

/**
 * Verification context passed through the cascade
 */
export interface VerificationContext {
  /** Source text to verify against */
  sourceText: string;
  /** Configuration for verification */
  config: VerificationConfig;
  /** Whether NLI service is available */
  nliAvailable: boolean;
}

/**
 * Batch verification request
 */
export interface BatchVerificationRequest {
  /** Source text to verify against */
  sourceText: string;
  /** Entities to verify */
  entities: EntityToVerify[];
  /** Optional custom configuration */
  config?: Partial<VerificationConfig>;
}

/**
 * Batch verification response
 */
export interface BatchVerificationResponse {
  /** Verification results for each entity */
  results: EntityVerificationResult[];
  /** Summary statistics */
  summary: {
    /** Total entities processed */
    total: number;
    /** Entities verified */
    verified: number;
    /** Entities rejected */
    rejected: number;
    /** Entities uncertain */
    uncertain: number;
    /** Average confidence */
    averageConfidence: number;
    /** Tier usage breakdown */
    tierUsage: Record<VerificationTier, number>;
  };
  /** Processing time in milliseconds */
  processingTimeMs: number;
}
