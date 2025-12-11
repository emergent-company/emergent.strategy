# Tasks: Add Extraction Verification Cascade

## Phase 1: NLI Infrastructure (emergent-infra)

- [ ] 1.1 Create `nli-verifier/` directory in emergent-infra repository
- [ ] 1.2 Create `requirements.txt` with transformers, torch, fastapi, uvicorn
- [ ] 1.3 Create `app/model.py` - DeBERTa model loading and inference
- [ ] 1.4 Create `app/main.py` - FastAPI endpoints (/predict, /health)
- [ ] 1.5 Create `Dockerfile` for CPU-optimized Python image
- [ ] 1.6 Create `docker-compose.yaml` for local development
- [ ] 1.7 Create `.env.example` with configuration options
- [ ] 1.8 Create `README.md` with setup and usage instructions
- [ ] 1.9 Test NLI service locally with sample premises/hypotheses
- [ ] 1.10 Add NLI service to main emergent-infra docker-compose

## Phase 2: Verification Library (emergent)

- [ ] 2.1 Create `scripts/extraction_tests/lib/verification/` directory
- [ ] 2.2 Create `types.ts` - VerificationConfig, VerificationResult, PropertyVerificationResult
- [ ] 2.3 Create `exact-match.ts` - Tier 1 Levenshtein matching implementation
- [ ] 2.4 Create `nli-verifier.ts` - Tier 2 NLI service client with timeout/fallback
- [ ] 2.5 Create `llm-judge.ts` - Tier 3 Gemini-based verification
- [ ] 2.6 Create `cascade.ts` - Orchestrator combining all tiers
- [ ] 2.7 Create `index.ts` - Main exports
- [ ] 2.8 Add fast-levenshtein package to scripts dependencies (or implement)

## Phase 3: Test Scripts (emergent)

- [ ] 3.1 Create `scripts/extraction_tests/tests/verification/` directory
- [ ] 3.2 Create `test-exact-match.test.ts` - Unit tests for Tier 1
- [ ] 3.3 Create `test-nli-verifier.test.ts` - Integration tests for Tier 2
- [ ] 3.4 Create `test-llm-judge.test.ts` - Integration tests for Tier 3
- [ ] 3.5 Create `test-verification-cascade.test.ts` - End-to-end cascade tests
- [ ] 3.6 Create `test-extraction-with-verification.test.ts` - Full extraction + verification

## Phase 4: Documentation

- [ ] 4.1 Update scripts/extraction_tests/README.md with verification usage
- [ ] 4.2 Document verification thresholds and tuning guidance
- [ ] 4.3 Add verification examples to extraction test documentation
