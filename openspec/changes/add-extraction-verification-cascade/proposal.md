# Change: Add Extraction Verification Cascade

## Why

The current extraction pipeline uses LLM-based heuristic confidence scoring that is:

1. **Unreliable** - LLM self-assessment of extraction quality is not grounded in evidence
2. **Expensive** - Every extracted entity requires LLM calls for confidence estimation
3. **Unverifiable** - No audit trail showing why a confidence score was assigned

We need a verification system that measures extraction quality against source text using progressively more expensive verification methods, only escalating when cheaper methods are inconclusive.

## What Changes

- **NEW: 3-Tier Verification Cascade**

  - **Tier 1: Exact/Fuzzy Match** ($0) - Levenshtein distance for names, dates, IDs, quotes
  - **Tier 2: NLI Verification** (~$) - Self-hosted DeBERTa-v3-small for semantic entailment
  - **Tier 3: LLM Judge** (~$$) - Gemini Flash only when NLI scores in uncertainty range (0.4-0.6)

- **NEW: NLI Model Infrastructure** (in `emergent-infra` repository)

  - FastAPI service hosting `cross-encoder/nli-deberta-v3-small` (44M params)
  - Docker Compose deployment with health checks
  - CPU-optimized for cost-effective self-hosting

- **NEW: Verification Library** (in extraction test scripts)

  - Modular verification library at `scripts/extraction_tests/lib/verification/`
  - Test scripts for experimentation before pipeline integration
  - Graceful degradation when NLI service unavailable

- **FUTURE: Pipeline Integration** (not in this change)
  - Replace `confidence-scorer.service.ts` with verification cascade
  - Per-project verification settings in UI
  - Verification audit trail in extraction results

## Impact

- **Affected specs:** None (new capability)
- **Affected code:**
  - `emergent-infra/` - New NLI verifier service
  - `scripts/extraction_tests/lib/verification/` - New verification library
  - `scripts/extraction_tests/tests/verification/` - New test scripts
- **Dependencies:**
  - Hugging Face Transformers (Python, for NLI model)
  - FastAPI (Python, for NLI service)
  - No new dependencies in main `emergent` repo (uses existing Gemini for Tier 3)
- **Risk:** Low - Experimental implementation in test scripts first, isolated from main pipeline
