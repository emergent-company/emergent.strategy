# Design: Extraction Verification Cascade

## Context

The extraction pipeline extracts entities and relationships from documents. Currently, extraction quality is estimated using LLM-based confidence scoring, which is unreliable and expensive. This design introduces a 3-tier verification cascade that measures extraction quality against source text using progressively more expensive methods.

**Stakeholders:**

- Extraction pipeline maintainers
- Infrastructure team (NLI model hosting)
- End users (extraction quality affects knowledge graph accuracy)

**Constraints:**

- NLI model must run on CPU (no GPU requirement)
- Verification should not significantly slow down extraction
- System must work even if NLI service is unavailable (graceful degradation)

## Goals / Non-Goals

**Goals:**

- Replace unreliable LLM confidence scoring with evidence-based verification
- Minimize verification costs by using cheaper methods first
- Provide entity-level AND property-level verification
- Enable experimentation via test scripts before pipeline integration
- Deploy NLI model as self-hosted service for cost control

**Non-Goals:**

- Real-time verification during extraction (batch post-processing is acceptable)
- Training custom NLI models (use pre-trained DeBERTa)
- UI integration for verification settings (future change)
- Replacing the entire extraction pipeline (only verification component)

## Decisions

### Decision 1: 3-Tier Cascade Architecture

**What:** Implement verification as a cascade with three tiers:

| Tier | Method            | Cost | When Used                  | Pass Threshold            |
| ---- | ----------------- | ---- | -------------------------- | ------------------------- |
| 1    | Exact/Fuzzy Match | $0   | Always first               | Levenshtein ratio >= 0.95 |
| 2    | NLI Entailment    | ~$   | If Tier 1 fails            | Entailment score >= 0.9   |
| 3    | LLM Judge         | ~$$  | If NLI uncertain (0.4-0.6) | LLM says "verified"       |

**Why:** Minimizes cost by only escalating when necessary. Most extractions (names, dates, IDs) can be verified with free string matching.

**Alternatives considered:**

- Single LLM-only verification: Too expensive, every entity needs LLM call
- NLI-only: Good for semantic claims, but overkill for exact matches
- Parallel verification: More expensive, no cost savings

### Decision 2: Self-Hosted NLI Model in emergent-infra

**What:** Deploy `cross-encoder/nli-deberta-v3-small` (44M params) as FastAPI service in the `emergent-infra` repository.

**Why:**

- 44M params runs efficiently on CPU
- Self-hosted = predictable costs, no API rate limits
- Keeps infrastructure separate from application code
- DeBERTa-v3-small is specifically trained for NLI task

**Service contract:**

```typescript
// POST http://localhost:8080/predict
Request: { premise: string, hypothesis: string }
Response: { entailment: number, contradiction: number, neutral: number }
```

**Alternatives considered:**

- Hosted NLI API (Hugging Face Inference): Adds external dependency, costs scale with usage
- Larger models (deberta-v3-base, v3-large): Overkill for verification, slower on CPU
- Local embedding similarity: Not suitable for entailment/contradiction detection

### Decision 3: Entity-Level AND Property-Level Verification

**What:** Verify both:

1. **Entity-level:** "Does source text mention [Entity Name]?"
2. **Property-level:** "Does source text support [Entity Name] has [Property] = [Value]?"

**Why:** Entity existence is necessary but not sufficient. Property values need independent verification (e.g., "John" exists but "John is the CEO" needs separate verification).

**Verification result structure:**

```typescript
interface VerificationResult {
  entityId: string;
  entityName: string;
  entityVerified: boolean;
  entityVerificationTier: 1 | 2 | 3;
  entityConfidence: number;
  properties: PropertyVerificationResult[];
  overallConfidence: number; // min of entity + property confidences
}

interface PropertyVerificationResult {
  propertyName: string;
  propertyValue: string;
  verified: boolean;
  verificationTier: 1 | 2 | 3;
  confidence: number;
}
```

