# Extraction Entity-Linking E2E Tests - LLM Setup Guide

## Overview

The extraction entity-linking E2E tests (`apps/server/tests/e2e/extraction.entity-linking.e2e.spec.ts`) validate that the entity-linking logic works correctly within the full extraction pipeline. These tests require a configured LLM provider to run.

## Current Status

- **Tests**: 4 skipped (require LLM configuration)
- **Unit Test Coverage**: ✅ Entity-linking logic is fully tested in `entity-linking.service.spec.ts`
- **E2E Purpose**: Validate integration of entity-linking within the complete extraction workflow

## Why LLM is Required

These tests validate the complete extraction pipeline:

1. **Document → LLM Extraction** - LLM extracts entities from document content
2. **Entity Linking** - Extracted entities are matched against existing graph objects
3. **Decision Logic** - Skip (>90% overlap), Merge (≤90% overlap), or Create (no match)
4. **Graph Updates** - Objects are created/updated based on decisions

Without LLM configuration, step 1 cannot happen, making the tests non-functional.

## Test Scenarios

### 1. Skip Scenario (>90% Overlap)
**Given**: Existing object with properties: name, description, version, vendor, category  
**When**: LLM extracts entity with >90% matching properties  
**Then**: No new object created (skipped due to high overlap)

### 2. Merge Scenario (≤90% Overlap)
**Given**: Existing object with minimal properties: name, description  
**When**: LLM extracts entity with additional properties  
**Then**: Properties merged into existing object (≤90% overlap threshold)

### 3. Create Scenario (No Match)
**Given**: No existing objects  
**When**: LLM extracts new entity  
**Then**: New object created

### 4. Strategy Comparison
**Given**: Existing object  
**When**: Testing `always_new` vs `key_match` strategies  
**Then**: Different outcomes based on strategy

## Setup Instructions

### Option 1: Google Generative AI (Simpler)

1. Get API key from https://makersuite.google.com/app/apikey
2. Set environment variable:
   ```bash
   export GOOGLE_API_KEY=your_key_here
   ```
3. Run tests:
   ```bash
   npm --prefix apps/server run test:e2e -- extraction.entity-linking
   ```

### Option 2: Google Vertex AI (Production)

1. Set up Google Cloud Project with Vertex AI enabled
2. Configure Application Default Credentials:
   ```bash
   gcloud auth application-default login
   ```
3. Set environment variables:
   ```bash
   export GCP_PROJECT_ID=your_project_id
   export VERTEX_AI_LOCATION=us-central1
   export VERTEX_AI_MODEL=gemini-2.5-flash
   ```
4. Run tests:
   ```bash
   npm --prefix apps/server run test:e2e -- extraction.entity-linking
   ```

## Configuration Options

Environment variables for extraction worker:

```bash
# Required (one of these)
GOOGLE_API_KEY=<api-key>           # Google Generative AI
# OR
GCP_PROJECT_ID=<project-id>        # Google Vertex AI

# Optional (Vertex AI)
VERTEX_AI_LOCATION=us-central1     # GCP region
VERTEX_AI_MODEL=gemini-2.5-flash   # Model version

# Optional (Worker Configuration)
EXTRACTION_WORKER_ENABLED=true
EXTRACTION_ENTITY_LINKING_STRATEGY=key_match  # or: always_new, vector_similarity
EXTRACTION_RATE_LIMIT_RPM=10
EXTRACTION_RATE_LIMIT_TPM=10000
```

## Alternative Testing Approach

If you don't want to configure LLM:

1. **Use Unit Tests** - Entity-linking logic is comprehensively tested in `entity-linking.service.spec.ts`
2. **Mock LLM in E2E** - Future enhancement: mock LLM responses for deterministic E2E testing
3. **Skip E2E Tests** - Current approach: tests are skipped when LLM not configured

## Cost Considerations

- **Google Generative AI**: Free tier available, pay-per-use after limits
- **Vertex AI**: Pay-per-use pricing, no free tier
- **Test Impact**: 4 tests × 1 document each = 4 LLM calls per run

## Troubleshooting

### Tests Still Skipping

Check environment variables are set:
```bash
echo $GOOGLE_API_KEY
echo $GCP_PROJECT_ID
```

### Authentication Errors

For Vertex AI, ensure Application Default Credentials are configured:
```bash
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### Rate Limit Errors

Reduce concurrent test execution or increase rate limits:
```bash
export EXTRACTION_RATE_LIMIT_RPM=5
export EXTRACTION_RATE_LIMIT_TPM=5000
```

## Related Documentation

- `docs/EXTRACTION_ENTITY_LINKING_E2E_DESIGN.md` - Test design analysis
- `apps/server/src/modules/extraction-jobs/entity-linking.service.spec.ts` - Unit tests
- `apps/server/src/modules/extraction-jobs/README.md` - Extraction system overview

## Future Improvements

1. **Mock LLM Provider** - Create test implementation for deterministic E2E tests
2. **Test Data Fixtures** - Pre-extracted entity responses for consistent testing
3. **Integration Test Mode** - Run subset of tests without external API dependencies
4. **CI/CD Integration** - Configure LLM credentials in GitHub Actions secrets

## Summary

These E2E tests validate that entity-linking works correctly in production-like conditions. While entity-linking logic is thoroughly tested at the unit level, these E2E tests ensure the integration with document loading, LLM extraction, and graph updates works end-to-end.

**For most development**: Unit tests provide sufficient coverage.  
**For production validation**: Configure LLM and run E2E tests before major releases.