### Decision 4: Experimental Implementation in Test Scripts First

**What:** Build verification library in `scripts/extraction_tests/lib/verification/` with test scripts in `scripts/extraction_tests/tests/verification/` before integrating into main pipeline.

**Why:**

- Allows rapid experimentation with thresholds and methods
- Reduces risk of breaking production extraction
- Test scripts can run against real documents without affecting users
- Easier to iterate on verification logic in isolation

**File structure:**

```
scripts/extraction_tests/
├── lib/
│   └── verification/
│       ├── index.ts           # Main exports
│       ├── types.ts           # Verification types
│       ├── exact-match.ts     # Tier 1: Levenshtein matching
│       ├── nli-verifier.ts    # Tier 2: NLI service client
│       ├── llm-judge.ts       # Tier 3: Gemini-based verification
│       └── cascade.ts         # Orchestrator
└── tests/
    └── verification/
        ├── test-exact-match.test.ts
        ├── test-nli-verifier.test.ts
        ├── test-llm-judge.test.ts
        ├── test-verification-cascade.test.ts
        └── test-extraction-with-verification.test.ts
```

### Decision 5: Graceful Degradation

**What:** If NLI service is unavailable, skip Tier 2 and fall back to Tier 3 (LLM Judge) for entities that fail Tier 1.

**Why:** Verification should not block extraction. Better to use more expensive fallback than fail entirely.

**Degradation behavior:**

```
NLI available:    Tier 1 → Tier 2 → Tier 3 (if uncertain)
NLI unavailable:  Tier 1 → Tier 3 (skip Tier 2)
```

### Decision 6: Configurable Thresholds

**What:** All thresholds are configurable via a settings object with sensible defaults.

**Why:** Optimal thresholds may vary by document type and extraction requirements.

**Default configuration:**

```typescript
const defaultConfig: VerificationConfig = {
  // Tier 1: Exact/Fuzzy Match
  exactMatchThreshold: 0.95, // Levenshtein ratio for "exact" match

  // Tier 2: NLI
  nliEndpoint: 'http://localhost:8080/predict',
  nliEntailmentThreshold: 0.9, // Score above this = verified
  nliContradictionThreshold: 0.7, // Score above this = rejected
  nliUncertaintyRange: [0.4, 0.6], // Scores in this range → escalate to Tier 3
  nliTimeoutMs: 5000, // Timeout for NLI service calls

  // Tier 3: LLM Judge
  llmJudgeModel: 'gemini-2.0-flash-lite',

  // General
  verifyProperties: true, // Whether to verify individual properties
  maxPropertiesPerEntity: 20, // Limit to avoid excessive verification calls
};
```

## Risks / Trade-offs

| Risk                          | Mitigation                                          |
| ----------------------------- | --------------------------------------------------- |
| NLI service downtime          | Graceful degradation to Tier 3                      |
| NLI service latency           | Batch verification, configurable timeout            |
| False positives in Tier 1     | Conservative threshold (0.95), NLI backup           |
| LLM Judge costs               | Only used for uncertain NLI results (0.4-0.6 range) |
| Verification slows extraction | Run verification as post-processing, not inline     |

## Migration Plan

This change is additive - no existing functionality is modified or removed.

**Phase 1: Infrastructure (emergent-infra)**

1. Create NLI verifier Docker service
2. Add to docker-compose
3. Verify health endpoint and prediction API

**Phase 2: Test Scripts (emergent)**

1. Create verification library
2. Create test scripts
3. Run experiments on sample documents
4. Tune thresholds based on results

**Phase 3: Pipeline Integration (future change)**

1. Replace confidence-scorer.service.ts
2. Add verification results to extraction output
3. Add UI settings for verification configuration

## Open Questions

1. **Batch vs streaming NLI calls?** - Start with individual calls, optimize to batch if latency is an issue
2. **Cache NLI results?** - Consider caching for repeated text patterns
3. **Verification audit trail format?** - Define in pipeline integration phase
